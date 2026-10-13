/* eslint-disable no-new -- Required for notices, as ESLint disallow new operators outside of assignments or comparisons. */
import { Editor, MarkdownFileInfo, MarkdownView, Notice, Platform, Plugin } from 'obsidian';
import css from './css.js';
import { copyHtmlToClipboard, downloadBlob, saveTextFileToVault } from './utils.js';
import HtmlRenderer from './HtmlRenderer.js';
import { DEFAULT_SETTINGS, ExportToHtmlSettingTab, type ExportToHtmlSettings } from './settings.js';
import { YOUTUBE_LAZY_LOAD_SCRIPT } from './youtube.js';

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
  settings: ExportToHtmlSettings = DEFAULT_SETTINGS;

  async onload () {
    await this.loadSettings();

    this.addSettingTab(new ExportToHtmlSettingTab(this.app, this));

    this.addCommand({
      id: 'copy-to-clipboard-as-html',
      name: 'Copy to clipboard as HTML',
      editorCallback: async (_editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        if (!('data' in view)) return;

        const htmlRenderer = new HtmlRenderer(this.app, this);
        const { html, text } = await htmlRenderer.render(view.data, {
          sourcePath: view.file?.path ?? '/',
          settings: this.settings,
        });

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
        const { html, hasYouTubeEmbeds } = await htmlRenderer.render(view.data, {
          sourcePath: view.file?.path ?? '/',
          settings: this.settings,
        });

        const wrappedHtml = this.wrapHtml(html, view.file?.name, hasYouTubeEmbeds);
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

  async loadSettings () {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings () {
    await this.saveData(this.settings);
  }

  private wrapHtml (html: string, noteName: string | undefined, hasYouTubeEmbeds: boolean): string {
    const lazyLoadScript = this.settings.lazyLoadYouTube && hasYouTubeEmbeds
      ? `<script>\n${YOUTUBE_LAZY_LOAD_SCRIPT}\n</script>`
      : '';

    return `<!doctype html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${noteName} | Exported</title>
    <style>
      ${css}
      ${customCss}
    </style>
  </head>
  <body class="markdown-body">
    ${html}
    ${lazyLoadScript}
  </body>
</html>`;
  }
}
