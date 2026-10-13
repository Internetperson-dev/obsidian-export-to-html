import { App, arrayBufferToBase64, Component, FileSystemAdapter, MarkdownRenderer, Notice, Platform, TFile } from 'obsidian';
import { getPreferredVideoCodec, supportsAvifImage } from './codecSupport.js';
import { convertImageToAvif, convertVideo, getToolStatus, type VideoCodec } from './media.js';
import type { ExportToHtmlSettings } from './settings.js';
import { createYouTubeFacade, parseYouTubeEmbed } from './youtube.js';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'gif', 'svg'];
const AVIF_CONVERTIBLE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'ogv', '3gp'];

const IMAGE_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  bmp: 'image/bmp',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

export interface RenderOptions {
  sourcePath: string;
  settings: ExportToHtmlSettings;
}

export interface RenderResult {
  html: string;
  text: string;
  hasYouTubeEmbeds: boolean;
}

export default class HtmlRenderer {
  private app: App;
  private component: Component;

  constructor (app: App, component: Component) {
    this.app = app;
    this.component = component;
  }

  /**
   * Finds the vault file matching the image path returned by the renderer.
   *
   * Example of image path: app://80af27eb9c79555ea45e4c97f31cb3fa7726/C:/Users/kalvn/workspace/notes/dev/leon.png?1727120544660
   */
  private findImageFile (imagePath: string): TFile | undefined {
    const images = this.app.vault.getFiles().filter(file => IMAGE_EXTENSIONS.includes(file.extension.toLowerCase()));

    const fileNameWithTimestamp = imagePath.split('/').at(-1);
    const fileName = fileNameWithTimestamp?.split('?').at(0);
    const timestamp = fileNameWithTimestamp?.split('?').at(1);

    for (const image of images) {
      if (fileName !== undefined && timestamp !== undefined && image.name === decodeURIComponent(fileName) && image.stat.mtime === parseInt(timestamp)) {
        return image;
      }
    }

    return undefined;
  }

  /**
   * Returns the absolute path of a vault file, or `null` when the vault is not
   * backed by the local file system (mobile).
   */
  private getAbsolutePath (file: TFile): string | null {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getFullPath(file.path);
    }

    return null;
  }

  /**
   * Converts an image to a base 64 data URI, re-encoding it to AVIF when enabled
   * and supported.
   */
  private async convertImageToDataUri (imagePath: string, settings: ExportToHtmlSettings): Promise<string | null> {
    const file = this.findImageFile(imagePath);
    if (file === undefined) {
      console.error(`Could not find image [${imagePath}]. Skipping.`);
      return null;
    }

    const extension = file.extension.toLowerCase();
    const buffer = await this.app.vault.adapter.readBinary(file.path);

    if (settings.convertImagesToAvif && AVIF_CONVERTIBLE_EXTENSIONS.includes(extension) && await supportsAvifImage()) {
      const absolutePath = this.getAbsolutePath(file);
      if (absolutePath !== null) {
        const avif = await convertImageToAvif(absolutePath);
        // Only use the AVIF version when it actually saves space.
        if (avif !== null && avif.byteLength < buffer.byteLength) {
          return `data:image/avif;base64,${avif.toString('base64')}`;
        }
      }
    }

    const mimeType = IMAGE_MIME_TYPES[extension] ?? 'application/octet-stream';

    return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
  }

  /**
   * Resolves the vault file referenced by an internal embed, tolerating both
   * raw and URL-encoded link paths.
   */
  private resolveEmbedFile (linkPath: string, sourcePath: string): TFile | null {
    const candidates = [linkPath];

    try {
      const decoded = decodeURIComponent(linkPath);
      if (decoded !== linkPath) {
        candidates.push(decoded);
      }
    } catch {
      // Ignore malformed encodings and keep the raw value.
    }

    for (const candidate of candidates) {
      const file = this.app.metadataCache.getFirstLinkpathDest(candidate, sourcePath);
      if (file !== null) {
        return file;
      }
    }

    return null;
  }

  /**
   * Determines the codec(s) to encode for the requested preference.
   * `all` is `true` when every codec should be produced (the "both" mode).
   */
  private getCodecOrder (settings: ExportToHtmlSettings): { codecs: VideoCodec[]; all: boolean } {
    if (settings.videoCodec === 'both') {
      return { codecs: ['av1', 'h264'], all: true };
    }

    if (settings.videoCodec === 'auto') {
      const preferred = getPreferredVideoCodec();
      // Fall back to the other codec if the preferred encoder is unavailable.
      return { codecs: [preferred, preferred === 'av1' ? 'h264' : 'av1'], all: false };
    }

    return { codecs: [settings.videoCodec], all: false };
  }

  /**
   * Transcodes an embedded video and inlines it as base 64. Returns whether the
   * video was successfully processed.
   */
  private async inlineVideo (videoEl: HTMLVideoElement, absolutePath: string, settings: ExportToHtmlSettings): Promise<boolean> {
    const maxBytes = settings.maxVideoSizeMb * 1024 * 1024;
    const { codecs, all } = this.getCodecOrder(settings);

    const sources: Array<{ codec: VideoCodec; dataUri: string }> = [];

    for (const codec of codecs) {
      const buffer = await convertVideo(absolutePath, codec);
      if (buffer === null) {
        continue;
      }

      if (buffer.byteLength > maxBytes) {
        console.warn(`Converted video is larger than ${settings.maxVideoSizeMb} MB. Skipping.`);
        continue;
      }

      sources.push({ codec, dataUri: `data:video/mp4;base64,${buffer.toString('base64')}` });

      if (!all) {
        break;
      }
    }

    if (sources.length === 0) {
      return false;
    }

    // Drop any leftover local reference and existing sources.
    videoEl.removeAttribute('src');
    videoEl.querySelectorAll('source').forEach(source => source.remove());

    if (sources.length === 1) {
      videoEl.setAttribute('src', sources[0].dataUri);
    } else {
      for (const source of sources) {
        const sourceEl = activeDocument.createElement('source');
        sourceEl.setAttribute('src', source.dataUri);
        sourceEl.setAttribute('type', source.codec === 'av1' ? 'video/mp4; codecs="av01.0.05M.08"' : 'video/mp4; codecs="avc1.42E01E"');
        videoEl.appendChild(sourceEl);
      }
    }

    return true;
  }

  /**
   * Transcodes every embedded video, inlining the result. This must run before
   * the `app://` URLs are stripped, since the location of the source file is
   * read from the embed.
   */
  private async inlineVideos (el: HTMLElement, settings: ExportToHtmlSettings, sourcePath: string): Promise<void> {
    if (!settings.convertVideos || !Platform.isDesktopApp) {
      return;
    }

    const embeds: Array<{ embed: HTMLElement; videoEl: HTMLVideoElement; file: TFile }> = [];

    for (const embed of Array.from(el.querySelectorAll<HTMLElement>('.internal-embed'))) {
      const videoEl = embed.querySelector('video');
      const linkPath = embed.getAttribute('src');
      if (videoEl === null || linkPath === null) {
        continue;
      }

      const file = this.resolveEmbedFile(linkPath, sourcePath);
      if (file === null || !VIDEO_EXTENSIONS.includes(file.extension.toLowerCase())) {
        continue;
      }

      embeds.push({ embed, videoEl, file });
    }

    if (embeds.length === 0) {
      return;
    }

    const status = await getToolStatus();
    if (!status.ffmpeg) {
      console.warn('ffmpeg was not found. Videos will not be converted.');
      return;
    }

    const notice = new Notice(`Converting ${embeds.length} video(s) with ffmpeg…`, 0);

    try {
      for (const { embed, videoEl, file } of embeds) {
        if (file.stat.size > settings.maxVideoSizeMb * 1024 * 1024) {
          console.warn(`Skipping "${file.name}": larger than ${settings.maxVideoSizeMb} MB.`);
          continue;
        }

        const absolutePath = this.getAbsolutePath(file);
        if (absolutePath === null) {
          continue;
        }

        if (await this.inlineVideo(videoEl, absolutePath, settings)) {
          // The video is now self-contained, so drop the leftover local reference.
          embed.removeAttribute('src');
        }
      }
    } finally {
      notice.hide();
    }
  }

  /**
   * Replaces every YouTube iframe with a lightweight click-to-play facade.
   * @returns Whether at least one embed was replaced.
   */
  private replaceYouTubeEmbeds (el: HTMLElement): boolean {
    let replaced = false;

    for (const iframe of Array.from(el.querySelectorAll('iframe'))) {
      const source = iframe.getAttribute('src');
      if (source === null) {
        continue;
      }

      const embed = parseYouTubeEmbed(source);
      if (embed === null) {
        continue;
      }

      iframe.replaceWith(createYouTubeFacade(embed));
      replaced = true;
    }

    return replaced;
  }

  /**
   * Removes every attribute referencing Obsidian's internal `app://` protocol.
   *
   * Those URLs embed the user's absolute local file paths (and a timestamp),
   * which would leak sensitive data about the machine when the HTML is shared.
   * This covers media embeds (`<video>`, `<audio>`, `<source>`, ...), internal
   * links and any `data-*` attribute the Markdown renderer may add.
   * @param el The root element of the rendered Markdown.
   */
  private stripAppProtocolUrls (el: HTMLElement): void {
    const elements: Element[] = [el, ...Array.from(el.querySelectorAll('*'))];

    for (const element of elements) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.value.includes('app://')) {
          element.removeAttribute(attribute.name);
        }
      }
    }
  }

  async render (markdownContent: string, options: RenderOptions): Promise<RenderResult> {
    const el = activeDocument.body.createDiv();
    await MarkdownRenderer.render(this.app, markdownContent, el, options.sourcePath, this.component);

    /**
     * Wait some time to let the browser finish the painting flow (and let
     * asynchronous embeds settle) before transforming the content.
     * Explanation: https://macarthur.me/posts/when-dom-updates-appear-to-be-asynchronous/
     */
    await new Promise((resolve) => {
      activeWindow.setTimeout(() => {
        resolve(null);
      }, 100);
    });

    // Remove copy-code buttons.
    el.querySelectorAll('.copy-code-button').forEach(e => {
      e.remove();
    });

    // Inline embedded videos before the `app://` URLs are stripped.
    await this.inlineVideos(el, options.settings, options.sourcePath);

    // Convert internal images to base 64 strings. External (http/https) and
    // already inlined (data:) images are left untouched.
    for (const img of Array.from(el.querySelectorAll('img'))) {
      const attributeSrc = img.getAttribute('src');
      if (attributeSrc === null) continue;

      // The renderer may output either an absolute `app://` URL or a relative
      // path that resolves against Obsidian's internal protocol.
      const src = attributeSrc.startsWith('app://') ? attributeSrc : img.src;
      if (!src.startsWith('app://')) continue;

      const dataUri = await this.convertImageToDataUri(src, options.settings);
      if (dataUri !== null) {
        img.src = dataUri;
      } else {
        // Do not leave the original local resource URL behind.
        img.removeAttribute('src');
      }
    }

    const hasYouTubeEmbeds = options.settings.lazyLoadYouTube ? this.replaceYouTubeEmbeds(el) : false;

    // Strip any remaining reference to local resources to avoid leaking paths.
    this.stripAppProtocolUrls(el);

    const html = el.innerHTML;
    const text = el.innerText;

    // Remove the temporary element once its content has been captured.
    el.remove();

    return { html, text, hasYouTubeEmbeds };
  }
}
