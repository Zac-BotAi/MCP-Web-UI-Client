const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logActivity } = require('../services/activityLogService');

// Register
router.post('/register', async (req, res) => {
  const { telegram_id, password, email } = req.body;
  const ipAddress = req.ip || req.socket?.remoteAddress;

  try {
    let user = await User.findOne({ telegram_id });
    if (user) {
      await logActivity(null, 'USER_REGISTER_FAILURE', { telegram_id, reason: 'User already exists', ipAddress }, 'FAILURE');
      return res.status(400).json({ msg: 'User already exists' });
    }

    user = new User({
      telegram_id,
      email,
      hashed_password: password, // Password will be hashed by pre-save middleware
    });

    await user.save();
    await logActivity(user._id, 'USER_REGISTER_SUCCESS', { telegram_id, email: user.email, ipAddress }, 'SUCCESS');

    // Return user object without password
    const userResponse = { ...user.toObject() };
    delete userResponse.hashed_password;

    res.status(201).json({ msg: 'User registered successfully', user: userResponse });
  } catch (err) {
    console.error(err.message);
    await logActivity(null, 'USER_REGISTER_FAILURE', { telegram_id, error: err.message, ipAddress }, 'FAILURE');
    res.status(500).send('Server error');
  }
});

// Login
router.post('/login', async (req, res) => {
  const { telegram_id, password } = req.body;
  const ipAddress = req.ip || req.socket?.remoteAddress;

  try {
    const user = await User.findOne({ telegram_id });
    if (!user) {
      await logActivity(null, 'USER_LOGIN_FAILURE', { telegram_id, reason: 'User not found', ipAddress }, 'FAILURE');
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await logActivity(user._id, 'USER_LOGIN_FAILURE', { telegram_id, reason: 'Invalid password', ipAddress }, 'FAILURE');
      return res.status(400).json({ msg: 'Invalid credentials' });
    }

    await logActivity(user._id, 'USER_LOGIN_SUCCESS', { telegram_id, ipAddress }, 'SUCCESS');

    const payload = {
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
      },
    };

    // In a real app, use a secret from environment variables
    // In a real app, use a secret from environment variables
    const secret = process.env.JWT_SECRET || 'your_jwt_secret'; // It's better to use environment variables for secrets
    const token = jwt.sign(payload, secret, { expiresIn: '1h' });

    res.json({ token });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

module.exports = router;
