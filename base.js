const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

// Define TEMP_DIR at the project root level (since base.js is in the root)
const TEMP_DIR = path.join(__dirname, 'temp');

class BaseAIService {
  constructor(serviceName, sessionName) {
    this.serviceName = serviceName;
    this.sessionName = sessionName;
    this.browser = null;
    this.page = null;
    this.context = null;
  }

  async initialize() {
    const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false'; // Defaults to true
    console.log(`[${this.serviceName}] Initializing browser (headless: ${headless})...`);

    this.browser = await chromium.launch({ headless });

    const contextOptions = {};
    const sessionDir = path.join(__dirname, 'sessions'); // sessions dir in project root
    await fs.mkdir(sessionDir, { recursive: true }); // Ensure sessions directory exists
    const sessionPath = path.join(sessionDir, this.sessionName + '.json');

    try {
      const sessionData = await fs.readFile(sessionPath, 'utf-8');
      const parsedSession = JSON.parse(sessionData);
      if (parsedSession && Object.keys(parsedSession).length) {
        contextOptions.storageState = sessionPath;
        console.log(`[${this.serviceName}] Attempting to load session from ${sessionPath}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`[${this.serviceName}] No session file found at ${sessionPath}. A new session will be created.`);
      } else {
        console.log(`[${this.serviceName}] Error loading session from ${sessionPath}: ${error.message}. A new session will be created.`);
      }
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
    console.log(`[${this.serviceName}] ${this.serviceName} initialized with browser and page.`);
  }

  async takeScreenshotOnError(errorContextName) {
    if (this.page) {
      try {
        await fs.mkdir(TEMP_DIR, { recursive: true }); // TEMP_DIR is now defined at the top of base.js
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(TEMP_DIR, `ERROR_${this.serviceName}_${errorContextName}_${timestamp}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`[${this.serviceName}] Screenshot taken on error: ${screenshotPath}`);
        return screenshotPath;
      } catch (ssError) {
        console.error(`[${this.serviceName}] Failed to take screenshot: ${ssError.message}`);
        return null;
      }
    }
    console.log(`[${this.serviceName}] Page not available, cannot take screenshot.`);
    return null;
  }

  async close() {
    if (this.context) {
      try {
        const sessionDir = path.join(__dirname, 'sessions');
        await fs.mkdir(sessionDir, { recursive: true });
        const sessionPath = path.join(sessionDir, this.sessionName + '.json');
        const storageState = await this.context.storageState();
        await fs.writeFile(sessionPath, JSON.stringify(storageState, null, 2));
        console.log(`[${this.serviceName}] Session saved to ${sessionPath}`);
      } catch (error) {
        console.error(`[${this.serviceName}] Failed to save session to ${this.sessionName}.json: ${error.message}`);
      }
    }

    if (this.browser) {
      await this.browser.close();
      console.log(`[${this.serviceName}] Browser closed.`);
    }
    console.log(`[${this.serviceName}] ${this.serviceName} closed.`);
  }
}

module.exports = { BaseAIService };
