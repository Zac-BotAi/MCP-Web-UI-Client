const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
// Key should be 32 bytes for AES-256. Ensure this is set in your environment variables.
// For development, you can use a hardcoded key but change it for production.
const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'default_dev_encryption_key_32ch';

if (ENCRYPTION_KEY.length !== 32 && process.env.NODE_ENV !== 'test') {
  console.warn(
    `Warning: CREDENTIAL_ENCRYPTION_KEY is not 32 bytes long. It is ${ENCRYPTION_KEY.length} bytes. ` +
    `This may cause errors or unexpected behavior in encryption/decryption. ` +
    `Please ensure it is set correctly in your environment variables.`
  );
}
// Ensure the key is 32 bytes by either padding or truncating (not ideal for security, but makes it work)
// A better approach is to throw an error if the key length is wrong in production.
const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '\0').slice(0, 32), 'utf8');


function encrypt(text) {
  if (text === null || typeof text === 'undefined') {
    throw new Error('Text to encrypt cannot be null or undefined.');
  }
  const iv = crypto.randomBytes(12); // GCM recommended IV size is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

function decrypt(encryptedData, ivHex, authTagHex) {
  if (!encryptedData || !ivHex || !authTagHex) {
    // Or handle this case more gracefully depending on your application's needs
    // For example, if you expect some fields to be occasionally null/empty
    // and that's an acceptable state, you might return null or an empty string.
    console.warn('Decryption called with missing data. EncryptedData, IV, or AuthTag is missing.');
    return null; // Or throw new Error('Encrypted data, IV, or AuthTag is missing.');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
