// services/kapwing_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'kapwing_downloads');

class KapwingService extends BaseAIService {
  constructor(name = 'KapwingService', url = 'https://www.kapwing.com/ai-video-generator') {
    super(name, 'kapwing_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://www.kapwing.com/')) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a Kapwing subpage: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals();
    // Conceptual: HandleLogin(); // Kapwing usually requires login for exports without watermark
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI video creation";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page if the current URL is not the tool page.
      if (!this.page.url().startsWith(this.url)) {
          console.warn(`[${this.serviceName}] Not on the AI video generator page. Navigating to ${this.url}`);
          await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(3000); // Allow page/tool to settle, Kapwing can be heavy

      // --- AI Video Generation Flow (Highly Speculative) ---
      console.warn(`[${this.serviceName}] Kapwing automation is highly speculative. Actual UI workflow needs detailed investigation (e.g., selecting specific AI tool, handling media uploads if not text-to-video).`);

      const promptInputSelectors = [
        'textarea[placeholder*="Describe your video"]',
        'textarea[data-testid="prompt-input"]',
        'textarea[placeholder*="Enter a prompt for your video"]'
      ];
      let promptInputSelectorFound = null;
      for (const selector of promptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          promptInputSelectorFound = selector;
          break;
        }
      }

      if (promptInputSelectorFound) {
        await this.page.fill(promptInputSelectorFound, videoPrompt);
        console.log(`[${this.serviceName}] Video prompt filled into ${promptInputSelectorFound}.`);
      } else {
        console.warn(`[${this.serviceName}] Direct prompt input not found. Kapwing might require starting a project or different interaction.`);
        throw new Error("Kapwing direct AI prompt input not found, workflow needs manual design.");
      }

      // Conceptual: Select style, aspect ratio if available for the AI tool

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate video")',
        'button[data-testid="generate-button"]',
        'button:has-text("Create")',
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
        throw new Error('Generate button not found on Kapwing.');
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

      // --- Wait for Video Processing and Export/Download ---
      console.log(`[${this.serviceName}] Waiting for video to process in editor and export options (up to 12 mins)...`);

      const exportButtonSelectors = [
          'button[data-testid="export-button"]',
          'button:has-text("Export Video")',
          'button:has-text("Export Project")'
        ];
      let exportButtonSelectorFound = null;
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled) return true;
        }
        return false;
      }, exportButtonSelectors, { timeout: 720000 }); // 12 min for processing/loading editor

      for (const selector of exportButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          exportButtonSelectorFound = selector;
          break;
        }
      }
      if(!exportButtonSelectorFound) throw new Error("Export button not found or enabled after processing.");

      await this.page.click(exportButtonSelectorFound);
      console.log(`[${this.serviceName}] Clicked Export button: ${exportButtonSelectorFound}.`);

      // Kapwing export usually has options (format, resolution, quality) then a final export button.
      const finalExportButtonSelectors = [
          'button[data-testid="export-confirm-button"]',
          'button:has-text("Export as MP4")',
          'button:has-text("Confirm Export")' // More generic
        ];
      let finalExportButtonSelectorFound = null;
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0) && !elem.disabled) return true;
        }
        return false;
      }, finalExportButtonSelectors, { timeout: 60000 });

      for (const selector of finalExportButtonSelectors) {
        if (await this.page.isVisible(selector) && await this.page.isEnabled(selector)) {
          finalExportButtonSelectorFound = selector;
          break;
        }
      }
      if(!finalExportButtonSelectorFound) throw new Error("Final export confirmation button not found or enabled.");

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 600000 }); // 10 min for final render and download start
      await this.page.click(finalExportButtonSelectorFound);
      console.log(`[${this.serviceName}] Clicked final export confirmation: ${finalExportButtonSelectorFound}.`);

      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `kapwing_video_${Date.now()}.mp4`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for Kapwing.com.';

    try {
      // const workspaceSettingsUrl = 'https://www.kapwing.com/workspace/settings'; // Example
      // if (!this.page.url().startsWith(workspaceSettingsUrl.substring(0, workspaceSettingsUrl.lastIndexOf('/')))) {
      //    await this.page.goto(workspaceSettingsUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const usageSelector = 'div.limits-usage span.current-usage'; // Highly speculative
      // if (await this.page.isVisible(usageSelector)) {
      //   usageInfo = await this.page.textContent(usageSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for Kapwing.com's UI.`);
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

module.exports = { KapwingService };
