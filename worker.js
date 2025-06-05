// worker.js
const { Worker } = require('bullmq');
const redisConfig = require('./config/redisConfig'); // Path to Redis config
const { ViralContentSystem } = require('./core/viralSystem'); // Updated import

const QUEUE_NAME = 'contentCreationQueue';

// Create a reusable Redis connection object for the Worker
const workerConnection = {
  host: redisConfig.host,
  port: redisConfig.port,
  // password: redisConfig.password, // Uncomment if password is needed
  // BullMQ recommends setting maxRetriesPerRequest to null for worker connections
  // to prevent ioredis from retrying commands internally, allowing BullMQ to handle retries.
  maxRetriesPerRequest: null,
};

let viralSystem; // To hold the ViralContentSystem instance

// Define the job processor function
const processor = async (job) => {
  console.log(`[Job ${job.id}] Processing job: ${job.name}`);
  console.log(`[Job ${job.id}] Data:`, JSON.stringify(job.data, null, 2));

  if (!viralSystem) {
    console.error(`[Job ${job.id}] ViralContentSystem not initialized. Worker might be starting up or encountered an issue.`);
    // This situation should ideally be prevented by the main() function's initialization order.
    // If it occurs, it's a critical failure.
    throw new Error('ViralContentSystem not available at job processing time');
  }

  try {
    let result;
    if (job.name === 'create_viral_content') {
      if (!job.data || typeof job.data.topic !== 'string' || job.data.topic.trim() === '') {
        throw new Error('Invalid or missing topic for create_viral_content job');
      }
      result = await viralSystem.createViralContent(job.data.topic);
    } else if (job.name === 'create_viral_content_from_url') {
      if (!job.data || typeof job.data.url !== 'string' || job.data.url.trim() === '') {
        throw new Error('Invalid or missing url for create_viral_content_from_url job');
      }
      // userId is optional, so pass it as is (could be null/undefined)
      result = await viralSystem.createViralContentFromUrl(job.data.url, job.data.userId);
    } else {
      console.error(`[Job ${job.id}] Unknown job name: ${job.name}`);
      throw new Error(`Unknown job name: ${job.name}`);
    }
    console.log(`[Job ${job.id}] Completed successfully.`);
    return result; // Result is passed to 'completed' event
  } catch (error) {
    console.error(`[Job ${job.id}] Failed to process job ${job.name}. Error:`, error.message, error.stack);
    // Re-throw error to mark job as failed in BullMQ. BullMQ will use this for retry logic.
    throw error;
  }
};

// Initialize ViralContentSystem and then start the worker
async function main() {
  console.log('Initializing ViralContentSystem for worker...');
  try {
    // Instantiate ViralContentSystem
    viralSystem = new ViralContentSystem();
    // Initialize its services (e.g., Google Drive client, loading other service modules)
    // This relies on the ViralContentSystem.initialize() method being robust and
    // that all necessary configurations (like credentials.json for Drive) are accessible.
    await viralSystem.initialize();
    // The ViralContentSystem instance also needs its 'services' object populated.
    // This is typically done by initializeServices() in server.js context.
    // We need to replicate that service loading logic here for the worker's instance of VCS.
    // This is a critical part: the worker needs its own fully initialized VCS.

    // Replicating service loading for the worker's VCS instance:
    // This assumes serviceRegistry and loadService can be adapted or made available.
    // For now, let's assume ViralContentSystem's initialize() correctly sets up its *own* services
    // as per its class definition. If loadService logic is external to VCS class, this will need more.
    // Based on current server.js, `viralSystem.initialize()` only sets up Drive and temp dir.
    // The actual services (groq, claude etc.) are loaded into `viralSystem.services` by `initializeServices()`
    // which iterates over `serviceRegistry` and calls `loadService(name)`.
    // This logic needs to be available to the worker.

    // Simplification: Assume ViralContentSystem's constructor or initialize()
    // can be made to load its own dependent services if we refactor it.
    // For now, the worker's VCS might not have all services like groq, claude loaded
    // unless ViralContentSystem.initialize() is more comprehensive or we call a similar
    // service loading utility here.

    // Let's assume for this step that ViralContentSystem.initialize() is enough,
    // and it also calls something equivalent to initializeServices() for its own instance.
    await viralSystem.initialize(); // Base initialization (Drive, TempDir)
    await viralSystem.initialize_dependent_services(); // CRITICAL ADDITION HERE
    console.log('ViralContentSystem and its dependent services initialized successfully for worker.');

    const worker = new Worker(QUEUE_NAME, processor, {
      connection: workerConnection,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 60000,
      },
    });

    worker.on('completed', (job, result) => {
      let driveLink = 'N/A';
      if (result && result.driveLink) {
        driveLink = result.driveLink;
      } else if (result && result.posts && result.posts.youtube && result.posts.youtube.webViewLink) {
        // Fallback if driveLink isn't top-level but nested in a common place
        driveLink = result.posts.youtube.webViewLink;
      }
      console.log(`[Job ${job.id}] Completed. Result (Drive Link or relevant info): ${driveLink}`);
    });

    worker.on('failed', (job, err) => {
      // job might be undefined if the error is not job-specific (e.g. connection issue during job fetch)
      const jobId = job ? job.id : 'N/A';
      const jobName = job ? job.name : 'N/A';
      const attemptsMade = job ? job.attemptsMade : 'N/A';
      console.error(`[Job ${jobId}] (${jobName}) Marked as Failed after ${attemptsMade} attempts. Error: ${err.message}`, err.stack);
    });

    worker.on('error', err => {
      // General errors for the worker itself (e.g., connection issues)
      console.error('BullMQ Worker Error:', err);
    });

    console.log(`Worker started for queue: ${QUEUE_NAME}. Waiting for jobs...`);

    // Graceful shutdown
    const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\nReceived ${signal}. Shutting down worker gracefully...`);
        try {
          await worker.close();
          console.log('BullMQ Worker closed.');

          // Close services associated with the worker's ViralContentSystem instance
          if (viralSystem && viralSystem.services) {
            console.log('Closing services managed by ViralContentSystem...');
            for (const serviceName in viralSystem.services) {
              const service = viralSystem.services[serviceName];
              if (service && typeof service.close === 'function') {
                try {
                  await service.close();
                  console.log(`Service ${serviceName} closed.`);
                } catch (closeError) {
                  console.error(`Error closing service ${serviceName}:`, closeError);
                }
              }
            }
            console.log('All manageable services closed.');
          }
        } catch (err) {
          console.error('Error during graceful shutdown:', err);
        } finally {
          console.log('Worker process exiting.');
          process.exit(0);
        }
      });
    });

  } catch (error) {
    console.error('Failed to initialize ViralContentSystem or Worker:', error);
    process.exit(1); // Exit if core setup fails
  }
}

main();
