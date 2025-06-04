const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  telegram_id: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Allows multiple documents to have no email
  },
  hashed_password: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  is247AutomationEnabled: {
    type: Boolean,
    default: false,
  },
  mcpPlan: {
    type: String,
    enum: ['FREE', 'PREMIUM_24_7'],
    default: 'FREE',
  },
  lastPaymentDate: {
    type: Date,
    optional: true,
  },
  nextPaymentDate: {
    type: Date,
    optional: true,
  },
  automationSettings: { // For future specific timing/config
    type: mongoose.Schema.Types.Mixed,
    optional: true, // e.g., { preferredTopic: 'AI in 2024', runFrequency: 'daily', specificTime: '10:00UTC' }
  }
});

// Pre-save middleware to hash password
UserSchema.pre('save', async function (next) {
  if (!this.isModified('hashed_password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.hashed_password = await bcrypt.hash(this.hashed_password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare candidate password with stored hashed password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.hashed_password);
  } catch (error) {
    throw error;
  }
};

// Update `updatedAt` field before saving
UserSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', UserSchema);
