// services/redpandaai_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'redpandaai_downloads');

class RedPandaAIService extends BaseAIService {
  constructor(name = 'RedPandaAIService', url = 'https://redpandaai.com/tools/ai-image-generator') {
    super(name, 'redpandaai_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    // Specific navigation for RedPanda, if needed after login, can go here.
    // For now, assume direct navigation to the tool URL is sufficient post-login.
    // Check if already on the target URL after session restoration.
    if (this.page.url() !== this.url) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target tool URL. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
        console.log(`[${this.serviceName}] Already on target tool URL: ${this.url}`);
    }
    // Conceptual: HandleLogin();
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateImage(imagePrompt, aspectRatio = null) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating image for prompt: "${imagePrompt}", Aspect Ratio: ${aspectRatio || 'default'}`);

    try {
      // Ensure we are on the correct page (might have been done in initialize, but good to confirm)
      if (this.page.url() !== this.url && !this.page.url().startsWith(this.url)) { // check startsWith in case of query params
         console.log(`[${this.serviceName}] Not on tool page. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input ---
      const promptInputSelector = 'textarea[placeholder*="Enter your prompt"]';
      await this.page.waitForSelector(promptInputSelector, { timeout: 20000 });
      await this.page.fill(promptInputSelector, imagePrompt);
      console.log(`[${this.serviceName}] Prompt filled.`);

      // --- Aspect Ratio Control (Speculative) ---
      if (aspectRatio) {
        console.log(`[${this.serviceName}] Attempting to set aspect ratio to: ${aspectRatio}`);
        // const aspectRatioButtonSelector = `button[data-value="${aspectRatio}"]`; // Highly speculative
        // if (await this.page.isVisible(aspectRatioButtonSelector)) { // Use isVisible for checks
        //   await this.page.click(aspectRatioButtonSelector);
        //   console.log(`[${this.serviceName}] Clicked aspect ratio button for ${aspectRatio}.`);
        // } else {
        //   console.warn(`[${this.serviceName}] Aspect ratio button for '${aspectRatio}' not found. Using default.`);
        // }
        console.warn(`[${this.serviceName}] Aspect ratio control logic is speculative for RedPandaAI and needs implementation.`);
      }

      // --- Trigger Generation ---
      const generateButtonSelector = 'button:has-text("Generate")';
      await this.page.waitForSelector(generateButtonSelector, { timeout: 10000 });

      const isEnabled = await this.page.isEnabled(generateButtonSelector);
      if (!isEnabled) {
          console.warn(`[${this.serviceName}] Generate button is not enabled. Waiting for it to become enabled (up to 10s)...`);
          try {
            await this.page.waitForFunction(selector => {
                const button = document.querySelector(selector);
                return button && !button.disabled;
            }, generateButtonSelector, {timeout: 10000});
            console.log(`[${this.serviceName}] Generate button is now enabled.`);
          } catch (waitError) {
            console.error(`[${this.serviceName}] Generate button did not become enabled within the timeout.`);
            throw new Error("Generate button remained disabled.");
          }
      }
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Generation triggered.`);

      // --- Wait for Image and Download ---
      const imageResultContainerSelector = 'div.image-result-wrapper'; // Generic guess
      console.log(`[${this.serviceName}] Waiting for image to generate (up to 4 mins)...`);
      await this.page.waitForSelector(`${imageResultContainerSelector} img[src^="http"], ${imageResultContainerSelector} img[src^="data:"]`, { timeout: 240000 });
      console.log(`[${this.serviceName}] Image generated and visible.`);

      const downloadButtonSelector = `${imageResultContainerSelector} button[aria-label*="Download"], ${imageResultContainerSelector} a[download]`;
      await this.page.waitForSelector(downloadButtonSelector, { timeout: 10000 });

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      // Click the first available download button/link
      const downloadElements = await this.page.$$(downloadButtonSelector);
      if (downloadElements.length === 0) throw new Error("Download button/link not found.");
      await downloadElements[0].click();

      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `redpandaai_image_${Date.now()}.png`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for RedPandaAI.';

    try {
      // Example: Navigate to an account page if it's different from the tool URL
      // const accountPageUrl = this.url.replace('/tools/ai-image-generator', '/account');
      // if (this.page.url() !== accountPageUrl) {
      //    await this.page.goto(accountPageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // console.log(`[${this.serviceName}] Navigated to conceptual usage page.`);

      // --- Add selectors to find token/credit information ---
      // const creditsSelector = 'div.user-profile-sidebar span.credits-count'; // Highly speculative
      // if (await this.page.isVisible(creditsSelector)) { // Use isVisible for checks
      //   usageInfo = await this.page.textContent(creditsSelector, { timeout: 5000 });
      //   console.log(`[${this.serviceName}] Usage info found: ${usageInfo}`);
      // } else {
      //   console.warn(`[${this.serviceName}] Specific credits selector not found.`);
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors and navigation logic for RedPandaAI's UI to be implemented.`);

      return { rawUsageData: usageInfo };
    } catch (error) {
      console.error(`[${this.serviceName}] Error in fetchServiceUsage: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('fetchServiceUsage');
      return { rawUsageData: 'Failed to fetch usage data due to an error.', error: error.message };
    }
  }

  async close() {
    if (!this.isInitialized) {
      // console.log(`[${this.serviceName}] Was not initialized, no need to close BaseAIService resources.`);
      return;
    }
    await super.close();
    this.isInitialized = false;
    console.log(`[${this.serviceName}] Closed and de-initialized.`);
  }
}

module.exports = { RedPandaAIService };
