// services/aivoicegenerator_com_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;
// No axios needed if using Playwright download event directly.

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'aivoicegenerator_com_downloads');

class AIVoiceGeneratorComService extends BaseAIService {
  constructor(name = 'AIVoiceGeneratorComService', url = 'https://aivoicegenerator.com/') {
    super(name, 'aivoicegenerator_com_session');
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
      // if (!this.page.url().includes('/tts-tool')) { // Example path
      //   await this.page.goto(this.url + '/tts-tool', { waitUntil: 'networkidle' });
      // }
      // Assuming the main page this.url is where TTS happens or leads to it.
      if (!this.page.url().startsWith(this.url)) {
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000);

      // --- Text Input ---
      const textInputSelectors = [
        'textarea[name*="text"]',
        'textarea[aria-label*="text input" i]',
        'textarea#text_to_convert',
        'div[contenteditable="true"]'
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
        throw new Error("aivoicegenerator.com text input field not found.");
      }


      // --- Voice Selection (Conceptual - Use Default) ---
      // console.warn(`[${this.serviceName}] Voice selection is conceptual. Using default voice.`);
      // Example:
      // const voiceDropdownSelector = 'div[aria-label*="voice selection"]';
      // if(await this.page.isVisible(voiceDropdownSelector)){
      //    await this.page.click(voiceDropdownSelector);
      //    await this.page.waitForTimeout(500);
      //    await this.page.click('div[role="option"]:has-text("SampleVoiceName")');
      // }


      // --- Trigger Generation ---
      const generateButtonSelectors = [
          'button:has-text("Generate")',
          'button:has-text("Synthesize")',
          'button[id*="generate"]',
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
        throw new Error("aivoicegenerator.com generate button not found or not clickable.");
      }


      // --- Wait for Audio and Download ---
      const downloadButtonSelectors = [
          'a[download][href*=".mp3"]',
          'button[aria-label*="Download" i]',
          'a:has-text("Download")' // More generic
        ];
      let downloadButtonSelectorFound = null;
      console.log(`[${this.serviceName}] Waiting for audio to generate and download button (up to 3 mins)...`);
      // Wait for one of the download buttons to become visible and enabled
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

      const suggestedFilename = download.suggestedFilename() || `aivoicegenerator_com_audio_${Date.now()}.mp3`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);

      console.log(`[${this.serviceName}] Audio downloaded to: ${filePath}`);
      return { path: filePath, duration: null }; // server.js expects path and optional duration

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateAudio: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateAudio');
      throw error;
    }
  }

  async fetchServiceUsage() {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Fetching service usage information...`);
    let usageInfo = 'Usage information not found or scraping not implemented for AIVoiceGenerator.com.';

    try {
      // Navigate to account/usage page (speculative)
      // const accountUrl = this.url.endsWith('/') ? this.url + 'account' : this.url + '/account';
      // if (!this.page.url().startsWith(accountUrl)) {
      //    await this.page.goto(accountUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const usageSelector = 'div.usage-stats .credits-left'; // Highly speculative
      // if (await this.page.isVisible(usageSelector)) {
      //   usageInfo = await this.page.textContent(usageSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for AIVoiceGenerator.com's UI to be implemented.`);
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

module.exports = { AIVoiceGeneratorComService };
