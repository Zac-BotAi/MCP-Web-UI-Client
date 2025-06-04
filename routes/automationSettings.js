const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for authMiddleware and updates
const { logActivity } = require('../services/activityLogService');

// Middleware to verify JWT (copied - consider refactoring to a shared module)
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

// GET /api/automation/settings - Retrieve current automation settings
router.get('/settings', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    // Select specific fields including the nested preferredNiche
    const user = await User.findById(userId).select('is247AutomationEnabled mcpPlan automationSettings.preferredTopic automationSettings.preferredNiche');
    if (!user) {
      await logActivity(userId, 'AUTOMATION_SETTINGS_VIEW_FAILURE', { reason: 'User not found in settings GET' }, 'FAILURE');
      return res.status(404).json({ msg: 'User not found' });
    }

    // Construct a cleaner response object if automationSettings is null/undefined
    const responseSettings = {
        is247AutomationEnabled: user.is247AutomationEnabled,
        mcpPlan: user.mcpPlan,
        automationSettings: user.automationSettings || {} // Ensure automationSettings is an object
    };

    await logActivity(userId, 'AUTOMATION_SETTINGS_VIEW_SUCCESS', { settings: responseSettings });
    res.json(responseSettings);
  } catch (error) {
    console.error('Error fetching automation settings:', error.message);
    await logActivity(userId, 'AUTOMATION_SETTINGS_VIEW_FAILURE', { error: error.message }, 'FAILURE');
    res.status(500).send('Server error');
  }
});

// PUT /api/automation/settings - Update automation settings
router.put('/settings', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { is247AutomationEnabled, mcpPlan, automationSettings } = req.body;

  // Validate mcpPlan if provided
  if (mcpPlan && !['FREE', 'PREMIUM_24_7'].includes(mcpPlan)) {
    await logActivity(userId, 'AUTOMATION_SETTINGS_UPDATE_FAILURE', { reason: 'Invalid mcpPlan value' }, 'FAILURE');
    return res.status(400).json({ msg: 'Invalid mcpPlan value. Must be FREE or PREMIUM_24_7.' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      await logActivity(userId, 'AUTOMATION_SETTINGS_UPDATE_FAILURE', { reason: 'User not found in settings PUT' }, 'FAILURE');
      return res.status(404).json({ msg: 'User not found' });
    }

    const oldSettings = {
        is247AutomationEnabled: user.is247AutomationEnabled,
        mcpPlan: user.mcpPlan,
        automationSettings: user.automationSettings ? JSON.parse(JSON.stringify(user.automationSettings)) : {}
    };

    const updatePayload = {};
    let automationSettingsUpdated = false; // Corrected variable name

    if (typeof is247AutomationEnabled === 'boolean') {
      updatePayload.is247AutomationEnabled = is247AutomationEnabled;
    }
    if (mcpPlan) {
      updatePayload.mcpPlan = mcpPlan;
    }

    // Handle automationSettings specifically for preferredTopic and preferredNiche
    if (automationSettings && typeof automationSettings === 'object') {
      const newAutomationSettings = { ...(user.automationSettings || {}) }; // Start with existing or empty object
      if (typeof automationSettings.preferredTopic === 'string') {
        newAutomationSettings.preferredTopic = automationSettings.preferredTopic.trim();
        automationSettingsUpdated = true;
      }
      if (typeof automationSettings.preferredNiche === 'string') {
        newAutomationSettings.preferredNiche = automationSettings.preferredNiche.trim();
         automationSettingsUpdated = true;
      } else if (automationSettings.preferredNiche === null) { // Allow unsetting niche
        newAutomationSettings.preferredNiche = null;
         automationSettingsUpdated = true;
      }
      // Only update automationSettings field if there were actual changes to its sub-properties
      if (automationSettingsUpdated || (user.automationSettings === null && Object.keys(newAutomationSettings).length > 0) ) {
         updatePayload.automationSettings = newAutomationSettings;
      }
    }

    if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ msg: 'No valid settings provided for update.' });
    }

    updatePayload.updatedAt = Date.now();

    const updatedUserFromDB = await User.findByIdAndUpdate(userId, { $set: updatePayload }, { new: true })
                                 .select('is247AutomationEnabled mcpPlan automationSettings.preferredTopic automationSettings.preferredNiche');

    const responseUser = {
        is247AutomationEnabled: updatedUserFromDB.is247AutomationEnabled,
        mcpPlan: updatedUserFromDB.mcpPlan,
        automationSettings: updatedUserFromDB.automationSettings || {}
    };

    await logActivity(userId, 'AUTOMATION_SETTINGS_UPDATE_SUCCESS', { oldSettings, newSettings: responseUser }, 'SUCCESS');
    res.json(responseUser);

  } catch (error) {
    console.error('Error updating automation settings:', error.message);
    await logActivity(userId, 'AUTOMATION_SETTINGS_UPDATE_FAILURE', { error: error.message }, 'FAILURE');
    res.status(500).send('Server error');
  }
});

module.exports = router;
