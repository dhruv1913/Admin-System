const crypto = require("crypto");

/**
 * CONFIG
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;        // 96-bit IV (recommended for GCM)
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32;      // 256-bit key

/**
 * Generate strong key from secret
 * (same secret → same key on both mobile & backend)
 */
// function getKeyFromSecret(secret) {
//   return crypto.scryptSync(secret, "fixed_salt_value", KEY_LENGTH);
// }

function getKeyFromSecret(secret) {
  return crypto.pbkdf2Sync(
    secret,
    "fixed_salt_value",   // SAME as frontend
    100000,               // SAME iterations
    32,                   // 256-bit key
    "sha256"
  );
}


/**
 * Encrypt plain text
 */
function encryptToken(plainText, secret) {
  if (!plainText || !secret) {
    throw new Error("plainText and secret are required");
  }

  const key = getKeyFromSecret(secret);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  /**
   * Final payload format:
   * [ IV | AUTH_TAG | ENCRYPTED_DATA ]
   */
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt encrypted text
 */
function decryptToken(encryptedText, secret) {
  if (!encryptedText || !secret) {
    throw new Error("encryptedText and secret are required");
  }

  const key = getKeyFromSecret(secret);
  const data = Buffer.from(encryptedText, "base64");

  const iv = data.slice(0, IV_LENGTH);
  const authTag = data.slice(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.slice(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

module.exports = {
  encryptToken,
  decryptToken,
};
