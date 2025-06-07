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

  async fetchServiceUsage() {
    console.log(`[${this.serviceName}] Attempting to fetch service usage information...`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first to fetch usage.");
    }

    try {
      // Navigate to a page where usage/quota is likely displayed.
      // This could be a subscription page, account page, or the main dashboard.
      // Using the main page (this.url or default) after login.
      const targetUrl = this.url || 'https://elevenlabs.io/';
      // It's possible the user is already on a relevant page if initialize() just ran.
      // But to be sure, navigate, or ensure current page is appropriate.
      // For simplicity, let's re-navigate or ensure we are on a known page.
      if (this.page.url() !== targetUrl && !this.page.url().startsWith(targetUrl + 'speech-synthesis')) { // Avoid redundant navigation if already on a tool page
          await this.page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
          console.log(`[${this.serviceName}] Navigated to ${targetUrl} for usage check.`);
      } else {
          console.log(`[${this.serviceName}] Already on a relevant page or main site: ${this.page.url()}`);
      }
      await this.page.waitForTimeout(3000); // Allow page to settle and dynamic elements to load

      // Highly speculative selectors for usage information.
      // These need to be verified against the actual ElevenLabs website after logging in.
      let usageInfo = 'Usage information not found.';

      // Common patterns:
      // 1. Text like "Characters used: X / Y"
      // 2. A progress bar with text
      // 3. Specific elements with data-testid attributes

      const commonUsageSelectors = [
        'div[class*="remaining" i]', // div with class containing "remaining"
        'p[class*="quota" i]',       // p with class containing "quota"
        'span[class*="characters" i]', // span with class containing "characters"
        'button[aria-label*="subscription" i]', // A button related to subscription, might have text
        'a[href*="subscription" i]' // A link to subscription page
      ];

      let foundElement = false;
      for (const selector of commonUsageSelectors) {
        if (await this.page.isVisible(selector)) {
          try {
            usageInfo = await this.page.textContent(selector, { timeout: 5000 });
            if (usageInfo && usageInfo.trim() !== '') {
                console.log(`[${this.serviceName}] Found usage info with selector '${selector}': ${usageInfo.trim()}`);
                foundElement = true;
                break;
            }
          } catch(e) { /* Element might be visible but text content retrieval fails or times out */ }
        }
      }

      if (!foundElement) {
        console.log(`[${this.serviceName}] Common usage selectors did not yield text. Trying more specific or known (but hypothetical) selectors.`);
        // Example of a more specific, but still hypothetical, selector
        const specificQuotaSelector = 'div[data-testid="user-quota-display"] p.text-sm';
        if (await this.page.isVisible(specificQuotaSelector)) {
           usageInfo = await this.page.textContent(specificQuotaSelector);
        } else {
           console.log(`[${this.serviceName}] Specific usage selectors not found. Usage info remains: '${usageInfo}'.`);
        }
      }

      // If usageInfo is still "Usage information not found." or empty, it means selectors failed.
      if (usageInfo === 'Usage information not found.' || (usageInfo && usageInfo.trim() === '')) {
          console.warn(`[${this.serviceName}] Could not extract specific usage text. Consider taking a screenshot of the dashboard area if this persists.`);
          // As a last resort, provide a generic message or rely on a screenshot if that was implemented.
          // For this pattern, we return what we have.
      }

      console.log(`[${this.serviceName}] Raw usage info extracted: \n---\n${usageInfo.trim()}\n---`);
      return { rawUsageData: usageInfo.trim() };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'fetchServiceUsage': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('fetchServiceUsage'); // Use the method from BaseAIService
      throw error;
    }
  }

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
