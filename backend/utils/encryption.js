const crypto = require('crypto');

const ALGORITHM = "aes-256-cbc";
// A fixed IV of 16 zeroes to match api/utils/Crypto.js exactly
const IV = Buffer.alloc(16, 0); 

function getKeyFromSecret(secret) {
    if (!secret) throw new Error('CRITICAL: Secret key is missing!');
    return crypto.createHash("sha256").update(String(secret)).digest(); // 32-byte key
}

function encrypt(text, secret) {
    const KEY = getKeyFromSecret(secret);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
    let encrypted = cipher.update(String(text), "utf8", "base64");
    encrypted += cipher.final("base64");
    return encrypted;
}

function decrypt(encrypted, secret) {
    if (!encrypted) return null;
    const KEY = getKeyFromSecret(secret);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
    let decrypted = decipher.update(String(encrypted), "base64", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

module.exports = { encrypt, decrypt };