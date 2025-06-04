const mongoose = require('mongoose');

const UserServiceCredentialSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true, // Index for efficient lookups
  },
  serviceName: {
    type: String,
    required: true,
    trim: true,
  },
  url: {
    type: String,
    required: true,
    trim: true,
  },
  encryptedUsername: {
    type: String,
    required: true,
  },
  ivUsername: { // Initialization Vector for username encryption
    type: String, // Store as hex string
    required: true,
  },
  authTagUsername: { // GCM authentication tag for username
    type: String, // Store as hex string
    required: true,
  },
  encryptedPassword: {
    type: String,
    required: true,
  },
  ivPassword: { // Initialization Vector for password encryption
    type: String, // Store as hex string
    required: true,
  },
  authTagPassword: { // GCM authentication tag for password
    type: String, // Store as hex string
    required: true,
  },
  niche: { // New field for niche
    type: String,
    trim: true,
    index: true,
    sparse: true, // Allows null/missing values to not conflict with index if many don't have it
    optional: true, // Explicitly optional
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update `updatedAt` field before saving
UserServiceCredentialSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Pre-update hook to update `updatedAt`
UserServiceCredentialSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});


module.exports = mongoose.model('UserServiceCredential', UserServiceCredentialSchema);
