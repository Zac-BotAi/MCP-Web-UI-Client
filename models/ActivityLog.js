const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
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
  actionType: { // e.g., 'LOGIN', 'REGISTER', 'CREDENTIAL_ADDED', 'CREDENTIAL_UPDATED', 'CREDENTIAL_DELETED', 'MCP_OPERATION_START'
    type: String,
    required: true,
    index: true,
  },
  details: { // Can store any relevant information, like IP address for login, serviceName for credential changes
    type: mongoose.Schema.Types.Mixed,
  },
  relatedResourceId: { // Optional: ID of the resource affected (e.g., UserServiceCredential ID)
    type: mongoose.Schema.Types.ObjectId,
  },
  status: { // e.g., 'SUCCESS', 'FAILURE', 'PENDING', 'IN_PROGRESS'
    type: String,
    enum: ['SUCCESS', 'FAILURE', 'PENDING', 'IN_PROGRESS', 'COMPLETED'], // Added COMPLETED
    default: 'SUCCESS',
  },
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
