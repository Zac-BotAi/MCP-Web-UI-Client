// services/vondy_video_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'vondy_video_downloads');

class VondyVideoService extends BaseAIService {
  constructor(name = 'VondyVideoService', url = 'https://www.vondy.com/free-ai-video-generator-no-sign-up--KG6eAUFm') {
    // Session name might be less relevant if truly no sign-up, but BaseAIService expects it.
    super(name, 'vondy_video_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize(); // Sets up this.page
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://www.vondy.com/')) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a Vondy subpage: ${this.page.url()}`);
    }
    // "No sign-up" implies no login handling needed.
    // Conceptual: HandleCookieBannerIfAny();
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI generated short video";
    console.log(`[${this.serviceName}] Generating video for prompt: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page if the current URL is not the tool page.
      if (!this.page.url().startsWith(this.url)) {
          console.warn(`[${this.serviceName}] Not on the video generator page. Navigating to ${this.url}`);
          await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input (Speculative) ---
      const promptInputSelectors = [
        'textarea[placeholder*="Enter your prompt" i]', // Case insensitive
        'textarea[aria-label*="Video script" i]',
        'textarea#prompt-input', // More specific ID
        'div[contenteditable="true"][aria-label*="prompt" i]'
      ];
      let promptInputSelectorFound = null;
      for (const selector of promptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          promptInputSelectorFound = selector;
          break;
        }
      }
      if (!promptInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable prompt input field.`);
        throw new Error('Vondy video prompt input not found.');
      }

      await this.page.fill(promptInputSelectorFound, videoPrompt);
      console.log(`[${this.serviceName}] Video prompt filled into ${promptInputSelectorFound}.`);

      // Conceptual: Select any available options like style, voice (if TTS is part of it)
      console.warn(`[${this.serviceName}] Additional parameters (style, voice, etc.) for Vondy are conceptual and not implemented.`);

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate Video")',
        'button:has-text("Create")',
        'button[type="submit"]',
        'button[aria-label*="generate" i]'
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
        throw new Error('Vondy generate button not found.');
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
      console.log(`[${this.serviceName}] Video generation triggered with ${generateButtonSelectorFound}.`);

      // --- Wait for Video Processing and Download ---
      console.log(`[${this.serviceName}] Waiting for video to process and download link/button (up to 12 mins)...`);

      const downloadButtonSelectors = [
        'a[download][href*=".mp4"]',
        'button:has-text("Download Video")',
        'button[aria-label*="Download" i]'
      ];
      let downloadButtonSelectorFound = null;

      await this.page.waitForFunction((selectors) =>
        selectors.some(selector => {
            const elem = document.querySelector(selector);
            // Check for visibility and that it's not disabled (if it's a button)
            return elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && (!elem.disabled);
        }),
        downloadButtonSelectors,
        { timeout: 720000 } // 12 min for processing & link appearance
      );

      for (const selector of downloadButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          downloadButtonSelectorFound = selector;
          break;
        }
      }
      if (!downloadButtonSelectorFound) {
        throw new Error('Vondy download button/link not found or not enabled after generation.');
      }
      console.log(`[${this.serviceName}] Found download trigger: ${downloadButtonSelectorFound}.`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 300000 }); // 5 min for download to start
      await this.page.click(downloadButtonSelectorFound);
      console.log(`[${this.serviceName}] Clicked download trigger.`);

      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `vondy_video_${Date.now()}.mp4`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);

      console.log(`[${this.serviceName}] Video downloaded to: ${filePath}`);
      return { path: filePath };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateVideo: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateVideo');
      throw error;
    }
  }

  async fetchServiceUsage() {
    // "No sign-up" typically means usage is free, possibly rate-limited by IP or session, not by account tokens.
    console.log(`[${this.serviceName}] Fetching service usage information (typically N/A for no-signup services).`);
    return { rawUsageData: 'Free (No sign-up required, usage not tracked via account tokens)' };
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

module.exports = { VondyVideoService };
