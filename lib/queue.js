// lib/queue.js
const { Queue } = require('bullmq');
const redisConfig = require('../config/redisConfig'); // Adjust path if needed

const QUEUE_NAME = 'contentCreationQueue';

// Create a connection object for ioredis
const connection = {
  host: redisConfig.host,
  port: redisConfig.port,
  // password: redisConfig.password, // Uncomment if password is needed
  maxRetriesPerRequest: null // Recommended by BullMQ docs for some environments
};

const contentCreationQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: { // Default options for jobs added to this queue
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000, // Initial delay of 5 seconds
    },
    removeOnComplete: { // Keep completed jobs for a limited time or count
        count: 1000, // Keep the last 1000 completed jobs
        age: 24 * 60 * 60 // Keep for 24 hours (in seconds)
    },
    removeOnFail: { // Keep failed jobs for a longer period or more count
        count: 5000, // Keep the last 5000 failed jobs
        age: 7 * 24 * 60 * 60 // Keep for 7 days (in seconds)
    }
  }
});

contentCreationQueue.on('error', (error) => {
  console.error(`BullMQ Queue (${QUEUE_NAME}) Error:`, error);
});

// Simple check to see if connection is established (optional)
// BullMQ doesn't have a direct 'connect' event on the Queue object itself for the initial connection in the same way ioredis client does.
// The queue will attempt to connect when operations are performed or workers are attached.
// We can, however, try a benign command or check client status if we had direct access to the ioredis instance BullMQ uses.
// For now, the 'error' listener and successful instantiation are primary indicators.

// A more robust check could involve trying to add a dummy job or querying queue status,
// but that's more involved than typical initialization logging.
// Alternatively, BullMQ's Worker class has more explicit connection events.

console.log(`BullMQ Queue (${QUEUE_NAME}) initialized. Waiting for connection to Redis at ${redisConfig.host}:${redisConfig.port}`);

// To confirm connection, you might ping Redis using the client BullMQ creates:
// (async () => {
//   try {
//     const redisClient = await contentCreationQueue.client; // Gets the ioredis client instance
//     const pong = await redisClient.ping();
//     if (pong === 'PONG') {
//       console.log(`Successfully connected to Redis and received PONG for queue ${QUEUE_NAME}.`);
//     }
//   } catch (err) {
//     console.error(`Failed to connect to Redis for queue ${QUEUE_NAME}:`, err);
//   }
// })();


module.exports = contentCreationQueue;
