const fs = require('fs');      
const path = require('path');   

const crypto = require('crypto');
const authController = require('../controllers/authController');

const decryptPayload = (req, res, next) => {
    if (!req.body) return next();
    
   let payload, key, iv;
    
    // Check if the frontend sent the stringified "data" object (FormData)
    if (req.body.data) {
        try {
            const parsedData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
            payload = parsedData.payload;
            key = parsedData.key;
            iv = parsedData.iv;
        } catch (e) {
            return res.status(400).json({ message: "Invalid payload format." });
        }
    } else {
        payload = req.body.payload;
        key = req.body.key;
        iv = req.body.iv;
    }

    if (!payload || !key || !iv) return next();
    
    // If it's still missing, we can't decrypt it
    if (!payload || !key || !iv) {
        console.log("⚠️ Middleware skipping decryption: Missing payload, key, or iv");
        return next(); 
    }

    // 🚨 Get the private key directly from the controller's memory
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
        
        // 7. Re-attach the photo if multer found one!
        if (req.file) {
            req.body.photo = req.file;
        }

        next();

    } catch (error) {
        console.error("🔒 SECURE DECRYPTION FAILED:", error.message);
        return res.status(400).json({ message: "Decryption failed. Invalid keys or payload." });
    }
};

module.exports = { decryptPayload };