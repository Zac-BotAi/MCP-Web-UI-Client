const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class BaseAIService {
  constructor(serviceName, sessionName) {
    this.serviceName = serviceName;
    this.sessionName = sessionName;
    this.browser = null;
    this.page = null;
    this.context = null; // Added for storing context
  }

  async initialize() {
    this.browser = await chromium.launch({ headless: true });

    const contextOptions = {};
    const sessionPath = path.join(__dirname, 'sessions', this.sessionName + '.json');

    try {
      await fs.mkdir(path.join(__dirname, 'sessions'), { recursive: true }); // Ensure sessions directory exists
      const sessionData = await fs.readFile(sessionPath, 'utf-8');
      const parsedSession = JSON.parse(sessionData);
      if (parsedSession && Object.keys(parsedSession).length) {
        contextOptions.storageState = sessionPath;
        console.log(`Attempting to load session for ${this.serviceName} from ${sessionPath}`);
      }
    } catch (error) {
      // Log if session file doesn't exist or is invalid, but don't treat as fatal for initialization
      if (error.code === 'ENOENT') {
        console.log(`No session file found for ${this.serviceName} at ${sessionPath}. A new session will be created.`);
      } else {
        console.log(`Error loading session for ${this.serviceName}: ${error.message}. A new session will be created.`);
      }
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
    console.log(`${this.serviceName} initialized with browser and page.`);
  }

  async close() {
    if (this.context) {
      try {
        const sessionPath = path.join(__dirname, 'sessions', this.sessionName + '.json');
        await fs.mkdir(path.join(__dirname, 'sessions'), { recursive: true });
        const storageState = await this.context.storageState();
        await fs.writeFile(sessionPath, JSON.stringify(storageState, null, 2));
        console.log(`Session saved for ${this.serviceName} to ${sessionPath}`);
      } catch (error) {
        console.error(`Failed to save session for ${this.serviceName}: ${error.message}`);
      }
    }

    if (this.browser) {
      await this.browser.close();
    }
    console.log(`${this.serviceName} closed.`);
  }
}

module.exports = { BaseAIService };
