// Stub for ClaudeService
const { BaseAIService } = require('../base'); // Required for extending
// const path = require('path'); // No longer needed here if TEMP_DIR is handled by BaseAIService

class ClaudeService extends BaseAIService {
  constructor(name, url) {
    super('ClaudeService', 'claude_session'); // Call BaseAIService constructor
    this.url = url; // Store url if needed, though BaseAIService doesn't use it directly
    console.log(`Stub ${this.serviceName} (ClaudeService) constructing with URL: ${this.url}`);
  }

  // initialize() is inherited from BaseAIService
  // close() is inherited from BaseAIService

  async generateScript(strategy) {
    console.log(`[${this.serviceName}] Starting script generation for topic: ${strategy.topic}`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }

    try {
      await this.page.goto('https://claude.ai/chats', { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to claude.ai/chats.`);

      // Conceptual: Check if still on /chats or redirected to login. Handle login if necessary.
      // This might involve checking for a specific element that only appears when logged in,
      // or checking the URL. If login is needed, a separate this.login() method could be called.
      // For example:
      // const isLoggedIn = await this.page.isVisible('some-element-only-visible-when-logged-in');
      // if (!isLoggedIn) {
      //   console.log(`[${this.serviceName}] Not logged in or session expired. Attempting to log in...`);
      //   await this.login(); // Hypothetical login method
      //   await this.page.goto('https://claude.ai/chats', { waitUntil: 'networkidle' }); // Re-navigate after login
      // }


      const promptTextareaSelector = 'div[contenteditable="true"][role="textbox"]';
      console.log(`[${this.serviceName}] Waiting for prompt textarea: ${promptTextareaSelector}`);
      await this.page.waitForSelector(promptTextareaSelector, { timeout: 30000 });

      const fullPrompt = strategy.scriptPrompt || strategy.topic || 'Generate a short script about a cat who loves to code.'; // Fallback prompt
      console.log(`[${this.serviceName}] Filling prompt (first 100 chars): ${fullPrompt.substring(0,100)}...`);
      await this.page.fill(promptTextareaSelector, fullPrompt);
      console.log(`[${this.serviceName}] Prompt filled into textarea.`);

      const sendButtonSelector = 'button[aria-label*="Send Message"]';
      console.log(`[${this.serviceName}] Waiting for send button: ${sendButtonSelector}`);
      await this.page.waitForSelector(sendButtonSelector, { timeout: 10000 });
      await this.page.click(sendButtonSelector);
      console.log(`[${this.serviceName}] Send button clicked.`);

      console.log(`[${this.serviceName}] Waiting for response to generate...`);
      // This selector waits for the last message group that is from the assistant.
      // It assumes that new messages are appended and the last one is the current response.
      const responseGroupSelector = 'div[data-testid^="chat-message-content-"]'; // General selector for message groups

      // Wait for a new response group to appear after sending the message.
      // This is a bit tricky. We need to ensure we're not picking up our own prompt echo if it exists,
      // and that we're waiting for the *assistant's* response.
      // Let's try waiting for a new assistant message to be fully rendered.
      // Claude seems to use <article> elements for each message block.
      // We count current assistant messages, then wait for a new one.
      const initialAssistantMessages = await this.page.$$('article[data-message-author-role="assistant"]');
      const initialCount = initialAssistantMessages.length;
      console.log(`[${this.serviceName}] Initial assistant message count: ${initialCount}`);

      // Wait for a send button to become enabled again or a stop generating button to appear/disappear
      // This is often a good indicator that the AI has finished.
      // For Claude, the send button becomes enabled again.
      await this.page.waitForSelector(`${sendButtonSelector}:not([disabled])`, { timeout: 180000 }); // 3 min timeout
      console.log(`[${this.serviceName}] Send button re-enabled, assuming response is complete.`);

      const responseElements = await this.page.$$('article[data-message-author-role="assistant"]');
      console.log(`[${this.serviceName}] Found ${responseElements.length} assistant message elements.`);
      if (responseElements.length === 0) {
          throw new Error('No assistant response elements found after generation.');
      }

      const lastResponseElement = responseElements[responseElements.length - 1];
      if (!lastResponseElement) {
        throw new Error('Could not find Claude response element.');
      }

      // Claude responses can have complex inner structure. Try to get all text content.
      const generatedScript = await lastResponseElement.textContent();

      console.log(`[${this.serviceName}] Script extracted. Length: ${generatedScript ? generatedScript.length : 0}`);
      if (!generatedScript || generatedScript.trim() === '') {
        // It's possible the page structure changed or response is empty. Take screenshot.
        const screenshotPath = path.join(__dirname, '..', '..', 'temp', `claude_empty_response_${Date.now()}.png`);
        await this.page.screenshot({ path: screenshotPath });
        console.log(`[${this.serviceName}] Generated script is empty. Screenshot: ${screenshotPath}`);
        throw new Error('Generated script is empty.');
      }

      return generatedScript.trim();

    } catch (error) {
    console.error(`[${this.serviceName}] Error in 'generateScript': ${error.message}`, error.stack);
    await this.takeScreenshotOnError('generateScript');
      throw error; // Re-throw the error to be caught by server.js
    }
  }
}

module.exports = ClaudeService;
