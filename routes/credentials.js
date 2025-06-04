const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const UserServiceCredential = require('../models/UserServiceCredential');
const { encrypt, decrypt } = require('../utils/cryptoUtils');
const { logActivity } = require('../services/activityLogService'); // Import logActivity

// Middleware to verify JWT
const authMiddleware = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    // In a real app, use a secret from environment variables
    const secret = process.env.JWT_SECRET || 'your_jwt_secret';
    const decoded = jwt.verify(token, secret);
    req.user = decoded.user; // Add user from payload (contains id and telegram_id)

    // Optional: Check if user still exists in DB
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

// POST /api/credentials/add - Add a new credential
router.post('/add', authMiddleware, async (req, res) => {
  const { serviceName, url, username, password, niche } = req.body; // Added niche
  const userId = req.user.id;

  if (!serviceName || !url || !username || !password) { // Niche is optional
    return res.status(400).json({ msg: 'Please provide serviceName, url, username, and password' });
  }

  try {
    const encryptedUsernameData = encrypt(username);
    const encryptedPasswordData = encrypt(password);

    const newCredential = new UserServiceCredential({
      userId,
      serviceName,
      url,
      encryptedUsername: encryptedUsernameData.encryptedData,
      ivUsername: encryptedUsernameData.iv,
      authTagUsername: encryptedUsernameData.authTag,
      encryptedPassword: encryptedPasswordData.encryptedData,
      ivPassword: encryptedPasswordData.iv,
      authTagPassword: encryptedPasswordData.authTag,
      niche: niche ? niche.trim() : undefined, // Add niche, trim if provided
    });

    await newCredential.save();
    const logDetails = {
        serviceName: newCredential.serviceName,
        url: newCredential.url,
        credentialId: newCredential._id,
        niche: newCredential.niche
    };
    await logActivity(userId, 'CREDENTIAL_ADD_SUCCESS', logDetails, 'SUCCESS', newCredential._id);

    // Return limited information, including niche
    res.status(201).json({
        msg: 'Credential saved successfully',
        credential: {
            id: newCredential._id,
            serviceName: newCredential.serviceName,
            url: newCredential.url,
            niche: newCredential.niche, // Return niche
            createdAt: newCredential.createdAt
        }
    });
  } catch (err) {
    console.error('Error saving credential:', err.message);
    await logActivity(userId, 'CREDENTIAL_ADD_FAILURE', { serviceName, url, niche, error: err.message }, 'FAILURE');
    res.status(500).send('Server error');
  }
});

// GET /api/credentials - Get all credentials for a user, with optional niche filtering
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { niche } = req.query; // Get niche from query parameters

  try {
    const query = { userId };
    if (niche) {
      // Case-insensitive search for niche
      query.niche = { $regex: new RegExp(`^${niche}$`, 'i') };
    }

    const credentials = await UserServiceCredential.find(query).select('-encryptedPassword -ivPassword -authTagPassword');

    const decryptedCredentials = credentials.map(cred => {
      let decryptedUsername = null;
      try {
        if (cred.encryptedUsername && cred.ivUsername && cred.authTagUsername) {
            decryptedUsername = decrypt(cred.encryptedUsername, cred.ivUsername, cred.authTagUsername);
        }
      } catch (e) {
        console.error("Error decrypting username for credential ID:", cred._id, e.message);
        // Keep decryptedUsername as null if decryption fails
      }
      return { // Do not log individual decryption failures here, focus on overall access
        _id: cred._id,
        serviceName: cred.serviceName,
        url: cred.url,
        username: decryptedUsername,
        hasPassword: !!cred.encryptedPassword,
        niche: cred.niche, // Include niche in response
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
      };
    });

    const logDetails = { count: decryptedCredentials.length };
    if (niche) logDetails.filterNiche = niche;
    await logActivity(userId, 'CREDENTIAL_VIEW_ALL_SUCCESS', logDetails, 'SUCCESS');
    res.json(decryptedCredentials);
  } catch (err) {
    console.error('Error fetching credentials:', err.message);
    const logDetails = { error: err.message };
    if (niche) logDetails.filterNiche = niche;
    await logActivity(userId, 'CREDENTIAL_VIEW_ALL_FAILURE', logDetails, 'FAILURE');
    res.status(500).send('Server error');
  }
});

// PUT /api/credentials/:id - Update a credential
router.put('/:id', authMiddleware, async (req, res) => {
  const { serviceName, url, username, password, niche } = req.body; // Added niche
  const userId = req.user.id;
  const credentialId = req.params.id;

  const detailsForLog = { credentialId };
  if (serviceName) detailsForLog.serviceName = serviceName;
  if (url) detailsForLog.url = url;
  if (username) detailsForLog.usernameUpdated = true;
  if (password) detailsForLog.passwordUpdated = true;
  if (typeof niche === 'string') detailsForLog.niche = niche.trim(); // Log new niche value if provided (even if empty string)


  try {
    let credential = await UserServiceCredential.findOne({ _id: credentialId, userId });
    if (!credential) {
      await logActivity(userId, 'CREDENTIAL_UPDATE_FAILURE', { ...detailsForLog, reason: 'Not found or unauthorized' }, 'FAILURE', credentialId);
      return res.status(404).json({ msg: 'Credential not found or user unauthorized' });
    }

    const updateFields = {};
    if (serviceName) updateFields.serviceName = serviceName;
    if (url) updateFields.url = url;
    if (username) {
      const encryptedUsernameData = encrypt(username);
      updateFields.encryptedUsername = encryptedUsernameData.encryptedData;
      updateFields.ivUsername = encryptedUsernameData.iv;
      updateFields.authTagUsername = encryptedUsernameData.authTag;
    }
    if (password) {
      const encryptedPasswordData = encrypt(password);
      updateFields.encryptedPassword = encryptedPasswordData.encryptedData;
      updateFields.ivPassword = encryptedPasswordData.iv;
      updateFields.authTagPassword = encryptedPasswordData.authTag;
    }
    // Handle niche update: allow setting to empty string (to remove niche) or new value
    if (typeof niche === 'string') {
        updateFields.niche = niche.trim() === '' ? null : niche.trim(); // Set to null if empty, else trim
    }

    updateFields.updatedAt = Date.now();

    // Check if there are any actual fields to update beyond updatedAt
    // (as updatedAt is always set)
    const fieldKeysToUpdate = Object.keys(updateFields);
    if (fieldKeysToUpdate.length === 1 && fieldKeysToUpdate[0] === 'updatedAt' && !serviceName && !url && !username && !password && typeof niche !== 'string') {
        // No actual data fields are being changed, only updatedAt would be set.
        // Some might consider this a no-op or bad request.
        // For now, we allow it, it will just bump updatedAt.
        // Or, return res.status(400).json({ msg: 'No fields to update provided.' });
    }


    const updatedCredential = await UserServiceCredential.findByIdAndUpdate(
      credentialId,
      { $set: updateFields },
      { new: true }
    ).select('-encryptedPassword -ivPassword -authTagPassword -encryptedUsername -ivUsername -authTagUsername'); // Exclude sensitive parts from response

    if (!updatedCredential) {
        await logActivity(userId, 'CREDENTIAL_UPDATE_FAILURE', { ...detailsForLog, reason: 'Not found post-update' }, 'FAILURE', credentialId);
        return res.status(404).json({ msg: 'Credential not found after update attempt' });
    }

    await logActivity(userId, 'CREDENTIAL_UPDATE_SUCCESS', detailsForLog, 'SUCCESS', updatedCredential._id);
    res.json({ msg: 'Credential updated successfully', credentialId: updatedCredential._id });
  } catch (err) {
    console.error('Error updating credential:', err.message);
    await logActivity(userId, 'CREDENTIAL_UPDATE_FAILURE', { ...detailsForLog, error: err.message }, 'FAILURE', credentialId);
    if (err.kind === 'ObjectId') {
        return res.status(400).json({ msg: 'Invalid credential ID format' });
    }
    res.status(500).send('Server error');
  }
});

// DELETE /api/credentials/:id - Delete a credential
router.delete('/:id', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const credentialId = req.params.id;

  try {
    const credential = await UserServiceCredential.findOne({ _id: credentialId, userId });
    if (!credential) {
      await logActivity(userId, 'CREDENTIAL_DELETE_FAILURE', { credentialId, reason: 'Not found or unauthorized' }, 'FAILURE', credentialId);
      return res.status(404).json({ msg: 'Credential not found or user unauthorized' });
    }

    const serviceName = credential.serviceName; // Capture for logging before deletion
    await UserServiceCredential.findByIdAndDelete(credentialId);
    await logActivity(userId, 'CREDENTIAL_DELETE_SUCCESS', { credentialId, serviceName }, 'SUCCESS', credentialId);
    res.json({ msg: 'Credential deleted successfully', credentialId });
  } catch (err) {
    console.error('Error deleting credential:', err.message);
    await logActivity(userId, 'CREDENTIAL_DELETE_FAILURE', { credentialId, error: err.message }, 'FAILURE', credentialId);
    if (err.kind === 'ObjectId') {
        return res.status(400).json({ msg: 'Invalid credential ID format' });
    }
    res.status(500).send('Server error');
  }
});

module.exports = router;
