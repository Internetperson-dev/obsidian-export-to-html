/* eslint-disable no-new -- Required for notices, as ESLint disallow new operators outside of assignments or comparisons. */
import { Editor, MarkdownFileInfo, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import css from './css.js';
import { copyHtmlToClipboard, downloadBlob, saveTextFileToVault } from './utils.js';
import HtmlRenderer from './HtmlRenderer.js';

const customCss = `
.markdown-body {
  box-sizing: border-box;
  min-width: 200px;
  max-width: 980px;
  margin: 0 auto;
  padding: 45px;
}

@media (max-width: 767px) {
  .markdown-body {
    padding: 15px;
  }
}`;

export default class ExportToHtmlPlugin extends Plugin {
  async onload () {
    this.addCommand({
      id: 'copy-to-clipboard-as-html',
      name: 'Copy to clipboard as HTML',
      editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        if (!('data' in view)) return;

        const htmlRenderer = new HtmlRenderer(this.app, this);
        const { html, text } = await htmlRenderer.render(view.data);

        try {
          await copyHtmlToClipboard(html, text);
        } catch (err) {
          new Notice(`Content could not be copied to clipboard. [${err instanceof Error ? err.message : 'unknown'}].`);
          return;
        }

        new Notice('HTML content copied to clipboard!');
      }
    });

    this.addCommand({
      id: 'download-as-html',
      name: 'Download as an HTML file',
      editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        if (!('data' in view)) return;

        const htmlRenderer = new HtmlRenderer(this.app, this);
        const { html } = await htmlRenderer.render(view.data);

        const wrappedHtml = `<!doctype html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${view.file?.name} | Exported</title>
    <style>
      ${css}
      ${customCss}
    </style>
  </head>
  <body class="markdown-body">
    ${html}
  </body>
</html>`;

        const filename = `${view.file?.basename ?? 'markdown'}.html`;

        // Mobile WebViews cannot trigger a browser download, so save the file
        // inside the vault instead (next to the exported note).
        if (Platform.isMobileApp) {
          try {
            const path = await saveTextFileToVault(this.app, wrappedHtml, filename, view.file?.parent?.path ?? '/');
            new Notice(`HTML file saved to "${path}".`);
          } catch (err) {
            new Notice(`Could not save the HTML file. [${err instanceof Error ? err.message : 'unknown'}].`);
          }
          return;
        }

        const blob = new Blob(
          [wrappedHtml],
          { type: 'text/html' }
        );

        downloadBlob(blob, filename);
      }
    });
  }
}
