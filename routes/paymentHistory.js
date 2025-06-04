const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Required for authMiddleware
const PaymentHistory = require('../models/PaymentHistory');
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

// GET /api/payments - Get payment history for the authenticated user
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const payments = await PaymentHistory.find({ userId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    const totalPayments = await PaymentHistory.countDocuments({ userId });

    await logActivity(userId, 'PAYMENT_HISTORY_VIEW_SUCCESS', { page, limit, count: payments.length });
    res.json({
      payments,
      currentPage: page,
      totalPages: Math.ceil(totalPayments / limit),
      totalPayments,
    });
  } catch (err) {
    console.error('Error fetching payment history:', err.message);
    await logActivity(userId, 'PAYMENT_HISTORY_VIEW_FAILURE', { error: err.message });
    res.status(500).send('Server error');
  }
});

// POST /api/payments/record - Record a new payment (e.g., by admin or webhook)
// For webhooks, authentication would be different (e.g., signature verification).
// For now, uses JWT auth, implying an admin or authorized service is making this call.
router.post('/record', authMiddleware, async (req, res) => {
  const {
    userId, // User ID for whom the payment is recorded
    amount,
    currency,
    status,
    transactionId,
    paymentGateway,
    description,
    details
  } = req.body;

  // User ID from token (admin making the call)
  const adminUserId = req.user.id;

  if (!userId || !amount || !currency || !status) {
    await logActivity(adminUserId, 'PAYMENT_RECORD_FAILURE', { targetUserId: userId, reason: 'Missing required fields' }, 'FAILURE');
    return res.status(400).json({ msg: 'Missing required fields: userId, amount, currency, status' });
  }

  try {
    // Optional: Verify the target userId exists if necessary
    const targetUserExists = await User.findById(userId);
    if (!targetUserExists) {
        await logActivity(adminUserId, 'PAYMENT_RECORD_FAILURE', { targetUserId: userId, reason: 'Target user not found' }, 'FAILURE');
        return res.status(404).json({ msg: 'Target user for payment not found' });
    }

    const newPayment = new PaymentHistory({
      userId,
      amount,
      currency,
      status,
      transactionId,
      paymentGateway,
      description,
      details,
      timestamp: new Date(),
    });

    await newPayment.save();
    await logActivity(adminUserId, 'PAYMENT_RECORD_SUCCESS', {
      targetUserId: userId,
      paymentId: newPayment._id,
      amount,
      currency,
      transactionId
    }, 'SUCCESS', newPayment._id);

    // Additionally, log for the target user if different from admin
    if (adminUserId !== userId) {
        await logActivity(userId, 'PAYMENT_RECEIVED_SUCCESS', {
            paymentId: newPayment._id,
            adminUserId, // who recorded it
            amount,
            currency,
            transactionId
        }, 'SUCCESS', newPayment._id);
    }

    res.status(201).json(newPayment);
  } catch (err) {
    console.error('Error recording payment:', err.message);
    let failureReason = err.message;
    if (err.code === 11000) { // Duplicate key error for transactionId
        failureReason = 'Duplicate transactionId';
    }
    await logActivity(adminUserId, 'PAYMENT_RECORD_FAILURE', { targetUserId: userId, error: failureReason, transactionId }, 'FAILURE');
    res.status(500).json({ msg: 'Server error while recording payment', error: failureReason });
  }
});

module.exports = router;
