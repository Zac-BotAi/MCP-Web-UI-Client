// services/speechify_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'speechify_downloads');

class SpeechifyService extends BaseAIService {
  constructor(name = 'SpeechifyService', url = 'https://speechify.com/ai-voice-generator/') {
    super(name, 'speechify_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    // Navigate to the specific tool URL after general session restoration.
    if (this.page.url() !== this.url) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target tool URL. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target tool URL: ${this.url}`);
    }
    // Conceptual: HandleCookieBannerOrModals(); e.g. await this.dismissPopups(['button:has-text("Accept Cookies")']);
    // Conceptual: HandleLogin(); // If BaseAIService session wasn't enough or specific login flow needed.
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateAudio(scriptSegment) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating audio for script segment (first 100 chars): "${scriptSegment.substring(0,100)}..."`);

    try {
      // Confirm if still on the correct domain or if navigation is needed
      if (!this.page.url().startsWith('https://speechify.com/')) {
         console.warn(`[${this.serviceName}] Not on Speechify domain. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Text Input ---
      const textInputSelector = 'textarea[placeholder*="Enter text here"], div[aria-label*="text area with current value"]'; // Combine potential selectors
      await this.page.waitForSelector(textInputSelector, { timeout: 20000 });
      // Clear existing text before filling
      await this.page.evaluate((selector) => {
        const element = document.querySelector(selector);
        if (element) {
          if (element.isContentEditable) element.innerHTML = '';
          else element.value = '';
        }
      }, textInputSelector);
      await this.page.fill(textInputSelector, scriptSegment);
      console.log(`[${this.serviceName}] Script segment filled.`);

      // --- Voice Selection (Conceptual - Use Default) ---
      // console.warn(`[${this.serviceName}] Voice selection is conceptual. Using default voice.`);
      // Example:
      // const voiceDropdownTrigger = 'button[aria-label*="Selected voice"]';
      // if (await this.page.isVisible(voiceDropdownTrigger)) {
      //   await this.page.click(voiceDropdownTrigger);
      //   await this.page.waitForTimeout(500);
      //   await this.page.click('div[role="option"]:has-text("Matthew")'); // Example voice
      //   console.log('[${this.serviceName}] Voice "Matthew" selected conceptually.');
      // }


      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("Create Audio")',
        'button:has-text("Preview")',
        'button[aria-label*="generate" i]',
        'button[aria-label*="create" i]',
        'button[aria-label*="preview" i]'
      ];
      let generateButtonSelector;
      for (const selector of generateButtonSelectors) {
        if (await this.page.isVisible(selector)) {
          generateButtonSelector = selector;
          break;
        }
      }
      if (!generateButtonSelector) throw new Error("Could not find Generate/Create/Preview button.");

      console.log(`[${this.serviceName}] Using generate button selector: ${generateButtonSelector}`);
      await this.page.waitForSelector(generateButtonSelector, { timeout: 10000 });
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Generation triggered.`);

      // --- Wait for Audio and Download ---
      const downloadButtonSelectors = [
        'button[aria-label*="Download" i]',
        'a[download][href*=".mp3"]',
        'button:has-text("Download")'
      ];
      let downloadButtonSelector;
      console.log(`[${this.serviceName}] Waiting for audio to generate and download button (up to 3 mins)...`);
      // Wait for one of the download buttons to become visible
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0)) return true; // Check for visibility
        }
        return false;
      }, downloadButtonSelectors, { timeout: 180000 });

      for (const selector of downloadButtonSelectors) {
        if (await this.page.isVisible(selector)) {
          downloadButtonSelector = selector;
          break;
        }
      }
      if (!downloadButtonSelector) throw new Error("Could not find Download button after generation.");
      console.log(`[${this.serviceName}] Using download button selector: ${downloadButtonSelector}`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `speechify_audio_${Date.now()}.mp3`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for Speechify.';

    try {
      // const usagePageUrl = 'https://speechify.com/subscription/' // Example
      // if (!this.page.url().includes('/subscription')) { // Avoid re-navigation if already there
      //    await this.page.goto(usagePageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // console.log(`[${this.serviceName}] Navigated to conceptual usage page.`);

      // --- Add selectors to find token/credit information ---
      // const creditsSelector = 'div[class*="CreditsRemaining"]'; // Highly speculative
      // if (await this.page.isVisible(creditsSelector)) {
      //   usageInfo = await this.page.textContent(creditsSelector, {timeout: 5000});
      //   console.log(`[${this.serviceName}] Usage info found: ${usageInfo}`);
      // } else {
      //    console.warn(`[${this.serviceName}] Specific credits selector not found.`);
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors and navigation logic for Speechify's UI to be implemented.`);

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

module.exports = { SpeechifyService };
