const UserServiceCredential = require('../models/UserServiceCredential');
const { decrypt } = require('../utils/cryptoUtils'); // Assuming cryptoUtils.js is in ../utils/
const User = require('../models/User'); // Potentially for further user validation if needed

class UserCredentialService {
  /**
   * Fetches a specific UserServiceCredential for a user and decrypts username and password.
   * @param {String} userId - The ID of the user owning the credential.
   * @param {String} credentialId - The ID of the UserServiceCredential document.
   * @returns {Promise<Object|null>} An object with { url, username, password, serviceName } or null if not found/unauthorized.
   * @throws {Error} If decryption fails or other unexpected errors occur.
   */
  async getDecryptedCredentials(userId, credentialId) {
    if (!userId || !credentialId) {
      throw new Error('User ID and Credential ID are required.');
    }

    try {
      const credential = await UserServiceCredential.findOne({ _id: credentialId, userId: userId });

      if (!credential) {
        console.log(`No credential found for ID: ${credentialId} and User ID: ${userId}`);
        return null; // Or throw specific error: new Error('Credential not found or user unauthorized');
      }

      // Decrypt username
      const username = decrypt(credential.encryptedUsername, credential.ivUsername, credential.authTagUsername);
      if (username === null) { // Decryption might return null if data was missing
          throw new Error(`Username decryption failed for credential ID: ${credentialId}. Required data might be missing.`);
      }

      // Decrypt password
      const password = decrypt(credential.encryptedPassword, credential.ivPassword, credential.authTagPassword);
       if (password === null) { // Decryption might return null if data was missing
          throw new Error(`Password decryption failed for credential ID: ${credentialId}. Required data might be missing.`);
      }


      return {
        url: credential.url,
        username,
        password,
        serviceName: credential.serviceName, // Added for context
      };

    } catch (error) {
      console.error(`Error getting decrypted credentials for credentialId ${credentialId}, userId ${userId}: ${error.message}`);
      // Re-throw or handle specific errors (e.g., decryption failure vs. DB error)
      // It's important that decryption errors from cryptoUtils (e.g., bad auth tag) are caught here.
      if (error.message.includes('Unsupported state or bad digest')) {
          throw new Error(`Decryption failed for credential ID ${credentialId}: Invalid authentication tag or corrupted data.`);
      }
      throw error; // Re-throw other errors
    }
  }
}

module.exports = new UserCredentialService();
