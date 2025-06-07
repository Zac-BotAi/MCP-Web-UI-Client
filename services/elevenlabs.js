// Stub for ElevenLabsService
const { BaseAIService } = require('../base'); // Required for extending
const path = require('path'); // Still needed for path.join for downloaded files
const fs = require('fs').promises; // Still needed for fs.mkdir for downloaded files and fs operations

// For downloads, this service will manage its own specific TEMP_DIR.
// Error screenshots taken by BaseAIService.takeScreenshotOnError will use TEMP_DIR from base.js.
const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'elevenlabs_downloads');


class ElevenLabsService extends BaseAIService {
  constructor(name, url) {
    super('ElevenLabsService', 'elevenlabs_session'); // Call BaseAIService constructor
    this.url = url; // Should be "https://elevenlabs.io"
    console.log(`[${this.serviceName}] (ElevenLabsService) constructing with URL: ${this.url}`);
  }

  // initialize() is inherited from BaseAIService
  // close() is inherited from BaseAIService

  async generateAudio(scriptSegment) {
    console.log(`[${this.serviceName}] Starting audio generation for script segment (first 50 chars): "${scriptSegment.substring(0, 50)}..."`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }

    try {
      const targetUrl = this.url || 'https://elevenlabs.io/';
      await this.page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to ${targetUrl}.`);

      // Conceptual: Login check.

      const textInputSelector = 'textarea';
      console.log(`[${this.serviceName}] Waiting for text input area: ${textInputSelector}`);
      await this.page.waitForSelector(textInputSelector, { timeout: 20000 });

      await this.page.evaluate(selector => {
        const el = document.querySelector(selector);
        if (el) el.value = '';
      }, textInputSelector);

      await this.page.fill(textInputSelector, scriptSegment);
      console.log(`[${this.serviceName}] Script segment filled into textarea.`);

      console.log(`[${this.serviceName}] Using default or pre-selected voice.`);

      const generateButtonSelector = 'button:has-text("Generate")';
      console.log(`[${this.serviceName}] Waiting for generate button: ${generateButtonSelector}`);
      await this.page.waitForSelector(generateButtonSelector, { timeout: 10000 });
      await this.page.click(generateButtonSelector);
      console.log(`[${this.serviceName}] Generate button clicked.`);

      const downloadButtonSelector = 'button[aria-label*="Download"]';
      console.log(`[${this.serviceName}] Waiting for audio to generate and download button to appear: ${downloadButtonSelector}`);
      await this.page.waitForSelector(downloadButtonSelector, { timeout: 180000 });

      // Ensure DOWNLOAD_TEMP_DIR exists for saving the downloaded audio file
      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      // console.log(`[${this.serviceName}] DOWNLOAD_TEMP_DIR ensured at: ${DOWNLOAD_TEMP_DIR}`); // Redundant if next log is good

      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 });
      await this.page.click(downloadButtonSelector);
      const download = await downloadPromise;

      const suggestedFilename = download.suggestedFilename() || `elevenlabs_audio_${Date.now()}.mp3`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, suggestedFilename); // Save to specific download dir
      await download.saveAs(filePath);
      console.log(`[${this.serviceName}] Audio downloaded to: ${filePath}`);

      return { path: filePath, duration: null };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'generateAudio': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateAudio');
      throw error;
    }
  }
}

module.exports = ElevenLabsService;
