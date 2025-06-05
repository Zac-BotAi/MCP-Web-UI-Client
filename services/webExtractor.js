const playwright = require('playwright');
const retry = require('async-retry');

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

    return retry(async (bail, attemptNumber) => {
      try {
        if (attemptNumber > 1) {
          console.log(`Retrying text extraction from URL: ${url} (Attempt ${attemptNumber})`);
        }
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); // 60 seconds timeout
        const bodyText = await this.page.locator('body').innerText();
        if (!bodyText || bodyText.trim() === '') {
          // Consider if empty body text should be a retriable offense or a bail
          // For now, let's assume it might be a temporary loading issue and retry.
          // If it's consistently empty, it will eventually fail after retries.
          console.warn(`Extracted empty text from ${url} on attempt ${attemptNumber}. Retrying if attempts remain.`);
          throw new Error(`Extracted empty text from ${url}`);
        }
        return bodyText;
      } catch (error) {
        console.error(`Attempt ${attemptNumber} failed for ${url}: ${error.message}`);
        // Example of bailing on a specific error type (adjust as needed for Playwright errors)
        // if (error.message.includes('net::ERR_NAME_NOT_RESOLVED')) {
        //   console.error(`URL ${url} could not be resolved. Bailing out.`);
        //   bail(error);
        //   return null; // bail doesn't return, but flow needs it.
        // }

        // For most playwright errors (timeout, navigation, etc.), we want to retry.
        // So, we re-throw the error, and async-retry will handle the retry logic.
        throw error;
      }
    }, {
      retries: 3,
      factor: 2,
      minTimeout: 1000, // 1 second
      maxTimeout: 5000, // 5 seconds
      onRetry: (error, attemptNumber) => {
        console.log(`Preparing for retry attempt ${attemptNumber} for ${url} due to: ${error.message}`);
      }
    }).catch(error => {
      console.error(`Failed to extract text from URL: ${url} after multiple retries`, error);
      return null; // Return null if all retries are exhausted
    });
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
