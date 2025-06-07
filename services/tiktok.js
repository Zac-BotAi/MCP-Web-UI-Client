// Stub for TikTokService
const { BaseAIService } = require('../base'); // Required for extending
// const path = require('path'); // No longer needed here for screenshots
// const fs = require('fs').promises; // No longer needed here for screenshots

class TikTokService extends BaseAIService {
  constructor(name, url) {
    super('TikTokService', 'tiktok_session'); // Call BaseAIService constructor
    this.url = url; // Expected to be https://tiktok.com by server.js
    console.log(`[${this.serviceName}] service initialized for URL: ${this.url}`);
  }

  // initialize() is inherited from BaseAIService
  // close() is inherited from BaseAIService

  async postContent({ video: videoPath, caption, tags }) {
    console.log(`[${this.serviceName}] Starting TikTok post for video: ${videoPath}`);
    let screenshotTakenForIframe = false; // Flag to avoid double screenshots
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }
    if (!videoPath) {
        throw new Error("videoPath is required to upload to TikTok.");
    }

    try {
      await this.page.goto('https://www.tiktok.com/upload?lang=en', { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to TikTok Upload page.`);

      const iframeSelector = 'iframe[data-tt="Upload_Video_Tiktok_Web_Video_Single_Page_Root"]';
      console.log(`[${this.serviceName}] Waiting for TikTok upload iframe: ${iframeSelector}`);
      await this.page.waitForSelector(iframeSelector, { timeout: 45000 });

      const iframeElement = await this.page.$(iframeSelector);
      if (!iframeElement) {
        console.error(`[${this.serviceName}] TikTok upload iframe not found. Page might be showing login/CAPTCHA or UI changed.`);
        await this.takeScreenshotOnError('iframe_not_found');
        screenshotTakenForIframe = true; // Set flag
        throw new Error('TikTok upload iframe not found. Possible login issue, CAPTCHA, or UI change.');
      }

      const frame = await iframeElement.contentFrame();
      if (!frame) {
        // This case might not need a separate screenshot if iframeElement was found but contentFrame failed.
        // However, if it's a distinct failure point, a screenshot could be useful.
        // For now, assume iframe_not_found screenshot is sufficient if this path is reached due to iframe issues.
        throw new Error('Could not get content frame of TikTok iframe.');
      }
      console.log(`[${this.serviceName}] Switched to TikTok upload iframe context.`);

      const uploadTriggerSelector = 'div.upload-card';
      console.log(`[${this.serviceName}] Waiting for upload trigger in iframe: ${uploadTriggerSelector}`);
      await frame.waitForSelector(uploadTriggerSelector, { timeout: 30000 });

      const [fileChooser] = await Promise.all([
        this.page.waitForEvent('filechooser', {timeout: 10000}),
        frame.click(uploadTriggerSelector)
      ]);
      await fileChooser.setFiles(videoPath);
      console.log(`[${this.serviceName}] File ${videoPath} selected for upload.`);

      console.log(`[${this.serviceName}] Waiting for video to process (up to 3 mins)...`);
      await frame.waitForSelector('div.video-infos span:has-text("Edit video")', { timeout: 180000 });
      console.log(`[${this.serviceName}] Video processed and ready for details.`);

      const captionInputSelector = 'div.DraftEditor-editorContainer div[contenteditable="true"]';
      console.log(`[${this.serviceName}] Waiting for caption input in iframe: ${captionInputSelector}`);
      await frame.waitForSelector(captionInputSelector, { timeout: 20000 });

      const fullCaption = `${caption} ${tags.map(t => `#${t.trim()}`).join(' ')}`;
      await frame.fill(captionInputSelector, fullCaption);
      console.log(`[${this.serviceName}] Caption and tags filled: "${fullCaption}"`);

      console.log(`[${this.serviceName}] Using default settings for cover, privacy, etc.`);

      const postButtonSelector = 'div.btn-post button';
      console.log(`[${this.serviceName}] Waiting for Post button in iframe: ${postButtonSelector}`);
      await frame.waitForSelector(postButtonSelector, { timeout: 20000 });

      console.log(`[${this.serviceName}] Waiting for Post button to be enabled (up to 3 mins)...`);
      await frame.waitForFunction(selector => {
        const button = document.querySelector(selector);
        return button && !button.disabled;
      }, postButtonSelector, { timeout: 180000 });

      await frame.click(postButtonSelector);
      console.log(`[${this.serviceName}] Post button clicked.`);

      console.log(`[${this.serviceName}] Waiting for post confirmation (up to 1 min)...`);
      await this.page.waitForSelector('div[class*="modal-success_container"]', { timeout: 60000 });
      console.log(`[${this.serviceName}] Video posted successfully (confirmation dialog appeared).`);

      const postId = `tiktok_post_${Date.now()}`;
      console.log(`[${this.serviceName}] Post successful. Generated postId: ${postId}`);
      return { postId: postId, postLink: null };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'postContent': ${error.message}`, error.stack);
      if (!screenshotTakenForIframe) { // Avoid double screenshot if one was already taken for iframe issue
        await this.takeScreenshotOnError('postContent');
      }
      throw error;
    }
  }
}

module.exports = TikTokService;
