const playwright = require('playwright');

class WebExtractorService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async initialize() {
    try {
      this.browser = await playwright.chromium.launch();
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
      console.log('Playwright initialized successfully.');
    } catch (error) {
      console.error('Error initializing Playwright:', error);
      throw error; // Re-throw the error to indicate initialization failure
    }
  }

  async extractText(url) {
    if (!this.page) {
      console.error('Playwright page is not initialized. Call initialize() first.');
      throw new Error('Playwright page not initialized.');
    }

    try {
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // 60 seconds timeout
      const bodyText = await this.page.locator('body').innerText();
      return bodyText;
    } catch (error) {
      console.error(`Error extracting text from ${url}:`, error);
      // Return null or an empty string, or re-throw a custom error
      // depending on how the caller should handle this.
      // For now, returning null to indicate failure.
      return null;
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('Playwright browser closed.');
        this.browser = null;
        this.context = null;
        this.page = null;
      }
    } catch (error) {
      console.error('Error closing Playwright browser:', error);
      // Decide if this error needs to be re-thrown
    }
  }
}

module.exports = WebExtractorService;
