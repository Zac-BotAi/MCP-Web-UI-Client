// services/piclumen_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios'); // For downloading image from URL if needed

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'piclumen_downloads');

class PiclumenService extends BaseAIService {
  constructor(name = 'PiclumenService', url = 'https://www.piclumen.com/') {
    super(name, 'piclumen_session');
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    // Piclumen.com might be a single-page app or require navigation to a specific tool.
    // For now, assume main URL is entry or leads to image gen tool.
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

  async generateImage(imagePrompt, aspectRatio = null) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating image for prompt: "${imagePrompt}", Aspect Ratio: ${aspectRatio || 'default'}`);

    try {
      // Ensure we are on the correct page or navigate if needed.
      // Example: if piclumen has a /generate or /create path
      const toolUrl = this.url.endsWith('/') ? this.url + 'generate-image' : this.url + '/generate-image'; // Example path
      if (!this.page.url().startsWith(toolUrl) && !this.page.url().startsWith(this.url + "editor")) { // Also check for general editor paths
         console.log(`[${this.serviceName}] Navigating to tool page: ${toolUrl}`);
         await this.page.goto(toolUrl, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000); // Allow page to settle

      // --- Prompt Input ---
      const promptInputSelectors = [
        'textarea[placeholder*="Enter your prompt"]',
        'textarea[id*="prompt"]',
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
        throw new Error("Piclumen.com prompt input field not found.");
      }


      // --- Aspect Ratio Control (Speculative) ---
      if (aspectRatio) {
        console.log(`[${this.serviceName}] Attempting to set aspect ratio to: ${aspectRatio}`);
        // const aspectRatioButton = `button[data-ratio="${aspectRatio}"], div[role="option"]:has-text("${aspectRatio}")`;
        // if (await this.page.isVisible(aspectRatioButton)) { // Use isVisible for checks
        //   await this.page.click(aspectRatioButton);
        //   console.log(`[${this.serviceName}] Aspect ratio ${aspectRatio} selected.`);
        // } else {
        //   console.warn(`[${this.serviceName}] Specific aspect ratio control for '${aspectRatio}' not found.`);
        // }
        console.warn(`[${this.serviceName}] Aspect ratio control logic is speculative for Piclumen.com and needs UI-specific implementation.`);
      }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
          'button:has-text("Generate")',
          'button:has-text("Create Image")',
          'button[id*="generate-button"]'
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
                console.log(`[${this.serviceName}] Generation triggered using selector: ${selector}.`);
                generateButtonSelectorFound = true;
                break;
            }
         }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable generate button.`);
        throw new Error("Piclumen.com generate button not found or not clickable.");
      }


      // --- Wait for Image and Download/Save ---
      const imageOutputSelectors = [
          'div.generated-image img',
          'figure.output-image img',
          'img#resultImage',
          'div[class*="image-result"] img'
        ];
      let imageOutputSelectorFound = null;
      console.log(`[${this.serviceName}] Waiting for image to generate (up to 4 mins)...`);
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0)) {
            if (elem.tagName === 'IMG' && (elem.src.startsWith('data:') || elem.src.startsWith('http') || elem.src.startsWith('blob:'))) {
              return selector;
            }
            if (elem.tagName !== 'IMG' && window.getComputedStyle(elem).backgroundImage !== 'none') {
              return selector;
            }
          }
        }
        return false;
      }, imageOutputSelectors, { timeout: 240000 });

      for (const selector of imageOutputSelectors) { // Re-iterate to get the selector string
        const elemHandle = await this.page.$(selector);
        if (elemHandle && await elemHandle.isVisible()) {
            imageOutputSelectorFound = selector;
            break;
        }
      }
      if (!imageOutputSelectorFound) throw new Error('Generated image container or image src not found.');
      console.log(`[${this.serviceName}] Image found/generated in selector: ${imageOutputSelectorFound}.`);

      const imageElement = await this.page.$(imageOutputSelectorFound);
      let imageUrl;
      const tagName = await imageElement.evaluate(node => node.tagName);
      if (tagName === 'IMG') {
          imageUrl = await imageElement.getAttribute('src');
      } else {
          const style = await imageElement.getAttribute('style');
          if (style) {
            const match = style.match(/url\(["']?(.*?)["']?\)/);
            if (match && match[1]) imageUrl = match[1];
          }
      }

      if (!imageUrl) {
        throw new Error('Generated image src or style attribute not found or URL could not be extracted.');
      }
      console.log(`[${this.serviceName}] Image src/style found: ${imageUrl.substring(0,100)}...`);

      if (imageUrl.startsWith('/')) { // Handle relative URLs
        const pageUrl = new URL(this.page.url());
        imageUrl = `${pageUrl.protocol}//${pageUrl.host}${imageUrl}`;
        console.log(`[${this.serviceName}] Resolved relative image URL to: ${imageUrl}`);
      }


      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      let extension = 'png';
      const urlPath = new URL(imageUrl, this.page.url()).pathname; // Use page URL as base if imageUrl is relative
      const extMatch = urlPath.match(/\.(jpeg|jpg|gif|png|webp)$/i);
      if (extMatch) {
          extension = extMatch[1];
      } else if (imageUrl.startsWith('data:image/')) {
          const mimeMatch = imageUrl.match(/^data:image\/(\w+);base64,/);
          if (mimeMatch) extension = mimeMatch[1];
      }
      const filename = `piclumen_image_${Date.now()}.${extension}`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, filename);

      if (imageUrl.startsWith('data:image/')) {
        const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
        await fs.writeFile(filePath, base64Data, 'base64');
      } else {
        const response = await axios({
          method: 'get',
          url: imageUrl,
          responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
      }

      console.log(`[${this.serviceName}] Image saved to: ${filePath}`);
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
    let usageInfo = 'Usage information not found or scraping not implemented for Piclumen.com.';

    try {
      // const accountUrl = this.url.endsWith('/') ? this.url + 'account' : this.url + '/account';
      // if (!this.page.url().startsWith(accountUrl)) {
      //    await this.page.goto(accountUrl, { waitUntil: 'networkidle', timeout: 60000 });
      // }
      // const creditsSelector = 'div.credits-info span.count'; // Highly speculative
      // if (await this.page.isVisible(creditsSelector)) {
      //   usageInfo = await this.page.textContent(creditsSelector, {timeout: 5000});
      // }
      console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for Piclumen.com's UI to be implemented.`);
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

module.exports = { PiclumenService };
