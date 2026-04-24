const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALGORITHM = "aes-256-cbc";

const privateKey = fs.readFileSync(
  path.join(__dirname, "../private.pem"),
  "utf8"
);

function getKeyFromSecret(secret) {
  return crypto.createHash("sha256").update(secret).digest(); // 32-byte key
}

const IV = Buffer.alloc(16, 0); // you can keep a fixed IV for deterministic encryption if needed

function encryptToken(text, secret) {
  const KEY = getKeyFromSecret(secret);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, IV);
  let encrypted = cipher.update(text, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decryptToken(encrypted, secret) {
  const KEY = getKeyFromSecret(secret);
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, IV);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// 🔑 RSA decrypt AES key
function rsaDecryptKey(encryptedKeyBase64) {
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedKeyBase64, "base64")
  );
}

// 🔓 AES decrypt payload
function aesDecrypt(encrypted, key, ivBase64) {
  const iv = Buffer.from(ivBase64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

module.exports = { encryptToken, decryptToken, rsaDecryptKey, aesDecrypt };