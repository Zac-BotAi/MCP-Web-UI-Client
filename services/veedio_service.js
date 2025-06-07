// services/veedio_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'veedio_downloads');

class VeedIOService extends BaseAIService {
  constructor(name = 'VeedIOService', url = 'https://www.veed.io/tools/ai-video') { // Target specific AI tool page
    super(name, 'veedio_session');
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
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://www.veed.io/new')) { // Veed often redirects to /new for projects
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target tool URL. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target tool URL or new project page: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals(); e.g. await this.dismissPopups(['button:has-text("Accept all cookies")']);
    // Conceptual: HandleLogin(); // If BaseAIService session wasn't enough or specific login flow needed.
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI generated video from prompt";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure we are on a page that allows AI video generation
      if (!this.page.url().startsWith('https://www.veed.io/')) { // Basic domain check
         console.warn(`[${this.serviceName}] Not on Veed.io domain. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(3000); // Allow page/tool to settle

      console.warn(`[${this.serviceName}] Veed.io automation is highly speculative. The following steps assume a direct text-to-video flow is available and attempts generic selectors.`);

      // Attempt to find a generic prompt input. This is very likely to need adjustment.
      const genericPromptInputSelectors = [
        'textarea[placeholder*="Describe your video idea"]',
        'textarea[data-testid*="prompt-input"]',
        'textarea[placeholder*="Enter text"]',
        'div[aria-label*="prompt"] textarea', // Textarea within a labeled div
      ];
      let promptInputSelectorFound = false;
      for (const selector of genericPromptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          await this.page.fill(selector, videoPrompt);
          console.log(`[${this.serviceName}] Prompt filled using selector: ${selector}.`);
          promptInputSelectorFound = true;
          break;
        }
      }
      if (!promptInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable prompt input field.`);
        throw new Error("Veed.io prompt input field not found.");
      }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate video")',
        'button:has-text("Create video")',
        'button:has-text("Generate")',
        'button[data-testid*="generate-button"]'
      ];
      let generateButtonSelectorFound = false;
      for (const selector of generateButtonSelectors) {
        if (await this.page.isVisible(selector)) {
          await this.page.click(selector);
          console.log(`[${this.serviceName}] Generation triggered using selector: ${selector}.`);
          generateButtonSelectorFound = true;
          break;
        }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable generate button.`);
        throw new Error("Veed.io generate button not found.");
      }

      // --- Wait for Video Processing and Export/Download ---
      console.log(`[${this.serviceName}] Waiting for video to process and export options (up to 10 mins)...`);

      const exportButtonSelectors = [
          'button:has-text("Export")',
          'button:has-text("Download")',
          'button[aria-label*="Export" i]',
          'button[aria-label*="Download" i]'
        ];
      let exportButtonSelectorFound = false;
      // Wait for one of the export buttons to become visible and enabled
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled) return true;
        }
        return false;
      }, exportButtonSelectors, { timeout: 600000 }); // 10 min for rendering

      for (const selector of exportButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          await this.page.click(selector);
          console.log(`[${this.serviceName}] Clicked Export/Download button using selector: ${selector}.`);
          exportButtonSelectorFound = true;
          break;
        }
      }
      if (!exportButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable export/download button.`);
        throw new Error("Veed.io export/download button not found or not clickable.");
      }

      // After clicking export, there might be quality/format selection, then a final download trigger.
      // This part is also highly speculative. Assume for now that clicking "Export" leads to a state
      // where a download event will be triggered, or a final explicit download button for MP4.

      // Example: Look for a final download button if the export process has multiple steps
      // const finalDownloadTrigger = 'button:has-text("Download MP4"), button[data-testid="final-download-button"]';
      // try {
      //    await this.page.waitForSelector(finalDownloadTrigger, {timeout: 60000, state: 'visible'});
      //    await this.page.click(finalDownloadTrigger);
      //    console.log(`[${this.serviceName}] Clicked final download trigger.`);
      // } catch(e) {
      //    console.log(`[${this.serviceName}] No explicit final download trigger found, assuming previous click started download event listener.`);
      // }


      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      console.log(`[${this.serviceName}] Waiting for download event (up to 5 mins for download to start)...`);
      const download = await this.page.waitForEvent('download', { timeout: 300000 });

      const suggestedFilename = download.suggestedFilename() || `veedio_video_${Date.now()}.mp4`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for Veed.io.';

    try {
      // const usagePageUrl = 'https://www.veed.io/settings/billing'; // Example
      // if (!this.page.url().startsWith(usagePageUrl.substring(0, usagePageUrl.lastIndexOf('/')))) {
      //    await this.page.goto(usagePageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // console.log(`[${this.serviceName}] Navigated to conceptual usage page.`);

      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors and navigation logic for Veed.io's UI to be implemented.`);

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

module.exports = { VeedIOService };
