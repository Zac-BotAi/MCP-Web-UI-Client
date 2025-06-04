const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // Added for ObjectId
const User = require('../models/User'); // Required for authMiddleware
const { logActivity } = require('../services/activityLogService');
const { recordUsage } = require('../services/usageTrackingService');
// RealtimeService instance will be accessed via req.app.get('realtimeService')
const userCredentialService = require('../services/userCredentialService');
const BrowserAutomationService = require('../services/browserAutomationService'); // Import BrowserAutomationService

// Middleware to verify JWT (copied - consider refactoring)
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }
  try {
    const secret = process.env.JWT_SECRET || 'your_jwt_secret';
    const decoded = jwt.verify(token, secret);
    req.user = decoded.user;
    const userExists = await User.findById(req.user.id);
    if (!userExists) {
      return res.status(401).json({ msg: 'User not found, authorization denied' });
    }
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// POST /api/mcp/trigger - Manually trigger an MCP operation
router.post('/trigger', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { topic, ...otherParams } = req.body; // Example: topic, specificPrompts, targetPlatforms

  if (!topic) {
    await logActivity(userId, 'MCP_MANUAL_TRIGGER_FAILURE', { reason: 'Missing topic' }, 'FAILURE');
    return res.status(400).json({ msg: 'Topic is required for MCP operation' });
  }

  const realtimeService = req.app.get('realtimeService');
  const operationId = new mongoose.Types.ObjectId(); // Generate a unique ID for this operation

  try {
    // 1. Log intent
    await logActivity(userId, 'MCP_MANUAL_TRIGGER_REQUESTED', { operationId: operationId.toString(), topic, params: otherParams }, 'PENDING', operationId);

    // 2. Send real-time message to user
    if (realtimeService) {
      realtimeService.sendMessageToUser(userId, {
        type: 'MCP_TASK_QUEUED',
        data: { operationId: operationId.toString(), topic, status: 'PENDING' }
      });
    } else {
      console.warn('RealtimeService not available for MCP trigger notification.');
    }

    // 3. Placeholder for actual MCP interaction
    // This is where auth_server.js would call the refactored MCP logic from the original server.js,
    // or make an internal API call to an MCP service.
    console.log(`SIMULATION: MCP task (OpID: ${operationId.toString()}) for user ${userId} with topic "${topic}" would be processed here.`);
    // Simulate some processing time before a "completion" (for testing purposes)
    // setTimeout(async () => {
    //   await logActivity(userId, 'MCP_MANUAL_TRIGGER_COMPLETED', { operationId: operationId.toString(), topic, result: "Simulated success" }, 'SUCCESS', operationId);
    //   if (realtimeService) {
    //     realtimeService.sendMessageToUser(userId, { type: 'MCP_TASK_COMPLETED', data: { operationId: operationId.toString(), topic, status: 'COMPLETED', resultLink: 'http://example.com/content/' + operationId.toString() } });
    //   }
    //   await recordUsage(userId, 'MCP_MANUAL_TRIGGER_COMPLETED', { topic, operationId: operationId.toString(), charactersProcessed: topic.length * 100 }); // Example cost
    // }, 5000);


    // 4. Record initial usage (could be refined to record after completion with more details)
    await recordUsage(userId, 'MCP_MANUAL_TRIGGER_REQUESTED', { topic, operationId: operationId.toString(), params: otherParams });

    // 5. Return acknowledgment
    res.status(202).json({
      msg: 'MCP operation triggered successfully. Check real-time updates for status.',
      operationId: operationId.toString(),
      topic
    });

  } catch (error) {
    console.error('Error triggering MCP operation:', error.message);
    await logActivity(userId, 'MCP_MANUAL_TRIGGER_FAILURE', { operationId: operationId.toString(), topic, error: error.message }, 'FAILURE', operationId);
    if (realtimeService) {
        realtimeService.sendMessageToUser(userId, { type: 'MCP_TASK_ERROR', data: { operationId: operationId.toString(), topic, error: error.message } });
    }
    res.status(500).send('Server error during MCP trigger');
  }
});


// POST /api/mcp/execute-on-service/:credentialId - Test dynamic browser interaction
router.post('/execute-on-service/:credentialId', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { credentialId } = req.params;
  // loginSteps and actionSteps could be part of req.body
  // For this example, loginSteps are hardcoded for a hypothetical site.
  // In a real app, these would be configurable or specific to known services.
  const { loginSteps, successCondition, targetUrlAfterLogin } = req.body;

  if (!loginSteps || !Array.isArray(loginSteps) || loginSteps.length === 0) {
    return res.status(400).json({ msg: 'loginSteps (array) are required in the request body.' });
  }

  const realtimeService = req.app.get('realtimeService');
  const operationId = new mongoose.Types.ObjectId();
  let browserService = null; // Define here for access in finally block

  try {
    await logActivity(userId, 'BROWSER_INTERACTION_REQUESTED', { credentialId, operationId: operationId.toString() }, 'PENDING', operationId);
    if (realtimeService) {
      realtimeService.sendMessageToUser(userId, { type: 'BROWSER_TASK_STARTED', data: { operationId: operationId.toString(), credentialId } });
    }

    // 1. Get Decrypted Credentials
    const credentials = await userCredentialService.getDecryptedCredentials(userId, credentialId);
    if (!credentials) {
      await logActivity(userId, 'BROWSER_INTERACTION_FAILURE', { operationId: operationId.toString(), credentialId, reason: 'Credentials not found or unauthorized' }, 'FAILURE', operationId);
      return res.status(404).json({ msg: 'Credentials not found or unauthorized.' });
    }

    // Log that we are attempting (without logging credentials themselves)
    await logActivity(userId, 'BROWSER_INTERACTION_ATTEMPT_LOGIN', { operationId: operationId.toString(), credentialId, serviceName: credentials.serviceName, url: credentials.url }, 'IN_PROGRESS', operationId);


    // 2. Perform Browser Automation
    // IMPORTANT: Ensure playwright browsers are installed in your environment (npx playwright install)
    // For production, consider a dedicated job queue for these tasks rather than direct API handling.
    browserService = new BrowserAutomationService('chromium'); // Or make browser type configurable

    const cookies = await browserService.loginAndGetCookies(
      credentials.url, // Or a more specific login URL if known
      credentials.username,
      credentials.password,
      loginSteps,
      successCondition // Optional success condition
    );

    await logActivity(userId, 'BROWSER_INTERACTION_LOGIN_SUCCESS', { operationId: operationId.toString(), credentialId, serviceName: credentials.serviceName, cookieCount: cookies.length }, 'SUCCESS', operationId);

    let finalResult = {
        cookies,
        message: 'Login successful, cookies extracted.'
    };

    // Optional: Perform further actions if targetUrlAfterLogin and actionSteps are provided
    if (targetUrlAfterLogin) {
        // This part is more conceptual for this step as `performActionWithCookies` is not fully implemented
        // For now, just log intent if it were to proceed.
        console.log(`SIMULATION: Would navigate to ${targetUrlAfterLogin} and perform further actions with cookies if actionSteps were provided.`);
        await logActivity(userId, 'BROWSER_INTERACTION_POST_LOGIN_ACTION_SKIPPED', { operationId: operationId.toString(), credentialId, targetUrlAfterLogin }, 'SUCCESS', operationId);
        // In a full implementation:
        // const actionResult = await browserService.performActionWithCookies(targetUrlAfterLogin, cookies, actionSteps);
        // finalResult.actionData = actionResult;
        // finalResult.message = "Login and post-login actions completed.";
    }


    if (realtimeService) {
      realtimeService.sendMessageToUser(userId, { type: 'BROWSER_TASK_COMPLETED', data: { operationId: operationId.toString(), credentialId, serviceName: credentials.serviceName, status: 'SUCCESS' } });
    }
    res.status(200).json(finalResult);

  } catch (error) {
    console.error(`Error during browser interaction for credential ${credentialId}:`, error);
    await logActivity(userId, 'BROWSER_INTERACTION_FAILURE', { operationId: operationId.toString(), credentialId, error: error.message, stack: error.stack }, 'FAILURE', operationId);
    if (realtimeService) {
      realtimeService.sendMessageToUser(userId, { type: 'BROWSER_TASK_ERROR', data: { operationId: operationId.toString(), credentialId, error: error.message } });
    }
    res.status(500).json({ msg: 'Browser interaction failed.', error: error.message });
  } finally {
    if (browserService) {
      await browserService.closeBrowser();
    }
  }
});


module.exports = router;
