const crypto = require('crypto');
const keys = require('../config/keys');

// Derive a 32-byte key from the configured encryption key
const RAW_SECRET = keys.encryptionKey;

if (!RAW_SECRET) {
  console.error('CRITICAL: || is not set. Sensitive fields cannot be protected.');
}

const KEY = RAW_SECRET
  ? crypto.createHash('sha256').update(String(RAW_SECRET)).digest()
  : null; // 32 bytes

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce for GCM

function encrypt(plainText) {
  if (!KEY) {
    throw new Error('Encryption key not configured');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);

  let encrypted = cipher.update(String(plainText), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Store as iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

function decrypt(storedValue) {
  if (!KEY) {
    throw new Error('Encryption key not configured');
  }
  if (!storedValue) return null;

  const parts = String(storedValue).split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivB64, tagB64, cipherB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };

