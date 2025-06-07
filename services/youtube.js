const { BaseAIService } = require('../base');
// const path = require('path'); // No longer needed here if TEMP_DIR is handled by BaseAIService
// const fs = require('fs').promises; // No longer needed here if TEMP_DIR is handled by BaseAIService

class YouTubeService extends BaseAIService {
  constructor(name, url) {
    super('YouTubeService', 'youtube_session');
    this.url = url; // Expected to be https://youtube.com or similar by server.js, though we go to studio.
    console.log(`[${this.serviceName}] service initialized for URL: ${this.url}`);
  }

  async postContent({ video: videoPath, title, description, tags }) {
    console.log(`[${this.serviceName}] Starting YouTube post for video: ${videoPath}`);
    if (!this.page) {
      throw new Error("Playwright page is not initialized. Call initialize() first.");
    }
    if (!videoPath) {
        throw new Error("videoPath is required to upload to YouTube.");
    }

    try {
      await this.page.goto('https://studio.youtube.com/', { waitUntil: 'networkidle', timeout: 60000 });
      console.log(`[${this.serviceName}] Navigated to YouTube Studio.`);
      // Conceptual: Login check - BaseAIService session should handle.
      // await this.page.waitForTimeout(2000); // Allow dashboard to settle

      const createButtonSelector = 'ytcp-button#create-button button';
      console.log(`[${this.serviceName}] Waiting for Create button: ${createButtonSelector}`);
      await this.page.waitForSelector(createButtonSelector, { timeout: 30000 }); // Increased timeout
      await this.page.click(createButtonSelector);

      const uploadVideoMenuSelector = 'tp-yt-paper-item#menu-item-0'; // More stable selector for "Upload videos"
      console.log(`[${this.serviceName}] Waiting for Upload Video menu item: ${uploadVideoMenuSelector}`);
      await this.page.waitForSelector(uploadVideoMenuSelector, { timeout: 10000 });
      await this.page.click(uploadVideoMenuSelector);
      console.log(`[${this.serviceName}] Initiated video upload flow.`);

      const selectFileButtonSelector = 'ytcp-button#select-files-button'; // Or 'div#upload-prompt-box' / input[type=file]
      console.log(`[${this.serviceName}] Waiting for Select Files button: ${selectFileButtonSelector}`);
      await this.page.waitForSelector(selectFileButtonSelector, { timeout: 20000 }); // Increased timeout

      const [fileChooser] = await Promise.all([
        this.page.waitForEvent('filechooser', {timeout: 10000}),
        this.page.click(selectFileButtonSelector)
      ]);
      await fileChooser.setFiles(videoPath);
      console.log(`[${this.serviceName}] File ${videoPath} selected for upload.`);

      // Wait for upload dialog to appear and title to be focusable
      const titleInputSelector = 'ytcp-social-suggestions-textbox#title-textarea #textbox';
      console.log(`[${this.serviceName}] Waiting for Title input: ${titleInputSelector}`);
      await this.page.waitForSelector(titleInputSelector, { timeout: 120000 }); // Longer timeout for upload processing to start & UI to update

      await this.page.fill(titleInputSelector, title);
      console.log(`[${this.serviceName}] Title filled: "${title}"`);

      const descriptionInputSelector = 'ytcp-social-suggestions-textbox#description-textarea #textbox';
      console.log(`[${this.serviceName}] Waiting for Description input: ${descriptionInputSelector}`);
      await this.page.waitForSelector(descriptionInputSelector, { timeout: 10000 });
      await this.page.fill(descriptionInputSelector, description);
      console.log(`[${this.serviceName}] Description filled.`);

      // Tags (Optional, might be hidden under "Show More")
      const showMoreButtonSelector = 'ytcp-button#toggle-button'; // This is the "Show More" button
      console.log(`[${this.serviceName}] Looking for "Show More" button: ${showMoreButtonSelector}`);
      if (await this.page.isVisible(showMoreButtonSelector)) {
        await this.page.click(showMoreButtonSelector);
        console.log(`[${this.serviceName}] Clicked "Show More" button.`);
        await this.page.waitForTimeout(1000); // Wait for section to expand
      }

      const tagsInputSelector = 'ytcp-form-input-container#tags-container input#text-input';
      // Check if tags input is visible before trying to fill
      if (await this.page.isVisible(tagsInputSelector)) {
        console.log(`[${this.serviceName}] Waiting for Tags input: ${tagsInputSelector}`);
        await this.page.waitForSelector(tagsInputSelector, { timeout: 10000 });
        await this.page.fill(tagsInputSelector, tags.join(','));
        console.log(`[${this.serviceName}] Tags filled: ${tags.join(',')}`);
      } else {
        console.log(`[${this.serviceName}] Tags input not visible, skipping.`);
      }


      const notMadeForKidsRadioSelector = 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]';
      console.log(`[${this.serviceName}] Waiting for 'Not made for kids' radio: ${notMadeForKidsRadioSelector}`);
      await this.page.waitForSelector(notMadeForKidsRadioSelector, { timeout: 10000 });
      await this.page.click(notMadeForKidsRadioSelector);
      console.log(`[${this.serviceName}] Audience set to 'Not made for kids'.`);

      const nextButtonSelector = 'ytcp-button#next-button';
      console.log(`[${this.serviceName}] Clicking Next (Details -> Video elements)`);
      await this.page.click(nextButtonSelector);
      await this.page.waitForTimeout(2000);

      console.log(`[${this.serviceName}] Clicking Next (Video elements -> Checks)`);
      await this.page.click(nextButtonSelector);
      await this.page.waitForTimeout(2000);

      console.log(`[${this.serviceName}] Waiting for video checks to complete... (up to 5 mins)`);
      // Wait for "Checks complete no issues found" or similar text, or absence of error indicators.
      // This selector targets the text directly.
      const checksCompleteSelector = 'span#checks-subtitle:has-text("Checks complete")';
      try {
        await this.page.waitForSelector(checksCompleteSelector, { timeout: 300000 }); // 5 min
        console.log(`[${this.serviceName}] Video checks completed.`);
      } catch (e) {
        console.warn(`[${this.serviceName}] Timed out waiting for checks to complete text, or checks found issues. Proceeding cautiously.`);
        // Check for error icon as a fallback
        if (await this.page.isVisible('ytcp-video-checks span#checks-error-indicator-icon')) {
            console.error(`[${this.serviceName}] Video checks reported an error.`);
            // Decide if to throw or proceed. For now, proceed.
        }
      }

      console.log(`[${this.serviceName}] Clicking Next (Checks -> Visibility)`);
      await this.page.click(nextButtonSelector);
      await this.page.waitForTimeout(2000);

      const publicRadioSelector = 'tp-yt-paper-radio-button[name="PUBLIC"]';
      console.log(`[${this.serviceName}] Waiting for Public visibility radio: ${publicRadioSelector}`);
      await this.page.waitForSelector(publicRadioSelector, { timeout: 10000 });
      await this.page.click(publicRadioSelector);
      console.log(`[${this.serviceName}] Visibility set to Public.`);

      const publishButtonSelector = 'ytcp-button#done-button';
      console.log(`[${this.serviceName}] Waiting for Publish button: ${publishButtonSelector}`);
      await this.page.waitForSelector(publishButtonSelector, { timeout: 10000 });
      await this.page.click(publishButtonSelector);
      console.log(`[${this.serviceName}] Publish button clicked.`);

      const videoLinkSelector = 'a.ytcp-video-info'; // This link appears on the final "Published" dialog
      console.log(`[${this.serviceName}] Waiting for video link: ${videoLinkSelector}`);
      await this.page.waitForSelector(videoLinkSelector, { timeout: 180000 }); // Wait up to 3 mins for publish to finalize

      const videoUrl = await this.page.$eval(videoLinkSelector, a => a.href);
      console.log(`[${this.serviceName}] Video published. URL: ${videoUrl}`);

      // Conceptual: Close the upload dialog
      const closeDialogButtonSelector = 'ytcp-button#close-button'; // Or similar for the final dialog
      if (await this.page.isVisible(closeDialogButtonSelector)) {
        await this.page.click(closeDialogButtonSelector);
        console.log(`[${this.serviceName}] Upload/Published dialog closed.`);
      }

      return { postId: videoUrl, videoLink: videoUrl };

    } catch (error) {
      console.error(`[${this.serviceName}] Error in 'postContent': ${error.message}`, error.stack);
      await this.takeScreenshotOnError('postContent');
      throw error;
    }
  }
}

module.exports = YouTubeService;