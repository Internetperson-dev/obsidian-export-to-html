import { Platform } from 'obsidian';

type ExecFileFunction = typeof import('child_process').execFile;
type FileSystemModule = typeof import('fs');
type OperatingSystemModule = typeof import('os');
type PathModule = typeof import('path');

interface NodeModules {
  execFile: ExecFileFunction;
  fs: FileSystemModule;
  os: OperatingSystemModule;
  path: PathModule;
}

let nodeModules: NodeModules | null = null;

/**
 * Lazily loads the Node.js modules used to run the system media tools.
 *
 * Those modules only exist on desktop, so they are loaded on demand (never at
 * module load time) to keep the plugin usable on mobile, where they are not
 * available.
 */
function getNodeModules (): NodeModules {
  if (nodeModules !== null) {
    return nodeModules;
  }

  nodeModules = {
    execFile: require('child_process').execFile,
    fs: require('fs'),
    os: require('os'),
    path: require('path'),
  };

  return nodeModules;
}

export interface ToolStatus {
  ffmpeg: boolean;
  avifenc: boolean;
}

let toolStatusPromise: Promise<ToolStatus> | null = null;

/**
 * Returns (and caches) which media encoding tools are available on the system.
 * Always resolves to `{ ffmpeg: false, avifenc: false }` on mobile.
 */
export async function getToolStatus (): Promise<ToolStatus> {
  if (!Platform.isDesktopApp) {
    return { ffmpeg: false, avifenc: false };
  }

  if (toolStatusPromise === null) {
    toolStatusPromise = detectTools();
  }

  return toolStatusPromise;
}

async function detectTools (): Promise<ToolStatus> {
  const [ffmpeg, avifenc] = await Promise.all([
    commandExists('ffmpeg', ['-hide_banner', '-version']),
    commandExists('avifenc', ['--version']),
  ]);

  return { ffmpeg, avifenc };
}

async function commandExists (command: string, args: string[]): Promise<boolean> {
  try {
    await run(command, args);
    return true;
  } catch {
    return false;
  }
}

function run (command: string, args: string[]): Promise<string> {
  const { execFile } = getNodeModules();

  return new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error !== null) {
        const details = String(stderr ?? '').trim() || error.message;
        reject(new Error(`${command} exited with an error: ${details}`));
        return;
      }

      resolve(stdout);
    });
  });
}

async function withTempDir<T> (prefix: string, callback: (directory: string) => Promise<T>): Promise<T> {
  const { fs, os, path } = getNodeModules();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

  try {
    return await callback(directory);
  } finally {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      console.warn('Could not remove the temporary directory.', error);
    }
  }
}

/**
 * Re-encodes an image to AVIF using `avifenc` (preferred) or `ffmpeg`.
 * @returns The AVIF bytes, or `null` if no tool is available or encoding failed.
 */
export async function convertImageToAvif (sourcePath: string): Promise<Buffer | null> {
  const status = await getToolStatus();
  if (!status.ffmpeg && !status.avifenc) {
    return null;
  }

  return withTempDir('obsidian-export-avif-', async (directory) => {
    const { fs, path } = getNodeModules();
    const outputPath = path.join(directory, 'image.avif');

    try {
      if (status.avifenc) {
        await run('avifenc', ['-q', '60', '-s', '8', sourcePath, outputPath]);
      } else {
        await run('ffmpeg', [
          '-hide_banner', '-loglevel', 'error', '-y',
          '-i', sourcePath,
          '-c:v', 'libaom-av1',
          '-still-picture', '1',
          '-crf', '30',
          '-b:v', '0',
          outputPath,
        ]);
      }
    } catch (error) {
      console.warn(`Could not convert "${sourcePath}" to AVIF.`, error);
      return null;
    }

    if (!fs.existsSync(outputPath)) {
      return null;
    }

    return fs.readFileSync(outputPath);
  });
}

export type VideoCodec = 'av1' | 'h264';

/**
 * Transcodes a video to the requested codec (in an MP4 container) using ffmpeg.
 * @returns The MP4 bytes, or `null` if ffmpeg is unavailable or encoding failed.
 */
export async function convertVideo (sourcePath: string, codec: VideoCodec): Promise<Buffer | null> {
  const status = await getToolStatus();
  if (!status.ffmpeg) {
    return null;
  }

  return withTempDir('obsidian-export-video-', async (directory) => {
    const { fs, path } = getNodeModules();
    const outputPath = path.join(directory, 'video.mp4');

    const codecArguments = codec === 'av1'
      ? ['-c:v', 'libsvtav1', '-crf', '35', '-preset', '8']
      : ['-c:v', 'libx264', '-crf', '23', '-preset', 'veryfast'];

    try {
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', sourcePath,
        ...codecArguments,
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        '-c:a', 'aac',
        '-b:a', '128k',
        outputPath,
      ]);
    } catch (error) {
      console.warn(`Could not convert "${sourcePath}" to ${codec}.`, error);
      return null;
    }

    if (!fs.existsSync(outputPath)) {
      return null;
    }

    return fs.readFileSync(outputPath);
  });
}
