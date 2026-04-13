const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// 🔐 Load private key ONCE
const privateKey = fs.readFileSync(
  path.join(__dirname, "../keys/private.pem"),
  "utf8"
);

/**
 * Decrypt RSA encrypted payload
 * @param {string} payload - base64 encrypted string
 * @returns {object} decrypted JSON object
 */
module.exports.decryptPayload = (payload) => {
  if (!payload) {
    throw new Error("Encrypted payload missing");
  }

  let decryptedBuffer;

  try {
    decryptedBuffer = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(payload, "base64")
    );
  } catch (err) {
    throw new Error("Invalid or tampered encrypted payload");
  }

  try {
    return JSON.parse(decryptedBuffer.toString("utf8"));
  } catch (err) {
    throw new Error("Decrypted payload is not valid JSON");
  }
};
