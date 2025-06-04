const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for authMiddleware
const { logActivity } = require('../services/activityLogService');

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

// GET /api/payments/initiate/premium_24_7 - Get details for initiating PREMIUM_24_7 plan payment
router.get('/initiate/premium_24_7', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const planName = 'PREMIUM_24_7';

  // These would ideally come from a configuration management system or database
  const paymentConfig = {
    paymentAddress: process.env.TON_WALLET_ADDRESS || 'YOUR_STATIC_TON_WALLET_ADDRESS_HERE_ENV', // Use environment variable
    amount: process.env.PREMIUM_PLAN_PRICE || "0.1", // Use environment variable
    currency: "TON",
  };

  if (paymentConfig.paymentAddress === 'YOUR_STATIC_TON_WALLET_ADDRESS_HERE_ENV') {
      console.warn("Payment Initiation: TON_WALLET_ADDRESS environment variable is not set!");
      // Potentially, don't let users initiate if not configured, or provide a warning
  }

  const responseDetails = {
    paymentAddress: paymentConfig.paymentAddress,
    amount: paymentConfig.amount,
    currency: paymentConfig.currency,
    // Crucial: The user MUST include their unique ID in the transaction's memo/comment field.
    // This allows the webhook to map the incoming transaction back to this user.
    requiredMemo: userId.toString(),
    message: `Please send ${paymentConfig.amount} ${paymentConfig.currency} to the address: ${paymentConfig.paymentAddress}. ` +
             `IMPORTANT: You MUST include the following text in the transaction's memo/comment field: ${userId.toString()}`,
    plan: planName,
  };

  try {
    await logActivity(userId, 'PAYMENT_INITIATION_REQUESTED', { plan: planName, details: { amount: responseDetails.amount, currency: responseDetails.currency } });
    res.json(responseDetails);
  } catch (error) {
    console.error('Error during payment initiation:', error.message);
    // This logging is for an error in our system, not the user's fault.
    await logActivity(userId, 'PAYMENT_INITIATION_SYSTEM_ERROR', { plan: planName, error: error.message }, 'FAILURE');
    res.status(500).send('Server error while preparing payment initiation details.');
  }
});

module.exports = router;
