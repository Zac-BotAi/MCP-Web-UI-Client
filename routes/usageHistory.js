const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for authMiddleware
const UsageHistory = require('../models/UsageHistory');
const { logActivity } = require('../services/activityLogService');

// Middleware to verify JWT (copied from routes/credentials.js - consider refactoring)
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

// GET /api/usage - Get usage history for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const usageRecords = await UsageHistory.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalUsageRecords = await UsageHistory.countDocuments({ userId });

    await logActivity(userId, 'USAGE_HISTORY_VIEW_SUCCESS', { page, limit, count: usageRecords.length });
    res.json({
      usageRecords,
      currentPage: page,
      totalPages: Math.ceil(totalUsageRecords / limit),
      totalUsageRecords,
    });
  } catch (err) {
    console.error('Error fetching usage history:', err.message);
    await logActivity(userId, 'USAGE_HISTORY_VIEW_FAILURE', { error: err.message });
    res.status(500).send('Server error');
  }
});

module.exports = router;
