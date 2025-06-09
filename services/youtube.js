const { BaseAIService } = require('../base');
const retry = require('async-retry');
const path = require('path');
const fs = require('fs').promises; // Not strictly needed for screenshot, but good for HTML dump if added
const logger = require('../../lib/logger');
const config = require('../../config');

class YouTubeService extends BaseAIService {
  constructor(name, url) { // BaseAIService might pass page, or initialize it
    super(name, url);
    // this.page should be initialized by BaseAIService's initialize method
  }

  async postContent({ videoPath, title, description, tags }) { // Renamed 'video' to 'videoPath' for clarity
    const serviceName = this.name || 'YouTubeService';
    const methodName = 'postContent';

    if (!this.page || this.page.isClosed()) {
      logger.error({ serviceName, methodName }, 'Playwright page is not available or closed. Attempting to re-initialize.');
      // Attempt to re-initialize the page if BaseAIService provides such a method,
      // or if this service's own initialize() can be safely called.
      // This depends on BaseAIService structure. For now, we'll assume initialize sets up a page.
      try {
        await this.initialize(); // This should set up this.page from BaseAIService
        if (!this.page || this.page.isClosed()) {
           throw new Error('Failed to re-initialize Playwright page.');
        }
        logger.info({serviceName, methodName}, 'Playwright page re-initialized successfully.');
      } catch (initError) {
        logger.error({ err: initError, serviceName, methodName }, 'Failed to re-initialize Playwright page during postContent.');
        throw initError; // Propagate error if re-initialization fails
      }
    }
    
    return retry(async (bail, attemptNumber) => {
      logger.debug({ attemptNumber, serviceName, methodName, videoPath, title }, 'Attempting to post content to YouTube');
      try {
        // Ensure page is not closed at the start of an attempt
        if (!this.page || this.page.isClosed()) {
          logger.warn({ serviceName, attemptNumber, methodName }, 'Page was closed at start of attempt. This should ideally be handled by re-initialization before retry.');
          throw new Error('Playwright page is closed at start of retry attempt.');
        }

        await this.page.goto(this.url || 'https://studio.youtube.com', { waitUntil: 'networkidle', timeout: config.timeouts.youtubeNavigationMs || 60000 });

        logger.debug({ serviceName, methodName, attemptNumber }, 'Clicking create button');
        await this.page.click('button[aria-label="Create"]');
        logger.debug({ serviceName, methodName, attemptNumber }, 'Clicking upload video text');
        await this.page.click('text="Upload video"');

        logger.debug({ serviceName, methodName, attemptNumber, videoPath }, 'Setting files for upload');
        const [fileChooser] = await Promise.all([
          this.page.waitForEvent('filechooser', { timeout: config.timeouts.youtubeFileChooserMs || 15000 }),
          this.page.click('div#upload-prompt-box')
        ]);
        await fileChooser.setFiles(videoPath); // Use videoPath
        logger.info({ serviceName, methodName, attemptNumber, videoPath }, 'Video file selected for upload.');

        logger.debug({ serviceName, methodName, attemptNumber }, 'Filling video details');
        await this.page.waitForSelector('input#textbox', { timeout: config.timeouts.youtubeElementWaitMs || 30000 });
        await this.page.fill('input#textbox', title);
        await this.page.fill('textarea#description', description);
        await this.page.fill('input#tags', tags.join(','));

        // "Not for kids" selection - this might be needed to unblock publishing
        // Selector might vary based on UI language
        // logger.debug({ serviceName, methodName, attemptNumber }, 'Selecting "Not for kids"');
        // await this.page.click('input[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'); // Example selector

        logger.debug({ serviceName, methodName, attemptNumber }, 'Clicking "Next" multiple times to reach visibility');
        for (let i = 0; i < 3; i++) { // Typically 3 "Next" clicks: Details -> Checks -> Visibility
            await this.page.waitForSelector('button#next-button', { timeout: config.timeouts.youtubeElementWaitMs || 10000 });
            await this.page.click('button#next-button');
            logger.debug({ serviceName, methodName, attemptNumber, clickCount: i + 1 }, 'Clicked "Next" button');
            await this.page.waitForTimeout(1000); // Small delay for UI to update
        }

        logger.debug({ serviceName, methodName, attemptNumber }, 'Setting visibility to Public');
        await this.page.waitForSelector('button[name="PUBLIC"]', { timeout: config.timeouts.youtubeElementWaitMs || 10000 });
        await this.page.click('button[name="PUBLIC"]');

        logger.debug({ serviceName, methodName, attemptNumber }, 'Clicking done/publish button');
        await this.page.waitForSelector('button#done-button', { timeout: config.timeouts.youtubeElementWaitMs || 10000 });
        await this.page.click('button#done-button');

        logger.debug({ serviceName, methodName, attemptNumber }, 'Waiting for video link selector');
        // Increased timeout for this selector as video processing can take time
        await this.page.waitForSelector('a.ytcp-video-info', { timeout: config.timeouts.youtubeVideoLinkMs || 300000 }); // 5 minutes
        const videoUrl = await this.page.$eval('a.ytcp-video-info', a => a.href);

        logger.info({ serviceName, methodName, attemptNumber, videoUrl }, 'Content posted successfully to YouTube');
        return videoUrl;

      } catch (error) {
        logger.warn({ err: error, serviceName, attemptNumber, methodName }, 'YouTube postContent attempt failed');
        if (config.debug.savePlaywrightFailureArtifacts && this.page && !this.page.isClosed()) {
          try {
            const timestamp = Date.now();
            const screenshotPath = path.join(config.tempDir, `youtube_failure_attempt${attemptNumber}_${timestamp}.png`);
            await this.page.screenshot({ path: screenshotPath, fullPage: true });
            logger.info({ screenshotPath }, 'Saved screenshot on Playwright failure (YouTube).');
          } catch (artifactError) {
            logger.error({ err: artifactError, serviceName }, 'Failed to save Playwright failure artifacts (YouTube).');
          }
        }
        // Example: Bailing on specific errors like invalid credentials or account issues
        // if (error.message.includes('Authentication failed') || error.message.includes('Account issue')) {
        //   logger.error({ err: error, serviceName, methodName }, 'Non-retriable error from YouTube. Bailing.');
        //   bail(error);
        //   return;
        // }
        throw error;
      }
    }, {
      retries: config.jobDefaultAttempts || 2, // YouTube uploads can be sensitive; adjust retries
      factor: 2,
      minTimeout: config.jobDefaultBackoffDelay || 10000, // Longer min timeout for UI operations
      maxTimeout: 60000, // Max 1 minute between retries
      onRetry: (err, attempt) => {
        logger.warn({ err, attempt, serviceName, methodName }, 'Retrying YouTube postContent call...');
        // Consider if page needs to be reloaded or re-navigated on retry.
        // The current logic re-navigates at the start of each try block.
      }
    });
  }
}

module.exports = YouTubeService;