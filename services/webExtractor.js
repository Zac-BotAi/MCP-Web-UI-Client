const playwright = require('playwright');
const retry = require('async-retry');
const logger = require('../../lib/logger'); // Added logger require
const config = require('../../config'); // Added config require for retry options

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
      logger.info('Playwright initialized successfully for WebExtractorService.');
    } catch (error) {
      logger.error({ err: error }, 'Error initializing Playwright for WebExtractorService');
      throw error;
    }
  }

  async extractText(url) {
    if (!this.page) {
      logger.error({ url }, 'Playwright page is not initialized in WebExtractorService. Call initialize() first.');
      throw new Error('Playwright page not initialized.');
    }

    return retry(async (bail, attemptNumber) => {
      try {
        if (attemptNumber > 1) {
          logger.info({ url, attemptNumber }, `Retrying text extraction from URL`);
        }
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: config.timeouts.webExtractorNavigationMs });
        const bodyText = await this.page.locator('body').innerText();
        if (!bodyText || bodyText.trim() === '') {
          logger.warn({ url, attemptNumber, textLength: bodyText.length }, `Extracted empty text. Retrying if attempts remain.`);
          throw new Error(`Extracted empty text from ${url}`);
        }
        return bodyText;
      } catch (error) {
        logger.warn({ err: error, url, attemptNumber }, `Text extraction attempt failed`);
        throw error;
      }
    }, {
      retries: config.jobDefaultAttempts || 3, // Using general job attempts, could be specific
      factor: 2,
      minTimeout: config.jobDefaultBackoffDelay || 1000, // Using general backoff, could be specific
      maxTimeout: 5000,
      onRetry: (error, attemptNumber) => {
        logger.warn({ err: error, url, attemptNumber }, `Preparing for text extraction retry attempt`);
      }
    }).catch(error => {
      logger.error({ err: error, url }, `Failed to extract text from URL after multiple retries`);
      return null;
    });
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('Playwright browser closed for WebExtractorService.');
        this.browser = null;
        this.context = null;
        this.page = null;
      }
    } catch (error) {
      logger.error({ err: error }, 'Error closing Playwright browser for WebExtractorService');
    }
  }
}

module.exports = WebExtractorService;
