// services/giz_video_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'giz_video_downloads');

class GizVideoService extends BaseAIService {
  // Using 'giz_session' with the expectation that login is shared across giz.ai tools
  constructor(name = 'GizVideoService', url = 'https://giz.ai/ai-video-generator/') {
    super(name, 'giz_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://giz.ai/')) { // Check if on Giz.ai domain
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a subpage: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals();
    // Conceptual: HandleLogin(); // Assumes login is handled by BaseAIService session
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI adventure video";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page if site has sub-paths for the tool
      if (!this.page.url().startsWith(this.url)) {
         console.warn(`[${this.serviceName}] Not on the specific tool page. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000);

      console.warn(`[${this.serviceName}] Giz.ai Video automation is highly speculative. The following steps assume a direct text-to-video flow.`);

      // --- Prompt Input / Workflow (Highly Speculative for Giz.ai Video) ---
      const promptInputSelectors = [
        'textarea[name="prompt"]',
        'textarea[placeholder*="Describe your video"]',
        'textarea[aria-label*="video prompt" i]'
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
        throw new Error("Giz.ai video prompt input field not found.");
      }


      // Conceptual: Select style, aspect ratio, duration if available
      // if (strategy.aspectRatio) { ... }
      // if (strategy.videoStyle) { ... }
      console.warn(`[${this.serviceName}] Additional video parameters (style, aspect ratio, duration) handling is conceptual for Giz.ai Video.`);

      // --- Trigger Generation ---
      const generateButtonSelectors = [
          'button:has-text("Generate Video")',
          'button:has-text("Create")',
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
                console.log(`[${this.serviceName}] Video generation triggered using selector: ${selector}.`);
                generateButtonSelectorFound = true;
                break;
            }
         }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable generate button.`);
        throw new Error("Giz.ai video generate button not found or not clickable.");
      }


      // --- Wait for Video Processing and Export/Download ---
      console.log(`[${this.serviceName}] Waiting for video to process and export options (up to 12 mins)...`);

      const exportButtonSelectors = [
          'button:has-text("Export")',
          'button:has-text("Download Video")',
          'button[aria-label*="Export" i]',
          'button[aria-label*="Download" i]'
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
        throw new Error("Giz.ai export/download button not found or not clickable after rendering.");
      }

      // After clicking export, there might be quality/format selection, then a final download trigger.
      // This part is also highly speculative. Assume for now that clicking "Export" leads to a state
      // where a download event will be triggered.
      // Example:
      // const finalDownloadTrigger = 'div.export-options button:has-text("Download MP4 1080p")';
      // if (await this.page.isVisible(finalDownloadTrigger)) {
      //    await this.page.click(finalDownloadTrigger);
      //    console.log(`[${this.serviceName}] Clicked final download trigger.`);
      // }


      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      console.log(`[${this.serviceName}] Waiting for download event (up to 5 mins for download to start)...`);
      const download = await this.page.waitForEvent('download', { timeout: 300000 });

      const suggestedFilename = download.suggestedFilename() || `giz_video_${Date.now()}.mp4`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for Giz.ai Video Generator.';

    try {
      // const accountUrl = 'https://giz.ai/account'; // Example
      // if (!this.page.url().startsWith(accountUrl)) {
      //    await this.page.goto(accountUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const usageSelector = '.video-credits .remaining'; // Highly speculative
      // if (await this.page.isVisible(usageSelector)) {
      //   usageInfo = await this.page.textContent(usageSelector, {timeout: 5000});
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

module.exports = { GizVideoService };
