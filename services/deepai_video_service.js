// services/deepai_video_service.js
const { BaseAIService } = require('../base');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios'); // For potential image/video URL download

const DOWNLOAD_TEMP_DIR = path.join(__dirname, '..', '..', 'temp', 'deepai_video_downloads');

class DeepAIVideoService extends BaseAIService {
  constructor(name = 'DeepAIVideoService', url = 'https://deepai.org/video') {
    super(name, 'deepai_session'); // Session may or may not be heavily used by their UI tools
    this.url = url;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
        console.log(`[${this.serviceName}] Already initialized.`);
        return;
    }
    await super.initialize();
    if (this.page.url() !== this.url && !this.page.url().startsWith('https://deepai.org/')) {
        console.log(`[${this.serviceName}] Current URL ${this.page.url()} is not the target. Navigating to ${this.url}`);
        await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
    } else {
         console.log(`[${this.serviceName}] Already on target URL or a DeepAI subpage: ${this.page.url()}`);
    }
    // Conceptual: HandleCookieBannerOrModals();
    // Conceptual: HandleLogin(); // DeepAI might require login for some tools or to save history
    this.isInitialized = true;
    console.log(`[${this.serviceName}] Initialized. Current URL: ${this.page.url()}`);
  }

  async generateVideo(strategy) {
    if (!this.isInitialized) await this.initialize();
    const videoPrompt = strategy.videoPrompt || strategy.scriptPrompt || strategy.topic || "AI animation";
    console.log(`[${this.serviceName}] Generating video for prompt/strategy: "${videoPrompt.substring(0,100)}..."`);

    try {
      // Ensure on correct page if the current URL is not the tool page.
      if (!this.page.url().startsWith(this.url)) { // Assuming this.url is the direct tool page
          console.warn(`[${this.serviceName}] Not on the video generator page. Navigating to ${this.url}`);
          await this.page.goto(this.url, { waitUntil: 'networkidle', timeout: 60000 });
      }
      await this.page.waitForTimeout(2000);

      console.warn(`[${this.serviceName}] DeepAI video automation is highly speculative. The UI might be complex or API-preferred. This attempts a generic UI flow.`);

      // Example: Assuming a text-to-video tool is directly available or navigated to.
      const promptInputSelectors = [
        'textarea[name="text"]',
        'textarea[placeholder*="Enter text to animate" i]',
        'textarea[placeholder*="Describe your video" i]',
        '#prompt-input-field' // Generic ID guess
      ];
      let promptInputSelectorFound = null;
      for (const selector of promptInputSelectors) {
        if (await this.page.isVisible(selector)) {
          promptInputSelectorFound = selector;
          break;
        }
      }
      if (!promptInputSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable prompt input field.`);
        throw new Error('DeepAI video prompt input not found.');
      }

      await this.page.fill(promptInputSelectorFound, videoPrompt);
      console.log(`[${this.serviceName}] Video prompt filled into ${promptInputSelectorFound}.`);

      // Conceptual: Select model, style, parameters if available

      // --- Trigger Generation ---
      const generateButtonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("Create Video")',
        'button#submit-button',
        'button[aria-label*="generate" i]'
      ];
      let generateButtonSelectorFound = null;
      for (const selector of generateButtonSelectors) {
        if (await this.page.isVisible(selector)) {
          generateButtonSelectorFound = selector;
          break;
        }
      }
      if (!generateButtonSelectorFound) {
        console.error(`[${this.serviceName}] Could not find a suitable generate button.`);
        throw new Error('DeepAI generate button not found.');
      }

      if (!(await this.page.isEnabled(generateButtonSelectorFound))) {
          console.warn(`[${this.serviceName}] Generate button (${generateButtonSelectorFound}) disabled. Waiting...`);
          await this.page.waitForFunction(selector => {
              const btn = document.querySelector(selector); return btn && !btn.disabled;
          }, generateButtonSelectorFound, {timeout: 10000}).catch(() => {
              throw new Error(`Generate button (${generateButtonSelectorFound}) remained disabled.`);
          });
      }
      await this.page.click(generateButtonSelectorFound);
      console.log(`[${this.serviceName}] Video generation triggered with ${generateButtonSelectorFound}.`);

      // --- Wait for Video Processing and Download/Output ---
      console.log(`[${this.serviceName}] Waiting for video to process and output (up to 12 mins)...`);

      const outputVideoSelectors = [
          'video#outputVideo',
          'div.video-result video', // Video tag within a div
          'a.download-link[href*=".mp4"]', // Direct download link
          'div[data-testid="video-output"] video' // Test ID based selector
        ];
      let outputVideoSelectorFound = null;
      await this.page.waitForFunction(async (selectors) => {
        for (const selector of selectors) {
          const elem = document.querySelector(selector);
          if (elem && (elem.offsetParent !== null || elem.getClientRects().length > 0)) return selector;
        }
        return false;
      }, outputVideoSelectors, { timeout: 720000 }); // 12 min

      for (const selector of outputVideoSelectors) { // Re-check to assign the found selector
        if (await this.page.isVisible(selector)) {
            outputVideoSelectorFound = selector;
            break;
        }
      }
      if(!outputVideoSelectorFound) throw new Error("Video output element not found after processing.");
      console.log(`[${this.serviceName}] Video output element appeared using selector: ${outputVideoSelectorFound}.`);

      const videoElement = await this.page.$(outputVideoSelectorFound);
      let videoUrl;
      const tagName = await videoElement.evaluate(node => node.tagName.toLowerCase());

      if (tagName === 'a') { // Direct download link
        videoUrl = await videoElement.getAttribute('href');
      } else if (tagName === 'video') { // Video element
        videoUrl = await videoElement.getAttribute('src');
        if (!videoUrl) {
            const sourceElement = await videoElement.$('source[src*=".mp4"]');
            if (sourceElement) videoUrl = await sourceElement.getAttribute('src');
        }
      }

      if (!videoUrl) {
        throw new Error('Generated video URL or src not found from output element.');
      }
      console.log(`[${this.serviceName}] Video URL found: ${videoUrl.substring(0,100)}...`);

      if (videoUrl.startsWith('/')) {
        const pageUrl = new URL(this.page.url());
        videoUrl = `${pageUrl.protocol}//${pageUrl.host}${videoUrl}`;
      } else if (!videoUrl.startsWith('http') && !videoUrl.startsWith('blob:')) {
         console.warn(`[${this.serviceName}] Video URL '${videoUrl}' might be a relative path not correctly handled. Assuming it's absolute or will work with axios.`);
      }

      await fs.mkdir(DOWNLOAD_TEMP_DIR, { recursive: true });
      let extension = 'mp4';
      try {
        const tempUrl = new URL(videoUrl); // Check if it's a valid URL to parse extension
        const extMatch = tempUrl.pathname.match(/\.(mp4|webm|mov|avi)$/i);
        if (extMatch) extension = extMatch[1];
      } catch (e) { /* Invalid URL, use default extension */ }

      const filename = `deepai_video_${Date.now()}.${extension}`;
      const filePath = path.join(DOWNLOAD_TEMP_DIR, filename);

      if (videoUrl.startsWith('blob:')) {
        console.warn(`[${this.serviceName}] Video URL is a blob. Blob download is complex and not fully implemented. This will likely fail or needs specific page context evaluation.`);
        // The following is a conceptual placeholder and might not work directly.
        // const base64data = await this.page.evaluate(async (url) => { /* ... as in template ... */ }, videoUrl);
        // For now, throw error for blob to indicate non-implementation.
        throw new Error("Blob video download not fully implemented for DeepAI. Requires specific page context evaluation.");
      } else {
        const response = await axios({
          method: 'get',
          url: videoUrl,
          responseType: 'stream'
        });
        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on('finish', resolve);
          writer.on('error', reject);
        });
      }

      console.log(`[${this.serviceName}] Video downloaded to: ${filePath}`);
      return { path: filePath };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in generateVideo: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('generateVideo');
      throw error;
    }
  }

  async fetchServiceUsage() {
    if (!this.isInitialized) await this.initialize();
    console.log(`[${this.serviceName}] Fetching service usage information...`);
    let usageInfo = 'Usage information not found or scraping not implemented for DeepAI.';

    try {
      // console.warn(`[${this.serviceName}] fetchServiceUsage() needs specific selectors for DeepAI's UI or API key info.`);
      return { rawUsageData: usageInfo };
    } catch (error) {
      console.error(`[${this.serviceName}] Error in fetchServiceUsage: ${error.message}`, error.stack);
      await this.takeScreenshotOnError('fetchServiceUsage');
      return { rawUsageData: 'Failed to fetch usage data due to an error.', error: error.message };
    }
  }

  async close() {
    if (!this.isInitialized) {
      return;
    }
    await super.close();
    this.isInitialized = false;
    console.log(`[${this.serviceName}] Closed and de-initialized.`);
  }
}

module.exports = { DeepAIVideoService };
