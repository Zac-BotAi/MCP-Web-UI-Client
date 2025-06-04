const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for authMiddleware
const ActivityLog = require('../models/ActivityLog');

// Middleware to verify JWT (copied from routes/credentials.js - consider refactoring to a shared middleware file)
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
    console.error("JWT Error:", err.message);
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// GET /api/activity - Get activity logs for a user with pagination
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const logs = await ActivityLog.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalLogs = await ActivityLog.countDocuments({ userId });

    res.json({
      logs,
      currentPage: page,
      totalPages: Math.ceil(totalLogs / limit),
      totalLogs,
    });
  } catch (err) {
    console.error('Error fetching activity logs:', err.message);
    res.status(500).send('Server error');
  }
});

// It would be good practice to have a logging function that can be called from other services/routes
// For example:
// async function logActivity(userId, actionType, details, relatedResourceId, status = 'SUCCESS') {
//   try {
//     const newLog = new ActivityLog({
//       userId,
//       actionType,
//       details,
//       relatedResourceId,
//       status,
//     });
//     await newLog.save();
//     // console.log('Activity logged:', newLog); // For debugging
//   } catch (error) {
//     console.error('Failed to log activity:', error.message);
//   }
// }
// module.exports = { router, logActivity };
// Then other files can require logActivity. For now, just the router.

module.exports = router;
