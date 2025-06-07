// Stub for RunwayService
const { BaseAIService } = require('../base'); // Required for extending
const path = require('path'); // Still needed for path.join for downloaded files
const fs = require('fs').promises; // Still needed for fs.mkdir for downloaded files

// For downloads, this service will manage its own specific TEMP_DIR.
// Error screenshots taken by BaseAIService.takeScreenshotOnError will use TEMP_DIR from base.js.
const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'runway_downloads');

class RunwayService extends BaseAIService {
  constructor(name, url) {
    super('RunwayService', 'runway_session'); // Call BaseAIService constructor
    this.url = url; // Should be "https://runwayml.com" or "https://app.runwayml.com"
    console.log(`[${this.serviceName}] (RunwayService) constructing with URL: ${this.url}`);
  }

  // initialize() is inherited from BaseAIService
  // close() is inherited from BaseAIService

  async generateImage(imagePrompt) {
    console.log(`[${this.serviceName}] Starting image generation for prompt: "${imagePrompt.substring(0, 50)}..."`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }

    try {
      const imageToolUrl = (this.url || 'https://app.runwayml.com') + '/ai-tools/text-to-image';
      await this.page.goto(imageToolUrl, { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to RunwayML Text-to-Image tool: ${imageToolUrl}`);

      // Conceptual: Login check.

      const promptInputSelector = 'textarea[placeholder*="Describe the image"]';
      console.log(`[${this.serviceName}] Waiting for image prompt input: ${promptInputSelector}`);
      await this.page.waitForSelector(promptInputSelector, { timeout: 20000 });
      await this.page.fill(promptInputSelector, imagePrompt);
      console.log(`[${this.serviceName}] Image prompt filled.`);

      const generateButtonSelector = 'button:has-text("Generate")';
      console.log(`[${this.serviceName}] Waiting for image generate button: ${generateButtonSelector}`);
      await this.page.waitForSelector(generateButtonSelector, { timeout: 10000 });
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Image generation started.`);

      const imageResultSelector = 'div[data-testid*="generated-image"]';
      console.log(`[${this.serviceName}] Waiting for generated image container: ${imageResultSelector}`);
      await this.page.waitForSelector(imageResultSelector, { timeout: 180000 });

      const downloadButtonSelector = `${imageResultSelector} button[aria-label*="Download"]`;
      console.log(`[${this.serviceName}] Waiting for image download button: ${downloadButtonSelector}`);
      await this.page.waitForSelector(downloadButtonSelector, { timeout: 10000 });

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `runway_image_${Date.now()}.png`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);
      console.log(`[${this.serviceName}] Image downloaded to: ${filePath}`);

      return { path: filePath };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'generateImage': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateImage');
      throw error;
    }
  }

  async generateVideo(strategy) {
    const videoPrompt = strategy.videoPrompt || strategy.visualPrompt || 'A cinematic shot of a futuristic city.';
    console.log(`[${this.serviceName}] Starting video generation for prompt: "${videoPrompt.substring(0,50)}..."`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }

    try {
      const videoToolUrl = (this.url || 'https://app.runwayml.com') + '/ai-tools/gen-2';
      await this.page.goto(videoToolUrl, { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to RunwayML Gen-2: ${videoToolUrl}`);

      // Conceptual: Login check.

      const videoPromptInputSelector = 'textarea[placeholder*="Describe your video"]';
      console.log(`[${this.serviceName}] Waiting for video prompt input: ${videoPromptInputSelector}`);
      await this.page.waitForSelector(videoPromptInputSelector, { timeout: 20000 });
      await this.page.fill(videoPromptInputSelector, videoPrompt);
      console.log(`[${this.serviceName}] Video prompt filled.`);

      const generateButtonSelector = 'button:has-text("Generate")';
      console.log(`[${this.serviceName}] Waiting for video generate button: ${generateButtonSelector}`);
      await this.page.waitForSelector(generateButtonSelector, {timeout: 10000});
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Video generation started.`);

      const videoResultSelector = 'div[data-testid*="video-player"]';
      console.log(`[${this.serviceName}] Waiting for generated video container: ${videoResultSelector}`);
      await this.page.waitForSelector(videoResultSelector, { timeout: 600000 });

      const downloadButtonSelector = `${videoResultSelector} button[aria-label*="Download"]`;
      console.log(`[${this.serviceName}] Waiting for video download button: ${downloadButtonSelector}`);
      await this.page.waitForSelector(downloadButtonSelector, { timeout: 10000 });

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      const downloadPromise = this.page.waitForEvent('download', { timeout: 120000 });
      await this.page.click(downloadButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `runway_video_${Date.now()}.mp4`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename);
      await download.saveAs(filePath);
      console.log(`[${this.serviceName}] Video downloaded to: ${filePath}`);

      return { path: filePath };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'generateVideo': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateVideo');
      throw error;
    }
  }
}

module.exports = RunwayService;