// services/theaivoicegenerator_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'theaivoicegenerator_downloads');

class TheAIVoiceGeneratorService extends BaseAIService {
  constructor(name = 'TheAIVoiceGeneratorService', url = 'https://theaivoicegenerator.com/') {
    super(name, 'theaivoicegenerator_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith(this.url)) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a subpage: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals();
    // Conceptual: HandleLogin();
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateAudio(scriptSegment) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating audio for script (first 100 chars): "${scriptSegment.substring(0,100)}..."`);

    try {
      // Ensure on correct page, if site has specific tool paths
      // if (!this.page.url().includes('/text-to-speech-tool')) { // Example path
      //   await this.page.goto(this.url + '/text-to-speech-tool', { waitUntil: 'networkidle' });
      // }
      // Assuming the main page this.url is where TTS happens.
       if (!this.page.url().startsWith(this.url)) {
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000);

      // --- Text Input ---
      const textInputSelectors = [
        'textarea#textToSpeech',
        'textarea[name="text_to_convert"]',
        'textarea[aria-label*="Enter text" i]', // Case insensitive label search
        'div[contenteditable="true"][role="textbox"]'
      ];
      let textInputSelectorFound = null;
      for (const selector of textInputSelectors) {
        if (await this.page.isVisible(selector)) {
          textInputSelectorFound = selector;
          break;
        }
      }
      if (!textInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable text input field.`);
        throw new Error('Text input field not found on TheAIVoiceGenerator.com.');
      }

      await this.page.fill(textInputSelectorFound, scriptSegment);
      console.log(`[${this.serviceName}] Script segment filled into ${textInputSelectorFound}.`);

      // --- Voice Selection (Conceptual - Use Default) ---
      // console.warn(`[${this.serviceName}] Voice selection is conceptual. Using default voice.`);
      // Example:
      // const voiceMenuButton = 'button[aria-label*="voice" i]';
      // if (await this.page.isVisible(voiceMenuButton)) {
      //    await this.page.click(voiceMenuButton);
      //    await this.page.waitForTimeout(500); // Wait for dropdown
      //    await this.page.click('div[role="option"]:has-text("DefaultVoiceName")');
      // }


      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate Voice")',
        'button:has-text("Convert to Speech")',
        'button[type="submit"][id*="generate" i]',
        'button[aria-label*="generate speech" i]'
      ];
      let generateButtonSelectorFound = null;
      for (const selector of generateButtonSelectors) {
        if (await this.page.isVisible(selector)) {
          generateButtonSelectorFound = selector;
          break;
        }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable generate button.`);
        throw new Error('Generate button not found on TheAIVoiceGenerator.com.');
      }

      if (!(await this.page.isEnabled(generateButtonSelectorFound))) {
          console.warn(`[${this.serviceName}] Generate button (${generateButtonSelectorFound}) disabled. Waiting...`);
          await this.page.waitForFunction(selector => {
              const btn = document.querySelector(selector); return btn && !btn.disabled;
          }, generateButtonSelectorFound, {timeout: 10000}).catch(() => {
              throw new Error(`Generate button (${generateButtonSelectorFound}) remained disabled.`);
          });
      }
      await this.page.click(generateButtonSelectorFound);
      console.log(`[${this.serviceName}] Generation triggered with ${generateButtonSelectorFound}.`);

      // --- Wait for Audio and Download ---
      const downloadButtonSelectors = [
        'a[download][href*=".mp3"]',
        'button[aria-label*="Download" i]',
        'button:has-text("Download Audio")'
      ];
      let downloadButtonSelectorFound = null;
      console.log(`[${this.serviceName}] Waiting for audio to generate and download button (up to 3 mins)...`);

      await this.page.waitForFunction((selectors) =>
        selectors.some(selector => {
            const elem = document.querySelector(selector);
            return elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled;
        }),
        downloadButtonSelectors,
        { timeout: 180000 }
      );

      for (const selector of downloadButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          downloadButtonSelectorFound = selector;
          break;
        }
      }
      if (!downloadButtonSelectorFound) {
        throw new Error('Download button not found or not enabled after generation.');
      }
      console.log(`[${this.serviceName}] Found download button: ${downloadButtonSelectorFound}.`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelectorFound);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `theaivoicegenerator_audio_${Date.now()}.mp3`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);

      console.log(`[${this.serviceName}] Audio downloaded to: ${filePath}`);
      return { path: filePath, duration: null };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateAudio: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateAudio');
      throw error;
    }
  }

  async fetchServiceUsage() {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Fetching service usage information...`);
    let usageInfo = 'Usage information not found or scraping not implemented for TheAIVoiceGenerator.com.';

    try {
      // console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for TheAIVoiceGenerator.com's UI.`);
      return { rawUsageData: usageInfo };
    } catch (error) {
      console.error(`[${this.serviceName}] Error in fetchServiceUsage: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('fetchServiceUsage');
      return { rawUsageData: 'Failed to fetch usage data due to an error.', error: error.message };
    }
  }

  async close() {
    if (!this.isInitialized) {
      return;
    }
    await super.close();
    this.isInitialized = false;
    console.log(`[${this.serviceName}] Closed and de-initialized.`);
  }
}

module.exports = { TheAIVoiceGeneratorService };
