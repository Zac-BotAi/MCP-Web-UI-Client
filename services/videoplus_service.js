// services/videoplus_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'videoplus_downloads');

class VideoPlusService extends BaseAIService {
  constructor(name = 'VideoPlusService', url = 'https://videoplus.ai/') {
    super(name, 'videoplus_session');
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

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI generated marketing video";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page, e.g. if there's a specific tool path like /ai-video-tool
      // For now, assume this.url is the entry point or the tool page itself.
      if (!this.page.url().startsWith(this.url)) {
         console.warn(`[${this.serviceName}] Not on the main service page. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input / Workflow (Highly Speculative) ---
      console.warn(`[${this.serviceName}] VideoPlus.ai automation is highly speculative. Actual UI workflow needs investigation.`);

      const promptInputSelectors = [
        'textarea[placeholder*="Describe your video" i]',
        'textarea[aria-label*="prompt" i]',
        'input[type="text"][aria-label*="prompt" i]',
        '#video-prompt-input' // Generic ID guess
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
        throw new Error('VideoPlus.ai prompt input not found.');
      }

      await this.page.fill(promptInputSelectorFound, videoPrompt);
      console.log(`[${this.serviceName}] Video prompt filled into ${promptInputSelectorFound}.`);

      // Conceptual: Select style, duration, aspect ratio if available

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("Create Video")',
        'button[aria-label*="Generate" i]',
        'button[type="submit"]'
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
        throw new Error('VideoPlus.ai generate button not found.');
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
      console.log(`[${this.serviceName}] Waiting for video to process and export/download options (up to 12 mins)...`);

      const downloadButtonSelectors = [
        'a[download][href*=".mp4"]',
        'button:has-text("Download")',
        'button[aria-label*="Download Video" i]',
        'button[aria-label*="Export" i]' // Export might be the first step
      ];
      let downloadButtonSelectorFound = null;

      await this.page.waitForFunction((selectors) =>
        selectors.some(selector => {
            const elem = document.querySelector(selector);
            return elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled;
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
        throw new Error('VideoPlus.ai download/export button not found or not enabled after generation.');
      }
      console.log(`[${this.serviceName}] Found download/export trigger: ${downloadButtonSelectorFound}.`);

      // If the button found is an "Export" button, there might be more steps.
      // For this generic stub, we assume it might lead to a download event.
      // A real implementation would need to map out the exact export flow.
      if (downloadButtonSelectorFound.toLowerCase().includes('export')) {
          await this.page.click(downloadButtonSelectorFound);
          console.log(`[${this.serviceName}] Clicked export button. Waiting for potential final download button or event.`);
          // Wait for a more specific download button if the export flow is multi-step
          const finalDownloadSelectors = ['a[download][href*=".mp4"]', 'button:has-text("Download MP4")'];
          await this.page.waitForFunction((selectors) =>
            selectors.some(selector => {
                const elem = document.querySelector(selector);
                return elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled;
            }),
            finalDownloadSelectors,
            { timeout: 60000 } // 1 min for final download button to appear
          );
          let finalDownloadButtonActual = null;
          for (const selector of finalDownloadSelectors) {
            if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
              finalDownloadButtonActual = selector;
              break;
            }
          }
          if (!finalDownloadButtonActual) throw new Error("Final download button not found after export step.");
          downloadButtonSelectorFound = finalDownloadButtonActual; // Update to the actual download trigger
          console.log(`[${this.serviceName}] Found final download trigger: ${downloadButtonSelectorFound}.`);
      }


      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 300000 }); // 5 min for download to start
      await this.page.click(downloadButtonSelectorFound);
      console.log(`[${this.serviceName}] Clicked download trigger: ${downloadButtonSelectorFound}.`);

      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `videoplus_video_${Date.now()}.mp4`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for VideoPlus.ai.';

    try {
      // console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for VideoPlus.ai's UI.`);
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

module.exports = { VideoPlusService };
