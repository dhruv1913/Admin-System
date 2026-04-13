const crypto = require('crypto');
const fs = require('fs');      
const path = require('path');   
const authController = require('../controllers/authController');


// 🚨 OPTIMIZATION: Read the key ONCE when the server starts, not on every click!
const decryptPayload = (req, res, next) => {
    if (!req.body) return next();
    const { payload, key, iv } = req.body;
    
    if (!payload || !key || !iv) return next(); 

    // 🚨 Get the private key directly from the controller's memory (No API needed!)
    const privateKey = authController.getPrivateKey();

    if (!privateKey) {
        return res.status(500).json({ message: "Server encryption keys not loaded" });
    }

    try {
        // 1. Decrypt the RSA locked key
        const rawDecryptedKey = crypto.privateDecrypt(
            { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
            Buffer.from(String(key).replace(/ /g, '+'), 'base64')
        ).toString('utf8'); 

        // 2. Clean the strings
        const cleanKeyString = rawDecryptedKey.replace(/[\0\r\n\s"']/g, '');
        const cleanIvString = String(iv).replace(/ /g, '+').replace(/[\0\r\n\s"']/g, '');
        const safePayload = String(payload).replace(/ /g, '+');

        // 3. Smart Decode
        let aesKeyBuffer = cleanKeyString.length === 64 
            ? Buffer.from(cleanKeyString, 'hex') 
            : Buffer.from(cleanKeyString, 'base64');

        let ivBuffer = cleanIvString.length === 32 
            ? Buffer.from(cleanIvString, 'hex') 
            : Buffer.from(cleanIvString, 'base64');

        // 4. Force buffer sizes
        if (aesKeyBuffer.length !== 32) {
            const temp = Buffer.alloc(32);
            aesKeyBuffer.copy(temp);
            aesKeyBuffer = temp;
        }
        if (ivBuffer.length !== 16) {
            const temp = Buffer.alloc(16);
            ivBuffer.copy(temp);
            ivBuffer = temp;
        }

        // 5. Decrypt the payload
        const decipher = crypto.createDecipheriv('aes-256-cbc', aesKeyBuffer, ivBuffer);
        let decryptedData = decipher.update(safePayload, 'base64', 'utf8');
        decryptedData += decipher.final('utf8');

        // 6. Clean and parse
        decryptedData = decryptedData.replace(/\0/g, '').trim();
        req.body = JSON.parse(decryptedData);
        
        if (req.file) req.body.photo = req.file;

        next();

    } catch (error) {
        console.error("🔒 SECURE DECRYPTION FAILED:", error.message);
        return res.status(400).json({ message: "Decryption failed. Invalid keys or payload." });
    }
};
module.exports = { decryptPayload };