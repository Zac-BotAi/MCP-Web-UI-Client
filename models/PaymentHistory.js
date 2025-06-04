const mongoose = require('mongoose');

const PaymentHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: { // e.g., "TON", "USD", "POINTS"
    type: String,
    required: true,
  },
  paymentGateway: { // e.g., 'Stripe', 'TelegramPayments', 'ManualCredit'
    type: String,
    optional: true,
  },
  transactionId: { // From payment gateway
    type: String,
    unique: true,
    sparse: true, // Allows multiple nulls, but unique if present
    optional: true,
  },
  status: {
    type: String,
    required: true,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED'],
  },
  description: { // e.g., 'Credit purchase for MCP services', 'Monthly subscription fee'
    type: String,
    optional: true,
  },
  details: { // For storing raw gateway responses or other relevant info
    type: mongoose.Schema.Types.Mixed,
    optional: true,
  },
});

PaymentHistorySchema.pre('save', function(next) {
    if (!this.timestamp) {
        this.timestamp = new Date();
    }
    next();
});

module.exports = mongoose.model('PaymentHistory', PaymentHistorySchema);
