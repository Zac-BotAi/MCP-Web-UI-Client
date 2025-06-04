const { chromium } = require('playwright');
const fs = require('fs').promises; // Corrected: fs needs to be fs.promises for async file operations
const path = require('path');

const SESSION_DIR = path.join(__dirname, '..', 'sessions');

class BaseAIService {
  constructor(serviceName, baseUrl, options = {}) {
    this.serviceName = serviceName;
    this.baseUrl = baseUrl;
    this.browser = null;
    this.page = null;
    this.options = {
      headless: process.env.NODE_ENV === 'production', // Default to true in production
      humanLikeDelays: { // Delays in milliseconds
        beforeAction: options.humanLikeDelays?.beforeAction ?? 100 + Math.random() * 200, // e.g., 100-300ms
        afterAction: options.humanLikeDelays?.afterAction ?? 200 + Math.random() * 300,  // e.g., 200-500ms
        typing: options.humanLikeDelays?.typing ?? 50 + Math.random() * 100,          // e.g., 50-150ms per char
      },
      ...options
    };
  }

  async _delay(ms) {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  async initialize() {
    await fs.mkdir(SESSION_DIR, { recursive: true });
    const sessionPath = path.join(SESSION_DIR, `${this.serviceName}-session.json`);
    const contextPath = path.join(SESSION_DIR, `${this.serviceName}-browser-context`); // For persistent context

    try {
      // Try to use persistent context first for better session handling
      this.browser = await chromium.launchPersistentContext(contextPath, {
        headless: this.options.headless,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'], // Added --no-sandbox for Linux environments
        viewport: null, // Use default viewport
        // proxy: { server: 'http://yourproxy.com:port' } // Example: proxy support
      });
      this.page = this.browser.pages().length > 0 ? this.browser.pages()[0] : await this.browser.newPage();

      // Load cookies if session file exists (Playwright's persistent context handles this, but this is an explicit way)
      if (await fs.access(sessionPath).then(() => true).catch(() => false)) {
          const session = JSON.parse(await fs.readFile(sessionPath, 'utf-8'));
          if (session.cookies) {
              await this.page.context().addCookies(session.cookies);
          }
      }

    } catch (error) {
      console.warn(`No saved persistent context or error launching for ${this.serviceName}, launching new browser: ${error.message}`);
      // Fallback to non-persistent browser if persistent context fails
      const browserInstance = await chromium.launch({
        headless: this.options.headless,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
      });
      const context = await browserInstance.newContext();
      this.page = await context.newPage();
      this.browser = context; // Assign context to this.browser to close it later
    }

    if (this.baseUrl) {
      try {
        await this.page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) {
        console.error(`Error navigating to ${this.baseUrl} for service ${this.serviceName}: ${e.message}`);
        // Decide if this is a fatal error for the service
      }
    }
  }

  async saveSession() {
    if (!this.page || !this.page.context()) {
        console.warn(`Cannot save session for ${this.serviceName}, page or context not available.`);
        return;
    }
    const sessionPath = path.join(SESSION_DIR, `${this.serviceName}-session.json`);
    try {
        const cookies = await this.page.context().cookies();
        // You might want to save other storage state like localStorage if needed
        // const storageState = await this.page.context().storageState({ path: sessionPath }); // This saves more than just cookies
        await fs.writeFile(sessionPath, JSON.stringify({ cookies })); // Save only cookies for simplicity here
        console.log(`Session cookies saved for ${this.serviceName} to ${sessionPath}`);
    } catch (error) {
        console.error(`Failed to save session for ${this.serviceName}: ${error.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.saveSession(); // Save session before closing
      try {
        await this.browser.close();
        console.log(`Browser context for ${this.serviceName} closed.`);
      } catch (error) {
        console.error(`Error closing browser for ${this.serviceName}: ${error.message}`);
      }
    }
  }

  // Enhanced helper methods with delays
  async click(selector, options = {}) {
    await this._delay(this.options.humanLikeDelays.beforeAction);
    await this.page.click(selector, options);
    await this._delay(this.options.humanLikeDelays.afterAction);
  }

  async fill(selector, value, options = {}) {
    await this._delay(this.options.humanLikeDelays.beforeAction);
    if (this.options.humanLikeDelays.typing > 0) {
        await this.page.press(selector, 'End'); // Go to end of input
        for (const char of value) {
            await this.page.type(selector, char, { delay: this.options.humanLikeDelays.typing + Math.random() * 50 });
        }
    } else {
        await this.page.fill(selector, value, options);
    }
    await this._delay(this.options.humanLikeDelays.afterAction);
  }

  async type(selector, value, options = {}) { // Added type as a distinct method from fill for clarity
    await this._delay(this.options.humanLikeDelays.beforeAction);
    await this.page.type(selector, value, { delay: this.options.humanLikeDelays.typing + Math.random() * 50, ...options });
    await this._delay(this.options.humanLikeDelays.afterAction);
  }

  async waitForSelector(selector, options = {}) {
    await this._delay(this.options.humanLikeDelays.beforeAction); // Optional: delay before waiting
    await this.page.waitForSelector(selector, options);
    await this._delay(this.options.humanLikeDelays.afterAction); // Optional: delay after selector found
  }

  async navigate(url, options = {}) {
    await this._delay(this.options.humanLikeDelays.beforeAction);
    await this.page.goto(url, { waitUntil: 'networkidle', ...options });
    await this._delay(this.options.humanLikeDelays.afterAction);
  }
}

module.exports = { BaseAIService };
