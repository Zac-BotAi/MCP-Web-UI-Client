// server.js - Enhanced Viral Content MCP System
const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
// server.js - Enhanced Viral Content MCP System
const express = require('express');
// const { chromium } = require('playwright'); // Playwright might not be needed directly in server.js anymore
const fs = require('fs').promises;
const path = require('path');
// const axios = require('axios'); // If not used by other parts of server.js, can be removed
// const { google } = require('googleapis'); // Moved to core/viralSystem.js
// const { v4: uuidv4 } = require('uuid'); // Moved to core/viralSystem.js
const contentCreationQueue = require('./lib/queue');
const { ViralContentSystem } = require('./core/viralSystem'); // Import from new location
const helmet = require('helmet'); // Added helmet require
const rateLimit = require('express-rate-limit'); // Added express-rate-limit require
const config = require('./config'); // Added config require
const logger = require('./lib/logger'); // Added logger require

const app = express();
app.use(helmet()); // Use helmet for enhanced security
// const port = 3000; // Port now from config
const SESSION_DIR = path.join(__dirname, 'sessions');
// const TEMP_DIR = path.join(__dirname, 'temp'); // TEMP_DIR is now managed by ViralContentSystem via config

// Service registry, loadService, initializeServices are removed as they are now in ViralContentSystem.

// Middleware
app.use(express.json());

// ViralContentSystem class definition is removed from here.

// Initialize system (ViralContentSystem instance for the server, if needed for other routes or direct use)
// For a setup where all work is done by workers, this server-side instance might be minimal
// or not used for createViralContent/createViralContentFromUrl.
// However, the existing `start` function initializes and uses it for service cleanup.
// So, we still need an instance, but its services are loaded differently.
let viralSystem; // Declare to be initialized in start()

// Health Check Endpoint
app.get('/health', (req, res) => {
  const healthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(), // Optional: include process uptime in seconds
  };
  res.status(200).json(healthStatus);
});

// Rate limiter configuration
const apiLimiter = rateLimit({
  windowMs: config.apiRateLimitWindowMs,
  max: config.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    jsonrpc: '2.0',
    error: {
      code: -32005, // Custom error code for rate limiting
      message: 'Too many requests created from this IP, please try again after 15 minutes.'
    },
    id: null // Typically, no specific request id for a rate limit global error
             // If req.body.id is needed, a custom handler would be more appropriate
  },
  // Note: For the 'id' in the rate limit message, if it's crucial to reflect the specific request's id,
  // a custom 'handler' function for rateLimit would be needed to access `req.body.id`.
  // The default 'message' option doesn't have direct access to 'req'.
  // For now, 'id: null' is kept as per the simpler setup.
});

// MCP Endpoint for viral content creation
app.post('/mcp/viral-content', apiLimiter, async (req, res) => { // Added apiLimiter to the route
  const { id: requestId, method, params } = req.body; // Renamed id to requestId for clarity

  // Ensure params is an object if it's undefined, for safer access later
  const safeParams = params || {};

  try {
    // Validate method and parameters first
    if (method === 'create_viral_content') {
      if (!safeParams.topic || typeof safeParams.topic !== 'string' || safeParams.topic.trim() === '') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: Missing or empty topic' },
          id: requestId
        });
      }
    } else if (method === 'create_viral_content_from_url') {
      if (!safeParams.url || typeof safeParams.url !== 'string' || safeParams.url.trim() === '') {
        return res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32602, message: 'Invalid params: Missing or empty url' },
          id: requestId
        });
      }
    } else {
      return res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: 'Method not found' },
        id: requestId
      });
    }

    // Prepare job data
    const jobData = { ...safeParams, userId: safeParams.userId || null }; // Pass necessary params to the job
                                                                      // 'method' will be the job name

    // Add job to queue
    try {
      const job = await contentCreationQueue.add(method, jobData);
      logger.info({ jobId: job.id, jobName: method, jobData }, 'Job added to queue');

      // Respond with 202 Accepted
      return res.status(202).json({
        jsonrpc: '2.0',
        result: {
          status: 'pending',
          jobId: job.id,
          message: 'Content creation request accepted and queued.'
        },
        id: requestId
      });

    } catch (queueError) {
      logger.error({ err: queueError, jobName: method, jobData, requestId }, 'Failed to add job to queue');
      return res.status(503).json({ // Service Unavailable
        jsonrpc: '2.0',
        error: {
          code: -32001, // Custom server error code for queue failure
          message: 'Failed to queue content creation request. Please try again later.'
        },
        id: requestId
      });
    }

  } catch (error) {
    // This main catch block now primarily handles unexpected errors
    // or errors from the validation logic if any were missed (though they should return directly).
    // Log the full error server-side for debugging
    logger.error({ err: error, requestId }, 'API Endpoint Unhandled Error');

    // Send a generic error message to the client
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32000, // Standard JSON-RPC server error code
        message: 'An internal server error occurred. The issue has been logged. Please try again later.'
      },
      id: requestId // Ensure 'id' is correctly sourced from the request body (aliased as requestId)
    });
  }
});

// Service loader and initializeServices are removed.

// Start server
async function start() {
  try {
    await fs.mkdir(SESSION_DIR, { recursive: true });

    logger.info('Initializing ViralContentSystem for server...');
    viralSystem = new ViralContentSystem();
    await viralSystem.initialize(); // Base initialization (Drive, TempDir)
    await viralSystem.initialize_dependent_services(); // Initialize all dependent services
    logger.info('ViralContentSystem for server initialized successfully.');
    logger.info('Helmet middleware enabled for enhanced security.');
    logger.info('API rate limiting enabled for /mcp/viral-content.');
    logger.info('Health check endpoint /health configured.'); // Log health check endpoint
  
    app.listen(config.port, () => {
      logger.info(`Viral Content MCP running on port ${config.port}`);
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

// Cleanup
process.on('SIGINT', async () => {
  logger.info('Shutting down server gracefully...');
  if (viralSystem && viralSystem.services) {
    for (const serviceName in viralSystem.services) {
      const service = viralSystem.services[serviceName];
      if (service && typeof service.close === 'function') {
        try {
          await service.close();
          logger.info({ serviceName }, `Service closed.`);
        } catch (err) {
          logger.error({ err, serviceName }, `Error closing service.`);
        }
      }
    }
  }
  // Also close the queue connection
  if (contentCreationQueue && typeof contentCreationQueue.close === 'function') {
    try {
      await contentCreationQueue.close();
      logger.info('BullMQ contentCreationQueue closed.');
    } catch (err) {
      logger.error({ err }, 'Error closing BullMQ queue.');
    }
  }
  logger.info('Server shutdown complete.');
  process.exit(0);
});

start();

// module.exports = { ViralContentSystem }; // This line is removed.