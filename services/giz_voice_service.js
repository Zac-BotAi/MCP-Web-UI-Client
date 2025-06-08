// services/giz_voice_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'giz_voice_downloads');

class GizVoiceService extends BaseAIService {
  constructor(name = 'GizVoiceService', url = 'https://giz.ai/ai-voice-generator/') {
    super(name, 'giz_voice_session'); // Potentially share session with giz_video if domain is same & login shared
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://giz.ai/')) {
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
      // Ensure on correct page if site has sub-paths for the tool
      if (!this.page.url().startsWith(this.url)) {
         console.warn(`[${this.serviceName}] Not on the specific tool page. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000);

      // --- Text Input ---
      const textInputSelectors = [
        'textarea#text_input',
        'textarea[name="text"]',
        'textarea[aria-label*="text for speech" i]',
        'div[contenteditable="true"][aria-label*="text input" i]'
        ];
      let textInputSelectorFound = false;
      for (const selector of textInputSelectors) {
        if (await this.page.isVisible(selector)) {
          await this.page.fill(selector, scriptSegment);
          console.log(`[${this.serviceName}] Script segment filled using selector: ${selector}.`);
          textInputSelectorFound = true;
          break;
        }
      }
      if (!textInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable text input field.`);
        throw new Error("Giz.ai text input field not found.");
      }

      // --- Voice Selection (Conceptual - Use Default) ---
      // console.warn(`[${this.serviceName}] Voice selection is conceptual. Using default voice.`);
      // Example:
      // const voiceSelectButton = 'button[aria-label*="Choose Voice"], button:has-text("Select Voice")';
      // if(await this.page.isVisible(voiceSelectButton)){
      //    await this.page.click(voiceSelectButton);
      //    await this.page.waitForTimeout(500); // Wait for dropdown
      //    await this.page.click('div[role="option"]:has-text("SpecificGizVoice")');
      //    console.log(`[${this.serviceName}] Voice 'SpecificGizVoice' selected conceptually.`);
      // }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
          'button:has-text("Generate Audio")',
          'button:has-text("Create Voice")',
          'button[aria-label*="generate" i]',
          'button[type="submit"]'
        ];
      let generateButtonSelectorFound = false;
      for (const selector of generateButtonSelectors) {
         if (await this.page.isVisible(selector)) {
            if (!(await this.page.isEnabled(selector))) {
                console.warn(`[${this.serviceName}] Generate button ('${selector}') found but is not enabled. Waiting briefly...`);
                await this.page.waitForFunction(s => { const btn = document.querySelector(s); return btn && !btn.disabled; }, selector, {timeout: 10000}).catch(() => {});
            }
            if (await this.page.isEnabled(selector)) {
                await this.page.click(selector);
                console.log(`[${this.serviceName}] Generation triggered using selector: ${selector}.`);
                generateButtonSelectorFound = true;
                break;
            }
         }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable generate button.`);
        throw new Error("Giz.ai generate button not found or not clickable.");
      }

      // --- Wait for Audio and Download ---
      const downloadButtonSelectors = [
        'a[download][href*=".mp3"]',
        'button[aria-label*="Download Voice" i]',
        'button:has-text("Download")'
        ];
      let downloadButtonSelectorFound = null;
      console.log(`[${this.serviceName}] Waiting for audio to generate and download button (up to 3 mins)...`);
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled) return true;
        }
        return false;
      }, downloadButtonSelectors, { timeout: 180000 });

      for (const selector of downloadButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          downloadButtonSelectorFound = selector;
          break;
        }
      }
      if (!downloadButtonSelectorFound) {
        throw new Error("Could not find Download button after generation.");
      }
      console.log(`[${this.serviceName}] Using download button selector: ${downloadButtonSelectorFound}`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelectorFound);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `giz_voice_audio_${Date.now()}.mp3`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for Giz.ai Voice Generator.';

    try {
      // const accountUrl = this.url.endsWith('/') ? this.url + 'account/usage' : 'https://giz.ai/account/usage';
      // if (!this.page.url().startsWith(accountUrl.substring(0, accountUrl.lastIndexOf('/')))) {
      //    await this.page.goto(accountUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const usageSelector = '.usage-counter .remaining-credits'; // Highly speculative
      // if(await this.page.isVisible(usageSelector)){
      //     usageInfo = await this.page.textContent(usageSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for Giz.ai's UI to be implemented.`);
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

module.exports = { GizVoiceService };
