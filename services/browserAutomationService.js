const playwright = require('playwright');

class BrowserAutomationService {
  constructor(browserType = 'chromium') {
    this.browserType = browserType; // 'chromium', 'firefox', 'webkit'
    this.browser = null;
  }

  async _launchBrowser() {
    if (!this.browser || !this.browser.isConnected()) {
      console.log(`Launching ${this.browserType} browser...`);
      try {
        this.browser = await playwright[this.browserType].launch({
          headless: true, // Run headless by default
          // args: ['--no-sandbox', '--disable-setuid-sandbox'] // Uncomment if running in a restricted Linux environment
        });
        console.log(`${this.browserType} browser launched successfully.`);
      } catch (error) {
        console.error(`Failed to launch ${this.browserType} browser: ${error.message}`);
        console.error("Playwright Install: You might need to run 'npx playwright install' or 'npx playwright install-deps' if browser binaries/dependencies are missing.");
        throw error;
      }
    }
    return this.browser;
  }

  /**
   * Attempts to log into a website and extract cookies.
   * @param {String} url - The URL of the login page or a page to start from.
   * @param {String} username - The username for login.
   * @param {String} password - The password for login.
   * @param {Array<Object>} loginSteps - Array of action objects.
   *        Example: [{ action: 'fill', selector: '#user', value: username }, ...]
   * @param {Object} successCondition - Optional: { type: 'urlChanged'/'elementVisible', selectorOrUrl: '...' }
   * @returns {Promise<Array<Object>>} Array of cookie objects.
   * @throws {Error} If login fails or any step encounters an error.
   */
  async loginAndGetCookies(url, username, password, loginSteps, successCondition = null) {
    let context;
    let page;

    try {
      const browser = await this._launchBrowser();
      context = await browser.newContext({
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/98.0.4758.102 Safari/537.36', // Common user agent
          javaScriptEnabled: true,
          // viewport: { width: 1280, height: 720 } // Optional: set viewport
      });
      page = await context.newPage();

      console.log(`Navigating to ${url}...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      console.log('Executing login steps...');
      for (const step of loginSteps) {
        // Replace placeholders in value if they exist
        const stepValue = typeof step.value === 'string'
            ? step.value.replace('{{username}}', username).replace('{{password}}', password)
            : step.value;

        console.log(`Action: ${step.action}, Selector: ${step.selector || 'N/A'}, Value: ${stepValue || 'N/A'}`);
        switch (step.action) {
          case 'fill':
            await page.fill(step.selector, stepValue);
            break;
          case 'type': // Slower, more human-like typing
            await page.type(step.selector, stepValue, { delay: step.delay || 50 });
            break;
          case 'click':
            await page.click(step.selector);
            break;
          case 'waitForSelector':
            await page.waitForSelector(step.selector, { state: 'visible', timeout: step.timeout || 10000 });
            break;
          case 'waitForNavigation':
            // waitForNavigation is often tricky due to SPAs.
            // It's better to wait for a specific element on the new page or a URL change.
            console.log('Waiting for navigation (or a specific element if successCondition is set)...');
            if (step.timeout) {
                 await page.waitForLoadState('networkidle', { timeout: step.timeout }); // Generic wait
            } else {
                 await page.waitForLoadState('networkidle', { timeout: 30000 });
            }
            break;
          case 'press': // e.g. 'Enter'
             await page.press(step.selector, stepValue);
             break;
          case 'screenshot':
             await page.screenshot({ path: step.path || `screenshot-${Date.now()}.png`});
             console.log(`Screenshot saved to ${step.path || 'default path'}`);
             break;
          default:
            console.warn(`Unsupported action: ${step.action}`);
        }
         if (step.delayAfter) await page.waitForTimeout(step.delayAfter);
      }

      // Check for login success (very basic, site-specific)
      let loginSuccessful = false;
      if (successCondition) {
          console.log(`Checking success condition: type=${successCondition.type}, value=${successCondition.selectorOrUrl}`);
          if (successCondition.type === 'urlChanged' && page.url() !== url && page.url().includes(successCondition.selectorOrUrl)) {
              loginSuccessful = true;
          } else if (successCondition.type === 'elementVisible') {
              try {
                  await page.waitForSelector(successCondition.selectorOrUrl, { state: 'visible', timeout: 5000 });
                  loginSuccessful = true;
              } catch (e) {
                  console.log('Success condition element not visible.');
                  loginSuccessful = false;
              }
          }
      } else {
          // If no specific success condition, assume success if all steps completed without error.
          // This is often not a safe assumption.
          console.warn('No explicit success condition provided. Assuming login successful after steps execution.');
          loginSuccessful = true;
      }

      if (!loginSuccessful) {
        await page.screenshot({ path: `login_failed_${Date.now()}.png` });
        throw new Error('Login failed or success condition not met. Screenshot saved.');
      }

      console.log('Login appears successful. Extracting cookies...');
      const cookies = await context.cookies();
      console.log(`Extracted ${cookies.length} cookies.`);

      return cookies;

    } catch (error) {
      console.error(`Error during browser automation: ${error.message}`);
      if (page) {
        try {
            const errorScreenshotPath = `error_screenshot_${Date.now()}.png`;
            await page.screenshot({ path: errorScreenshotPath });
            console.log(`Screenshot taken on error: ${errorScreenshotPath}`);
        } catch (ssError) {
            console.error(`Failed to take screenshot on error: ${ssError.message}`);
        }
      }
      throw error; // Re-throw the error to be handled by the caller
    } finally {
      if (context) {
        console.log('Closing browser context...');
        await context.close();
      }
    }
  }

  async closeBrowser() {
    if (this.browser && this.browser.isConnected()) {
      console.log('Closing browser...');
      await this.browser.close();
      this.browser = null;
      console.log('Browser closed.');
    }
  }
}

module.exports = BrowserAutomationService;

// Example Usage (for testing directly, not part of the service itself):
// (async () => {
//   const service = new BrowserAutomationService('chromium');
//   try {
//     // This is a generic example, replace with actual site details and steps
//     const loginSteps = [
//       { action: 'fill', selector: 'input[name="username"]', value: 'testuser' },
//       { action: 'fill', selector: 'input[name="password"]', value: 'testpass' },
//       { action: 'click', selector: 'button[type="submit"]' },
//       { action: 'waitForNavigation' } // Or better: { action: 'waitForSelector', selector: '#dashboardElement' }
//     ];
//     const cookies = await service.loginAndGetCookies('https://example.com/login', 'testuser', 'testpass', loginSteps);
//     console.log('Cookies:', cookies);
//   } catch (error) {
//     console.error('Main test error:', error);
//   } finally {
//     await service.closeBrowser();
//   }
// })();
