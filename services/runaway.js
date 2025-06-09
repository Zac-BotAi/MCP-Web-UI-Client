const { BaseAIService } = require('../base');
const retry = require('async-retry');
const logger = require('../../lib/logger');
const config = require('../../config');
const path = require('path'); // Added path require

class RunwayService extends BaseAIService {
  constructor(name, url) { // Added constructor
    super(name, url);     // Pass to BaseAIService
    // this.page is initialized in BaseAIService.initialize()
  }

  async generateVideo(strategy) {
    const serviceName = this.name || 'RunwayService';
    const methodName = 'generateVideo';

    if (!this.page) {
      logger.error({ serviceName, methodName }, 'Playwright page not initialized for RunwayService.');
      throw new Error('Playwright page not initialized for RunwayService. Call initialize() first.');
    }

    return retry(async (bail, attemptNumber) => {
      logger.debug({ attemptNumber, serviceName, methodName, visualPrompt: strategy.visualPrompt }, 'Attempting video generation');
      try {
        // Navigate to the page
        // Using this.url if provided by serviceRegistry, otherwise default.
        const targetUrl = this.url || 'https://app.runwayml.com/video-tools';
        await this.page.goto(targetUrl, { waitUntil: 'networkidle' });

        logger.debug({ serviceName, methodName, attemptNumber }, 'Filling prompt and submitting for video generation');
        await this.page.fill('textarea.prompt-input', strategy.visualPrompt);
        await this.page.click('button.generate-video');

        logger.debug({ serviceName, methodName, attemptNumber }, 'Waiting for video generation selector');
        await this.page.waitForSelector('.generated-video', { timeout: config.timeouts.runwayVideoGenerationMs });

        logger.debug({ serviceName, methodName, attemptNumber }, 'Attempting to download video');
        const [download] = await Promise.all([
          this.page.waitForEvent('download', {timeout: config.timeouts.runwayDownloadMs }),
          this.page.click('button.download-video')
        ]);

        const fileName = `video-${Date.now()}.mp4`;
        // Use config.tempDir for save path
        const savePath = path.join(config.tempDir, fileName);
        await download.saveAs(savePath);
        logger.info({ serviceName, methodName, attemptNumber, savePath, fileName }, 'Video downloaded successfully');

        return { path: savePath, fileName };
      } catch (error) {
        logger.warn({ err: error, attemptNumber, serviceName, methodName }, 'Video generation attempt failed');

        // Example: Bailing on a specific type of error if needed
        // if (error.name === 'TargetClosedError' || error.message.includes('Download failed')) {
        //   logger.error({ err: error, serviceName, methodName }, 'Critical error during video generation/download. Bailing.');
        //   bail(error);
        //   return;
        // }
        throw error; // Re-throw to trigger retry
      }
    }, {
      retries: config.jobDefaultAttempts || 2, // Videos can be long, maybe fewer retries than text
      factor: 2,
      minTimeout: config.jobDefaultBackoffDelay || 5000, // Longer min timeout
      maxTimeout: 30000,
      onRetry: (err, attempt) => {
        logger.warn({ err, attempt, serviceName, methodName }, 'Retrying video generation call...');
        // Optional: Add logic here to reset page state if necessary, e.g., this.page.reload()
        // However, this might be complex. The `goto` at the start of the try block often handles this.
      }
    });
  }
}

module.exports = RunwayService;