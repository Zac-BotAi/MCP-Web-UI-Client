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

const app = express();
const port = 3000;
const SESSION_DIR = path.join(__dirname, 'sessions');
// const TEMP_DIR = path.join(__dirname, 'temp'); // TEMP_DIR is now managed within ViralContentSystem

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


// MCP Endpoint for viral content creation
app.post('/mcp/viral-content', async (req, res) => {
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
      console.log(`Job ${job.id} added to queue ${method} with data:`, jobData);

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
      console.error(`Failed to add job to queue (${method}):`, queueError);
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
    console.error(`Unexpected error in /mcp/viral-content endpoint: ${error.message}`, error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Internal server error.' }, // Generic message for unexpected errors
      id: requestId
    });
  }
});

// Service loader and initializeServices are removed.

// Start server
async function start() {
  await fs.mkdir(SESSION_DIR, { recursive: true });

  console.log('Initializing ViralContentSystem for server...');
  viralSystem = new ViralContentSystem();
  await viralSystem.initialize(); // Base initialization (Drive, TempDir)
  await viralSystem.initialize_dependent_services(); // Initialize all dependent services
  console.log('ViralContentSystem for server initialized successfully.');
  
  app.listen(port, () => {
    console.log(`Viral Content MCP running on port ${port}`);
    // The concept of "Supported services" from the old serviceRegistry might be logged differently now,
    // perhaps by listing keys from viralSystem.services if needed.
    // For now, removing the specific log about serviceRegistry.
  });
}

// Cleanup
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  if (viralSystem && viralSystem.services) {
    for (const serviceName in viralSystem.services) {
      const service = viralSystem.services[serviceName];
      if (service && typeof service.close === 'function') {
        try {
          await service.close();
          console.log(`Service ${serviceName} closed.`);
        } catch (err) {
          console.error(`Error closing service ${serviceName}:`, err);
        }
      }
    }
  }
  // Also close the queue connection if it's managed here or if the queue client needs explicit closing
  if (contentCreationQueue && typeof contentCreationQueue.close === 'function') {
    try {
      await contentCreationQueue.close();
      console.log('BullMQ contentCreationQueue closed.');
    } catch (err) {
      console.error('Error closing BullMQ queue:', err);
    }
  }
  process.exit(0);
});

start();

// module.exports = { ViralContentSystem }; // This line is removed.