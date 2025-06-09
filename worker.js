// worker.js
const { Worker } = require('bullmq');
const config = require('./config'); // Added config require
const { ViralContentSystem } = require('./core/viralSystem'); // Updated import
const logger = require('./lib/logger'); // Added logger require

const QUEUE_NAME = 'contentCreationQueue';

// Create a reusable Redis connection object for the Worker
const workerConnection = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password, // Will be undefined if not set, which is fine for ioredis
  // BullMQ recommends setting maxRetriesPerRequest to null for worker connections
  // to prevent ioredis from retrying commands internally, allowing BullMQ to handle retries.
  maxRetriesPerRequest: null,
};

let viralSystem; // To hold the ViralContentSystem instance

// Define the job processor function
const processor = async (job) => {
  logger.info({ jobId: job.id, jobName: job.name, jobData: job.data }, 'Processing job');

  if (!viralSystem) {
    logger.error({ jobId: job.id, jobName: job.name }, 'ViralContentSystem not initialized. Worker might be starting up or encountered an issue.');
    throw new Error('ViralContentSystem not available at job processing time');
  }

  try {
    let result;
    if (job.name === 'create_viral_content') {
      if (!job.data || typeof job.data.topic !== 'string' || job.data.topic.trim() === '') {
        logger.warn({ jobId: job.id, jobData: job.data }, 'Invalid or missing topic for create_viral_content job');
        throw new Error('Invalid or missing topic for create_viral_content job');
      }
      result = await viralSystem.createViralContent(job.data.topic);
    } else if (job.name === 'create_viral_content_from_url') {
      if (!job.data || typeof job.data.url !== 'string' || job.data.url.trim() === '') {
        logger.warn({ jobId: job.id, jobData: job.data }, 'Invalid or missing url for create_viral_content_from_url job');
        throw new Error('Invalid or missing url for create_viral_content_from_url job');
      }
      result = await viralSystem.createViralContentFromUrl(job.data.url, job.data.userId);
    } else {
      logger.error({ jobId: job.id, jobName: job.name }, 'Unknown job name');
      throw new Error(`Unknown job name: ${job.name}`);
    }
    logger.info({ jobId: job.id }, 'Job completed successfully by processor.');
    return result;
  } catch (error) {
    logger.error({ err: error, jobId: job.id, jobName: job.name }, 'Failed to process job in processor');
    throw error;
  }
};

// Initialize ViralContentSystem and then start the worker
async function main() {
  logger.info('Initializing ViralContentSystem for worker...');
  try {
    viralSystem = new ViralContentSystem();
    await viralSystem.initialize();
    await viralSystem.initialize_dependent_services();
    logger.info('ViralContentSystem and its dependent services initialized successfully for worker.');

    const worker = new Worker(QUEUE_NAME, processor, {
      connection: workerConnection,
      concurrency: config.workerConcurrency,
      limiter: {
        max: config.workerRateLimit.max,
        duration: config.workerRateLimit.duration,
      },
    });

    worker.on('completed', (job, result) => {
      const driveLink = (result && result.driveLink) || (result && result.posts && result.posts.youtube && result.posts.youtube.webViewLink) || 'N/A';
      logger.info({ jobId: job.id, jobName: job.name, driveLink }, 'Job completed.');
    });

    worker.on('failed', (job, err) => {
      const jobId = job ? job.id : 'N/A';
      const jobName = job ? job.name : 'N/A';
      const attemptsMade = job ? job.attemptsMade : 'N/A';
      logger.error({ err, jobId, jobName, attemptsMade }, 'Job marked as Failed.');
    });

    worker.on('error', err => {
      logger.error({ err }, 'BullMQ Worker Error');
    });

    logger.info({ queueName: QUEUE_NAME, concurrency: config.workerConcurrency }, 'Worker started. Waiting for jobs...');

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info({ signal }, `Received signal. Shutting down worker gracefully...`);
        try {
          await worker.close();
          logger.info('BullMQ Worker closed.');

          if (viralSystem && viralSystem.services) {
            logger.info('Closing services managed by ViralContentSystem...');
            for (const serviceName in viralSystem.services) {
              const service = viralSystem.services[serviceName];
              if (service && typeof service.close === 'function') {
                try {
                  await service.close();
                  logger.info({ serviceName }, `Service closed.`);
                } catch (closeError) {
                  logger.error({ err: closeError, serviceName }, `Error closing service.`);
                }
              }
            }
            logger.info('All manageable services closed.');
          }
        } catch (err) {
          logger.error({ err }, 'Error during graceful shutdown.');
        } finally {
          logger.info('Worker process exiting.');
          process.exit(0);
        }
      });
    });

  } catch (error) {
    logger.fatal({ err: error }, 'Failed to initialize ViralContentSystem or Worker');
    process.exit(1);
  }
}

main();
