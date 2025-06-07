// services/vheer_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'vheer_downloads');

class VheerService extends BaseAIService {
  constructor(name = 'VheerService', url = 'https://vheer.com/') {
    super(name, 'vheer_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    // Vheer.com might be a single-page app or require navigation to a specific tool.
    // For now, assume main URL is entry or leads to image gen tool.
    if (this.page.url() !== this.url && !this.page.url().startsWith(this.url)) { // Check if on base domain
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

  async generateImage(imagePrompt, aspectRatio = null) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating image for prompt: "${imagePrompt}", Aspect Ratio: ${aspectRatio || 'default'}`);

    try {
      // Ensure we are on the correct page or navigate if needed.
      // Vheer might have a specific path like /create or /generate. This is a guess.
      const toolUrl = this.url.endsWith('/') ? this.url + 'create' : this.url + '/create';
      if (!this.page.url().startsWith(toolUrl)) {
         console.log(`[${this.serviceName}] Navigating to tool page: ${toolUrl}`);
         await this.page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input ---
      const promptInputSelectors = [
        'textarea[placeholder*="your imagination"]',
        'textarea[placeholder*="Describe what you want to see"]',
        'input[type="text"][name*="prompt"]'
      ];
      let promptInputSelectorFound = false;
      for (const selector of promptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          await this.page.fill(selector, imagePrompt);
          console.log(`[${this.serviceName}] Prompt filled using selector: ${selector}.`);
          promptInputSelectorFound = true;
          break;
        }
      }
      if (!promptInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find prompt input field.`);
        throw new Error("Vheer.com prompt input field not found.");
      }


      // --- Aspect Ratio Control (Speculative) ---
      if (aspectRatio) {
        console.log(`[${this.serviceName}] Attempting to set aspect ratio to: ${aspectRatio}`);
        // const aspectRatioDropdown = 'div[role="button"][aria-label*="ratio"]'; // Example
        // if(await this.page.isVisible(aspectRatioDropdown)) {
        //    await this.page.click(aspectRatioDropdown);
        //    await this.page.waitForTimeout(500);
        //    await this.page.click(`div[role="option"][data-value="${aspectRatio}"]`);
        //    console.log(`[${this.serviceName}] Aspect ratio ${aspectRatio} selected.`);
        // } else {
        //    console.warn(`[${this.serviceName}] Aspect ratio control not found.`);
        // }
        console.warn(`[${this.serviceName}] Aspect ratio control logic is speculative for Vheer.com and needs UI-specific implementation.`);
      }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("Create")',
        'button[id*="generate"]',
        'button[type="submit"]'
      ];
      let generateButtonSelectorFound = false;
      for (const selector of generateButtonSelectors) {
         if (await this.page.isVisible(selector)) {
            if (!(await this.page.isEnabled(selector))) {
                console.warn(`[${this.serviceName}] Generate button ('${selector}') found but is not enabled. Waiting briefly...`);
                await this.page.waitForFunction(s => document.querySelector(s) && !document.querySelector(s).disabled, selector, {timeout: 10000}).catch(() => {});
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
        throw new Error("Vheer.com generate button not found or not clickable.");
      }


      // --- Wait for Image and Download ---
      const imageResultContainerSelectors = [
        'div.generated-image-area',
        'div[class*="result-image"]',
        'figure[class*="generated_image"]'
        ];
      let imageResultContainerSelectorFound = false;
      for (const selector of imageResultContainerSelectors) {
        if (await this.page.isVisible(selector)) {
            imageResultContainerSelectorFound = selector;
            break;
        }
      }
      if (!imageResultContainerSelectorFound) {
        console.error(`[${this.serviceName}] Could not find image result container.`);
        throw new Error("Vheer.com image result container not found.");
      }
      console.log(`[${this.serviceName}] Waiting for image to generate in container: ${imageResultContainerSelectorFound} (up to 4 mins)...`);
      await this.page.waitForSelector(`${imageResultContainerSelectorFound} img[src^="http"], ${imageResultContainerSelectorFound} img[src^="blob:"], ${imageResultContainerSelectorFound} img[src^="data:"]`, { timeout: 240000 });
      console.log(`[${this.serviceName}] Image loaded in result container.`);

      const downloadButtonSelectors = [
        `${imageResultContainerSelectorFound} button[aria-label*="Download"]`,
        `${imageResultContainerSelectorFound} a[download]`,
        'button:has-text("Download")' // A more general one if context is tricky
      ];
      let downloadButtonSelectorFound = false;
      for (const selector of downloadButtonSelectors) {
        if (await this.page.isVisible(selector)) {
            downloadButtonSelectorFound = selector;
            break;
        }
      }
      if (!downloadButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find download button.`);
        throw new Error("Vheer.com download button not found.");
      }
      console.log(`[${this.serviceName}] Found download button: ${downloadButtonSelectorFound}`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelectorFound);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `vheer_image_${Date.now()}.png`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);

      console.log(`[${this.serviceName}] Image downloaded to: ${filePath}`);
      return { path: filePath };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateImage: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateImage');
      throw error;
    }
  }

  async fetchServiceUsage() {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Fetching service usage information...`);
    let usageInfo = 'Usage information not found or scraping not implemented for Vheer.com.';

    try {
      // Navigate to account/dashboard page (speculative)
      // const dashboardUrl = this.url.endsWith('/') ? this.url + 'dashboard' : this.url + '/dashboard';
      // if (!this.page.url().startsWith(dashboardUrl)) {
      //    await this.page.goto(dashboardUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const creditsSelector = 'span.user-credits-value'; // Highly speculative
      // if (await this.page.isVisible(creditsSelector)) {
      //   usageInfo = await this.page.textContent(creditsSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors and navigation logic for Vheer.com's UI to be implemented.`);
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

module.exports = { VheerService };
