// services/videogalaxy_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'videogalaxy_downloads');

class VideoGalaxyService extends BaseAIService {
  constructor(name = 'VideoGalaxyService', url = 'https://video.galaxy.ai/ai-video-generator') {
    super(name, 'videogalaxy_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://video.galaxy.ai/')) {
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

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI generated space scene";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page if the current URL is not the tool page.
      if (!this.page.url().startsWith(this.url)) {
          console.warn(`[${this.serviceName}] Not on the video generator page. Navigating to ${this.url}`);
          await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input / Workflow (Highly Speculative) ---
      console.warn(`[${this.serviceName}] VideoGalaxy automation is highly speculative. Actual UI workflow needs investigation.`);

      const promptInputSelectors = [
          'textarea[placeholder*="Enter your prompt"]',
          'input[type="text"][name*="description"]',
          'textarea[aria-label*="prompt" i]'
        ];
      let promptInputSelectorFound = false;
      for (const selector of promptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          await this.page.fill(selector, videoPrompt);
          console.log(`[${this.serviceName}] Video prompt filled using selector: ${selector}.`);
          promptInputSelectorFound = true;
          break;
        }
      }
      if (!promptInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable prompt input field.`);
        throw new Error("VideoGalaxy.ai prompt input field not found.");
      }


      // Conceptual: Select style, aspect ratio, etc. if available
      // if (strategy.videoStyle) { /* ... click style button ... */ }
      // if (strategy.aspectRatio) { /* ... click aspect ratio button ... */ }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
          'button:has-text("Generate")',
          'button:has-text("Create Video")',
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
                console.log(`[${this.serviceName}] Video generation triggered using selector: ${selector}.`);
                generateButtonSelectorFound = true;
                break;
            }
         }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable generate button.`);
        throw new Error("VideoGalaxy.ai generate button not found or not clickable.");
      }


      // --- Wait for Video Processing and Download ---
      console.log(`[${this.serviceName}] Waiting for video to process and export options (up to 12 mins)...`);
      const exportButtonSelectors = [
          'button:has-text("Download")',
          'button:has-text("Export Video")',
          'button[aria-label*="Download" i]',
          'button[aria-label*="Export" i]'
        ];
      let exportButtonSelectorFound = false;
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled) return true;
        }
        return false;
      }, exportButtonSelectors, { timeout: 720000 }); // 12 min for rendering

      for (const selector of exportButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          await this.page.click(selector);
          console.log(`[${this.serviceName}] Clicked Export/Download button using selector: ${selector}.`);
          exportButtonSelectorFound = true;
          break;
        }
      }
      if (!exportButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable export/download button after rendering.`);
        throw new Error("VideoGalaxy.ai export/download button not found or not clickable after rendering.");
      }

      // Conceptual: Handle multi-step export if needed (e.g., click export, choose format, click final download)
      // const finalDownloadTrigger = 'div.export-modal button:has-text("Confirm Download")';
      // if (await this.page.isVisible(finalDownloadTrigger)) {
      //    await this.page.click(finalDownloadTrigger);
      //    console.log(`[${this.serviceName}] Clicked final download confirmation.`);
      // }


      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      console.log(`[${this.serviceName}] Waiting for download event (up to 5 mins for download to start)...`);
      const download = await this.page.waitForEvent('download', { timeout: 300000 });

      const suggestedFilename = download.suggestedFilename() || `videogalaxy_video_${Date.now()}.mp4`;
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
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Fetching service usage information...`);
    let usageInfo = 'Usage information not found or scraping not implemented for VideoGalaxy.ai.';

    try {
      // const accountUrl = 'https://video.galaxy.ai/account/usage'; // Example
      // if (!this.page.url().startsWith(accountUrl.substring(0, accountUrl.lastIndexOf('/')))) {
      //    await this.page.goto(accountUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const usageSelector = 'div.usage-info span.credits'; // Highly speculative
      // if (await this.page.isVisible(usageSelector)) {
      //   usageInfo = await this.page.textContent(usageSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for VideoGalaxy.ai's UI to be implemented.`);
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

module.exports = { VideoGalaxyService };
