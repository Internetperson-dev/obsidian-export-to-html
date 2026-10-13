# Export to HTML for Obsidian
This [Obsidian](https://obsidian.md) community plugin allows you to export the content of a note as HTML, either to the clipboard or to a new HTML file.

During the export, images and videos are copied over in base 64 format, so the resulting HTML file is self-contained.

Local resource references (Obsidian's internal `app://` URLs, which embed absolute file paths) are removed from the exported HTML so they cannot leak sensitive information about your machine.

This plugin is a work in progress but it already works great in most cases. Some edge cases with inline image exports will be improved.

This plugin works on both desktop and mobile. The optional media conversions described below rely on the system `ffmpeg` (and `avifenc`) binaries, so they are only available on desktop. On mobile, images and videos are inlined as-is.

## Media optimization
The plugin can optimize the exported media (all of this is configurable in the plugin settings):

- **AVIF images** — embedded images are re-encoded to AVIF when `avifenc` (preferred) or `ffmpeg` is available. The original image is kept whenever the AVIF version is not smaller.
- **AV1 / H.264 videos** — embedded videos are transcoded with `ffmpeg` and inlined. The codec is chosen from the browser's codec support flags (AV1 when supported, H.264 otherwise), or forced to AV1, H.264, or both.
- **Lazy-loaded YouTube embeds** — YouTube iframes are replaced with a click-to-play thumbnail so the player is only loaded once the thumbnail is clicked (in the downloaded HTML file).
- Videos larger than the configured size limit are left out of the export.

## Installation
Follow the steps below to install **Obsidian Export to HTML**.

1. Search for *Export to HTML* in Obsidian's community plugins browser
2. Enable the plugin in your Obsidian settings (find *Export to HTML* under *Community plugins*).
3. (Optional) If you plan to use it often, in the *Hotkeys* settings, search for *Export to HTML* and bind actions to keyboard shortcuts.

## How to use
Open the command palette (press <key>CTRL+P</key> if you use a keyboard) and type *Export to HTML*.

- Select *Export to HTML: Copy to clipboard as HTML* to copy your note as HTML in your clipboard. You can then paste it in an email or in a Word document and the style will be kept.
- Select *Export to HTML: Download as HTML* to download your note as an HTML file. On mobile, browser downloads are not available, so the file is saved inside your vault next to the note instead.

## Manual installation
- Download [the latest release](https://github.com/kalvn/obsidian-export-to-html/releases) and unzip it.
- Copy over `main.js`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/export-to-html/`.

## How to contribute
- Clone this repo.
- Make sure you use [Node](https://nodejs.org) version 16 or above (`node --version`).
- `npm install` to install dependencies.
- `npm run dev` to start compilation in watch mode.

## External packages used
- Starter template: [Obsidian sample plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- CSS: [Github Markdown CSS](https://github.com/sindresorhus/github-markdown-css)
