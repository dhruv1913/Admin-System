const { rsaDecryptKey, aesDecrypt } = require("../utils/Crypto");

const decryptRequest = () => {
  return (req, res, next) => {
    try {

      const { iv, key, payload } = req.body;

      if (!iv || !key || !payload) {
        return res.status(400).json({
          error: "Invalid or tampered request."
        });
      }

      // 🔑 RSA decrypt AES key
      const aesKey = rsaDecryptKey(key);
      if (!aesKey) {
        return res.status(400).json({
          error: "Invalid encryption key."
        });
      }

      // 🔓 AES decrypt payload
      const decryptedStr = aesDecrypt(payload, aesKey, iv);
      if (!decryptedStr) {
        return res.status(400).json({
          error: "Invalid or tampered payload."
        });
      }

      let decryptedData;

      try {
        decryptedData = JSON.parse(decryptedStr);
      } catch {
        return res.status(400).json({
          error: "Invalid payload format."
        });
      }

      // ✅ decrypted data attach
      req.decrypted = decryptedData;

      next();

    } catch (error) {
      console.error("Decrypt middleware error:", error);
      return res.status(500).json({
        message: "Request decryption failed"
      });
    }
  };
};

module.exports = decryptRequest;