const mongoose = require('mongoose');

const UsageHistorySchema = new mongoose.Schema({
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
  featureType: { // e.g., 'MCP_CONTENT_GENERATION', 'API_ACCESS_XYZ', 'VIDEO_TRANSCODING_MINUTES'
    type: String,
    required: true,
    index: true,
  },
  details: { // Specifics about the usage, e.g., { topic: 'xyz', duration: '30s', quality: '1080p' }
    type: mongoose.Schema.Types.Mixed,
    optional: true,
  },
  cost: { // How much this usage "cost" in internal units or currency if directly billable per action
    type: Number,
    default: 0,
  },
  relatedResourceId: { // Optional: ID of a resource related to this usage (e.g., the ID of the generated content)
    type: mongoose.Schema.Types.ObjectId,
    optional: true,
  },
});

UsageHistorySchema.pre('save', function(next) {
    if (!this.timestamp) {
        this.timestamp = new Date();
    }
    next();
});

module.exports = mongoose.model('UsageHistory', UsageHistorySchema);
