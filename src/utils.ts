import { App, normalizePath, Platform } from 'obsidian';

export function arrayBufferToBase64 (buffer: ArrayBuffer) {
  const uint8Array = new Uint8Array(buffer);

  let binaryString = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binaryString += String.fromCharCode(uint8Array[i]);
  }

  const base64String = btoa(binaryString);

  return base64String;
}

export function downloadBlob (blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  const a = createEl('a');

  a.href = url;
  a.download = filename || 'download';

  const clickHandler = () => {
    activeWindow.setTimeout(() => {
      URL.revokeObjectURL(url);
      // @ts-expect-error `this` is unknown to TS in this context.
      this.removeEventListener('click', clickHandler);
    }, 150);
  };

  a.addEventListener('click', clickHandler, false);

  a.click();
}

/**
 * Copies HTML to the clipboard, with a plain text fallback.
 *
 * Obsidian's mobile WebViews do not reliably support the Async Clipboard API
 * with rich content, so the selection-based `execCommand` approach is preferred
 * on mobile and used as a fallback everywhere else.
 *
 * @param html The HTML representation of the content.
 * @param text The plain text representation of the content.
 */
export async function copyHtmlToClipboard (html: string, text: string): Promise<void> {
  if (Platform.isMobileApp && copyHtmlWithExecCommand(html)) {
    return;
  }

  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write !== undefined) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return;
    } catch (err) {
      console.warn('Could not write rich HTML to the clipboard using the Async Clipboard API. Falling back.', err);
    }
  }

  if (!copyHtmlWithExecCommand(html)) {
    throw new Error('Copying HTML to the clipboard is not supported on this platform.');
  }
}

/**
 * Copies HTML to the clipboard by selecting an offscreen element and invoking
 * the deprecated (but widely supported, including on mobile) `execCommand`.
 * The browser derives both the `text/html` and `text/plain` flavors from the
 * selection, so no plain text variant is needed here.
 *
 * @param html The HTML to copy.
 * @returns Whether the copy succeeded.
 */
function copyHtmlWithExecCommand (html: string): boolean {
  const container = activeDocument.createElement('div');
  container.setAttribute('contenteditable', 'true');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-9999px';
  container.innerHTML = html;
  activeDocument.body.appendChild(container);

  const selection = activeWindow.getSelection();
  let succeeded = false;

  try {
    const range = activeDocument.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    succeeded = activeDocument.execCommand('copy');
  } catch (err) {
    console.warn('Could not copy HTML to the clipboard.', err);
  } finally {
    selection?.removeAllRanges();
    container.remove();
  }

  return succeeded;
}

/**
 * Saves text content to a new file inside the vault.
 *
 * This is used on mobile, where triggering a browser download is not possible.
 * If a file with the same name already exists, a numeric suffix is appended so
 * that existing files are never overwritten.
 *
 * @param app The Obsidian app instance.
 * @param content The text content to write.
 * @param filename The desired file name, including its extension.
 * @param folderPath The vault folder to write to (`/` for the vault root).
 * @returns The vault path of the created file.
 */
export async function saveTextFileToVault (app: App, content: string, filename: string, folderPath: string): Promise<string> {
  const dotIndex = filename.lastIndexOf('.');
  const baseName = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
  const extension = dotIndex === -1 ? '' : filename.slice(dotIndex);

  const buildPath = (name: string): string => (folderPath === '' || folderPath === '/' ? normalizePath(name) : normalizePath(`${folderPath}/${name}`));

  let path = buildPath(filename);
  let index = 1;

  while (app.vault.getAbstractFileByPath(path) !== null) {
    path = buildPath(`${baseName} (${index})${extension}`);
    index++;
  }

  await app.vault.create(path, content);

  return path;
}
