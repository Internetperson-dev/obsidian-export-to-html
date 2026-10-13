import { App, arrayBufferToBase64, Component, MarkdownRenderer, TFile } from 'obsidian';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'bmp'];

export default class HtmlRenderer {
  private app: App;
  private component: Component;

  constructor (app: App, component: Component) {
    this.app = app;
    this.component = component;
  }

  /**
   * Converts an image path to the image in base 64.
   *
   * Example of image path: app://80af27eb9c79555ea45e4c97f31cb3fa7726/C:/Users/kalvn/workspace/notes/dev/leon.png?1727120544660
   * @param imagePath The image path as returned by the MarkdownRenderer.
   * @returns The base 64 representation of the image.
   */
  private async convertImageToBase64String (imagePath: string): Promise<string> {
    const vault = this.app.vault;
    const images = vault.getFiles().filter(file => IMAGE_EXTENSIONS.includes(file.extension));

    const fileNameWithTimestamp = imagePath.split('/').at(-1);
    const fileName = fileNameWithTimestamp?.split('?').at(0);
    const timestamp = fileNameWithTimestamp?.split('?').at(1);

    let file: TFile | undefined;

    for (const image of images) {
      if (fileName !== undefined && timestamp !== undefined && image.name === decodeURIComponent(fileName) && image.stat.mtime === parseInt(timestamp)) {
        file = image;
        break;
      }
    }

    if (file === undefined) {
      console.error(`Could not find image [${imagePath}]. Skipping.`);
      return '';
    }

    const buffer = await vault.adapter.readBinary(decodeURIComponent(file.path));
    return `data:image/png;base64,${arrayBufferToBase64(buffer)}`;
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

  async render (markdownContent: string): Promise<{ html: string; text: string }> {
    const el = activeDocument.body.createDiv();
    await MarkdownRenderer.render(this.app, markdownContent, el, '.', this.component);

    // Remove copy-code buttons.
    el.querySelectorAll('.copy-code-button').forEach(e => {
      e.remove();
    });

    // Convert internal images to base 64 strings. External (http/https) and
    // already inlined (data:) images are left untouched.
    for (const img of Array.from(el.querySelectorAll('img'))) {
      const attributeSrc = img.getAttribute('src');
      if (attributeSrc === null) continue;

      // The renderer may output either an absolute `app://` URL or a relative
      // path that resolves against Obsidian's internal protocol.
      const src = attributeSrc.startsWith('app://') ? attributeSrc : img.src;
      if (!src.startsWith('app://')) continue;

      const base64 = await this.convertImageToBase64String(src);
      if (base64 !== '') {
        img.src = base64;
      } else {
        // Do not leave the original local resource URL behind.
        img.removeAttribute('src');
      }
    }

    // Strip any remaining reference to local resources to avoid leaking paths.
    this.stripAppProtocolUrls(el);

    /**
     * Wait some time to let the browser finish the painting flow.
     * Explanation: https://macarthur.me/posts/when-dom-updates-appear-to-be-asynchronous/
     */
    await new Promise((resolve) => {
      activeWindow.setTimeout(() => {
        resolve(null);
      }, 100);
    });

    const html = el.innerHTML;
    const text = el.innerText;

    // Remove the temporary element once its content has been captured.
    el.remove();

    return { html, text };
  }
}
