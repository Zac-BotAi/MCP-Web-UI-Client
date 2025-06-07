// services/perchance_image_gen_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios'); // For downloading image from URL if needed

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'perchance_image_downloads');

class PerchanceImageGenService extends BaseAIService {
  constructor(name = 'PerchanceImageGenService', url = 'https://perchance.org/ai-text-to-image-generator') {
    super(name, 'perchance_image_gen_session'); // Session might not be used if no login
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize(); // This still sets up this.page
    // Navigate to the specific generator page
    if (this.page.url() !== this.url) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
        console.log(`[${this.serviceName}] Already on target URL: ${this.url}`);
    }
    // Perchance generators usually don't require login.
    // Conceptual: HandleCookieBannerOrModals();
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateImage(imagePrompt, aspectRatio = null) {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Generating image for prompt: "${imagePrompt}", Aspect Ratio: ${aspectRatio || 'default'}`);

    try {
      // Ensure we are on the generator page
      if (this.page.url() !== this.url && !this.page.url().startsWith(this.url.substring(0, this.url.lastIndexOf('/')))) { // Check if on the same base path
         console.warn(`[${this.serviceName}] Not on generator page or subpage. Navigating to ${this.url}`);
         await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(1000); // Allow page to settle

      // --- Prompt Input ---
      const promptInputSelectors = [
        'textarea#prompt',
        'textarea[name="prompt"]',
        'textarea[aria-label*="prompt" i]',
        'input#promptInput',
        'div[contenteditable="true"]' // Common for rich text editors used as input
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
        console.error(`[${this.serviceName}] Could not find a suitable prompt input field.`);
        throw new Error("Perchance.org prompt input field not found.");
      }

      // --- Aspect Ratio Control (Highly Speculative) ---
      if (aspectRatio) {
        console.log(`[${this.serviceName}] Attempting to set aspect ratio to: ${aspectRatio}`);
        // const aspectRatioInputSelector = 'input[name="size"], input[name="aspectRatio"]';
        // if (await this.page.isVisible(aspectRatioInputSelector)) {
        //    await this.page.fill(aspectRatioInputSelector, aspectRatio); // e.g. "1:1" or "1024x768"
        //    console.log(`[${this.serviceName}] Aspect ratio set via input field.`);
        // } else {
        //    console.warn(`[${this.serviceName}] Aspect ratio input field not found.`);
        // }
        console.warn(`[${this.serviceName}] Aspect ratio control is highly speculative for Perchance generators and needs UI-specific implementation.`);
      }

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button#generateButton',
        'button:has-text("Generate")',
        'button:has-text("Create")',
        'button[onclick*="generate"]' // For inline JS calls
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
      if(!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find or click a suitable generate button.`);
        throw new Error("Perchance.org generate button not found or not clickable.");
      }


      // --- Wait for Image and Download/Save ---
      const imageOutputSelectors = [
        '#outputImage',
        'img.generated-image',
        'div#imageOutput img',
        'div[style*="background-image"]', // For images set as background
        'img#img' // Common simple ID
      ];
      let imageOutputSelectorFound = null;
      console.log(`[${this.serviceName}] Waiting for image to generate (up to 4 mins)...`);

      // Wait for one of the selectors to be visible and contain an image (either src or background-image)
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0)) { // Check visibility
            if (elem.tagName === 'IMG' && (elem.src.startsWith('data:') || elem.src.startsWith('http') || elem.src.startsWith('blob:'))) {
              return selector; // Return the selector that matched
            }
            if (elem.tagName !== 'IMG' && window.getComputedStyle(elem).backgroundImage !== 'none') {
              return selector; // Return the selector for background image
            }
          }
        }
        return false;
      }, imageOutputSelectors, { timeout: 240000 });

      // Re-iterate to get the selector string that passed
       for (const selector of imageOutputSelectors) {
        const elemHandle = await this.page.$(selector);
        if (elemHandle) {
            const isVisible = await elemHandle.isVisible();
            if(isVisible) {
                const tagName = await elemHandle.evaluate(node => node.tagName);
                if (tagName === 'IMG') {
                    const imgSrc = await elemHandle.getAttribute('src');
                    if (imgSrc && (imgSrc.startsWith('data:') || imgSrc.startsWith('http') || imgSrc.startsWith('blob:'))) {
                        imageOutputSelectorFound = selector;
                        break;
                    }
                } else { // For divs with background images
                     const bgImage = await elemHandle.evaluate(node => window.getComputedStyle(node).backgroundImage);
                     if (bgImage && bgImage !== 'none') {
                         imageOutputSelectorFound = selector;
                         break;
                     }
                }
            }
        }
      }

      if (!imageOutputSelectorFound) {
        throw new Error('Generated image container or image src not found.');
      }
      console.log(`[${this.serviceName}] Image found/generated in selector: ${imageOutputSelectorFound}.`);

      const imageElement = await this.page.$(imageOutputSelectorFound);
      let imageUrl;
      const tagName = await imageElement.evaluate(node => node.tagName);
      if (tagName === 'IMG') {
          imageUrl = await imageElement.getAttribute('src');
      } else { // Assuming div with background-image
          const bgImage = await imageElement.evaluate(node => window.getComputedStyle(node).backgroundImage);
          // Extract URL from 'url("...")'
          const urlMatch = bgImage.match(/url\("?([^"]+)"?\)/);
          if (urlMatch && urlMatch[1]) {
              imageUrl = urlMatch[1];
          }
      }


      if (!imageUrl) {
        throw new Error('Generated image src or background-image URL attribute not found.');
      }
      console.log(`[${this.serviceName}] Image src/URL found: ${imageUrl.substring(0,100)}...`);

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      // Derive extension: check for common image extensions or default to png.
      let extension = 'png';
      const match = imageUrl.match(/\.(jpeg|jpg|gif|png|webp)(\?|$)/i);
      if (match) {
          extension = match[1];
      } else if (imageUrl.startsWith('data:image/')) {
          const mimeMatch = imageUrl.match(/^data:image\/(\w+);base64,/);
          if (mimeMatch) extension = mimeMatch[1];
      }

      const filename = `perchance_image_${Date.now()}.${extension}`;
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
    // Most Perchance generators are free and don't have usage tracking in this sense.
    console.log(`[${this.serviceName}] Fetching service usage information (typically N/A for Perchance).`);
    return { rawUsageData: 'Free / Community Generator (Usage not typically tracked)' };
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

module.exports = { PerchanceImageGenService };
