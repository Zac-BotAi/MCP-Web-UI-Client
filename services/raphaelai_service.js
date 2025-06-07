// services/raphaelai_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;

// Define where downloaded images from this service should go
const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'raphaelai_downloads');

class RaphaelAIService extends BaseAIService {
  constructor(name = 'RaphaelAIService', url = 'https://raphaelai.org/') { // URL might be specific tool page
    super(name, 'raphaelai_session'); // sessionName should be unique
    this.url = url;
    this.isInitialized = false; // Service-specific flag
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize(); // Launches browser, page, handles session loading

    // Conceptual: Navigate to the main page or a specific tool page if needed after login.
    // This depends on where BaseAIService's session restoration lands the user.
    // If BaseAIService lands on a generic page, explicit navigation might be needed here.
    // For example:
    // if (!this.page.url().includes('/app/generate')) { // Assuming '/app/generate' is the target tool page
    //    await this.page.goto(this.url + '/app/generate', { waitUntil: 'networkidle' });
    //    console.log(`[${this.serviceName}] Navigated to specific tool page.`);
    // }

    // Conceptual: Check for login state. Perform login if necessary.
    // await this.handleLogin(); // This would be a custom method to implement login logic

    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Target URL: ${this.url}, Current Page: ${this.page.url()}`);
  }

  // Conceptual login handler
  // async handleLogin() {
  //   // Check if login is needed (e.g. by looking for a login button or specific URL)
  //   // If needed, navigate to login page, fill credentials (from env or interactive), submit.
  //   // This is highly site-specific.
  //   console.log(`[${this.serviceName}] Conceptual login check/handler executed.`);
  // }

  async generateImage(imagePrompt, aspectRatio = null) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating image for prompt: "${imagePrompt}", Aspect Ratio: ${aspectRatio || 'default'}`);

    try {
      // Ensure navigation to the correct tool page if not already there
      // This URL is a guess, RaphaelAI might have a different path for its generator
      const generatorPageUrl = this.url.endsWith('/') ? this.url + 'generate' : this.url + '/generate';
      if (!this.page.url().startsWith(generatorPageUrl)) { // Check if already on a sub-page of generator
        console.log(`[${this.serviceName}] Navigating to image generation page: ${generatorPageUrl}`);
        await this.page.goto(generatorPageUrl, { waitUntil: 'networkidle', timeout: 60000 });
      } else {
        console.log(`[${this.serviceName}] Already on or near image generation page: ${this.page.url()}`);
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input ---
      const promptInputSelector = 'textarea[placeholder*="Describe your image"]';
      await this.page.waitForSelector(promptInputSelector, { timeout: 20000 });
      await this.page.fill(promptInputSelector, imagePrompt);
      console.log(`[${this.serviceName}] Prompt filled.`);

      // --- Aspect Ratio Control (Speculative) ---
      if (aspectRatio) {
        console.log(`[${this.serviceName}] Attempting to set aspect ratio to: ${aspectRatio}`);
        // This logic is highly speculative and needs to be adapted to RaphaelAI's actual UI.
        // Example 1: Clicking a button that directly sets the ratio
        // const aspectRatioButtonSelector = `button[data-aspect-ratio="${aspectRatio}"]`;
        // Example 2: Opening a dropdown and then selecting an option
        // const aspectRatioDropdownTrigger = 'button[aria-label="Aspect Ratio"]';
        // const aspectRatioOptionSelector = `div[role="menuitemradio"][data-value="${aspectRatio}"]`;
        // if (await this.page.isVisible(aspectRatioDropdownTrigger)) {
        //   await this.page.click(aspectRatioDropdownTrigger);
        //   await this.page.waitForSelector(aspectRatioOptionSelector, { timeout: 5000 });
        //   await this.page.click(aspectRatioOptionSelector);
        //   console.log(`[${this.serviceName}] Aspect ratio set to ${aspectRatio} (conceptual).`);
        // } else {
        //   console.warn(`[${this.serviceName}] Aspect ratio dropdown trigger not found. Cannot set aspect ratio.`);
        // }
        console.warn(`[${this.serviceName}] Aspect ratio control logic is speculative and needs implementation based on RaphaelAI's UI.`);
      }

      // --- Trigger Generation ---
      const generateButtonSelector = 'button:has-text("Generate")';
      await this.page.waitForSelector(generateButtonSelector, { timeout: 10000 });
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Generation triggered.`);

      // --- Wait for Image and Download ---
      const imageResultContainerSelector = 'div.generated-image-container'; // Generic guess
      console.log(`[${this.serviceName}] Waiting for image to generate (up to 4 mins)...`);
      // Wait for an img element within the container to ensure the image itself has loaded
      await this.page.waitForSelector(`${imageResultContainerSelector} img[src]`, { timeout: 240000 });
      console.log(`[${this.serviceName}] Image generated and visible.`);

      const downloadButtonSelector = `${imageResultContainerSelector} button[aria-label*="Download"]`;
      await this.page.waitForSelector(downloadButtonSelector, { timeout: 10000 });

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `raphaelai_image_${Date.now()}.png`;
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
    let usageInfo = 'Usage information not found or scraping not implemented for RaphaelAI.';

    try {
      // Navigate to account/subscription/usage page (highly speculative)
      // const usagePageUrl = this.url.endsWith('/') ? this.url + 'account/usage' : this.url + '/account/usage';
      // await this.page.goto(usagePageUrl, { waitUntil: 'networkidle' });
      // console.log(`[${this.serviceName}] Navigated to conceptual usage page: ${usagePageUrl}`);
      // await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Add selectors to find token/credit information ---
      // Example (very speculative):
      // const creditsSelector = 'div.credits-display span.remaining-credits'; // Example
      // const creditsText = await this.page.textContent(creditsSelector, { timeout: 5000 }).catch(() => null);
      // if (creditsText) {
      //   usageInfo = creditsText.trim();
      //   console.log(`[${this.serviceName}] Usage info found: ${usageInfo}`);
      // } else {
      //   console.warn(`[${this.serviceName}] Specific credits selector not found.`);
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors and navigation logic for RaphaelAI's UI to be implemented.`);

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
    // Call super.close() only if super.initialize() was successfully called.
    // this.isInitialized ensures this.
    await super.close();
    this.isInitialized = false;
    console.log(`[${this.serviceName}] Closed and de-initialized.`);
  }
}

module.exports = { RaphaelAIService };
