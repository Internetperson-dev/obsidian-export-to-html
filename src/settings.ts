import { App, Platform, PluginSettingTab, Setting } from 'obsidian';
import type ExportToHtmlPlugin from './main.js';
import { getToolStatus } from './media.js';

export type VideoCodecPreference = 'auto' | 'av1' | 'h264' | 'both';

export interface ExportToHtmlSettings {
  lazyLoadYouTube: boolean;
  convertImagesToAvif: boolean;
  convertVideos: boolean;
  videoCodec: VideoCodecPreference;
  maxVideoSizeMb: number;
}

export const DEFAULT_SETTINGS: ExportToHtmlSettings = {
  lazyLoadYouTube: true,
  convertImagesToAvif: true,
  convertVideos: true,
  videoCodec: 'auto',
  maxVideoSizeMb: 50,
};

export class ExportToHtmlSettingTab extends PluginSettingTab {
  private readonly plugin: ExportToHtmlPlugin;

  constructor (app: App, plugin: ExportToHtmlPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display (): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Lazy-load YouTube embeds')
      .setDesc('Show a click-to-play thumbnail instead of loading the YouTube player immediately.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.lazyLoadYouTube)
        .onChange(async value => {
          this.plugin.settings.lazyLoadYouTube = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Convert images to AVIF')
      .setDesc('Re-encode embedded images as AVIF for smaller files. Desktop only (requires avifenc or ffmpeg).')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.convertImagesToAvif)
        .onChange(async value => {
          this.plugin.settings.convertImagesToAvif = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Convert videos')
      .setDesc('Transcode embedded videos and inline them in the HTML. Desktop only (requires ffmpeg). Can take a while.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.convertVideos)
        .onChange(async value => {
          this.plugin.settings.convertVideos = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Video codec')
      .setDesc('AV1 offers the best compression. "Auto" uses AV1 when this browser supports it, otherwise H.264. "Both" embeds both variants.')
      .addDropdown(dropdown => dropdown
        .addOptions({
          auto: 'Auto (browser support)',
          av1: 'AV1',
          h264: 'H.264',
          both: 'Both (AV1 + H.264)',
        })
        .setValue(this.plugin.settings.videoCodec)
        .onChange(async value => {
          this.plugin.settings.videoCodec = value as VideoCodecPreference;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Maximum video size (MB)')
      .setDesc('Videos larger than this are left out of the export.')
      .addText(text => text
        .setValue(String(this.plugin.settings.maxVideoSizeMb))
        .onChange(async value => {
          const parsed = Number.parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            this.plugin.settings.maxVideoSizeMb = parsed;
            await this.plugin.saveSettings();
          }
        }));

    const statusEl = containerEl.createDiv({ cls: 'setting-item-description' });
    statusEl.setText('Checking for media tools…');

    if (!Platform.isDesktopApp) {
      statusEl.setText('Image and video conversion is only available on desktop.');
      return;
    }

    getToolStatus().then(status => {
      const tools: string[] = [];
      if (status.avifenc) tools.push('avifenc');
      if (status.ffmpeg) tools.push('ffmpeg');

      statusEl.setText(tools.length > 0
        ? `Detected media tools: ${tools.join(', ')}.`
        : 'No media tools detected. Install ffmpeg (and optionally avifenc) to enable image and video conversion.');
    }).catch(error => {
      console.error('Could not detect the media tools.', error);
      statusEl.setText('Could not detect the media tools.');
    });
  }
}
