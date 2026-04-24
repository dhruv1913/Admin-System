// 🚨 Import your newly unified encryption utility
const { decrypt } = require('../utils/encryption'); 

const decryptPayload = (req, res, next) => {
    if (!req.body) return next();
    
    let encryptedPayload;
    
    // Check if the frontend sent the stringified "data" object (e.g., via FormData with an image)
    if (req.body.data) {
        try {
            const parsedData = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
            encryptedPayload = parsedData.payload || parsedData;
        } catch (e) {
            return res.status(400).json({ message: "Invalid payload format." });
        }
    } else {
        encryptedPayload = req.body.payload;
    }

    // If no encrypted payload exists, just move to the next middleware
    if (!encryptedPayload) {
        return next(); 
    }

    try {
        // 1. Fetch the shared secret
        const secret = process.env.DEPT_SECRET_KEY || process.env.ENCRYPTION_SECRET;
        if (!secret) throw new Error("Server encryption keys not loaded");

        // 2. Use the unified AES-256-CBC decrypt function
        const decryptedData = decrypt(encryptedPayload, secret);
        
        // 3. Parse the decrypted JSON back into req.body
        req.body = JSON.parse(decryptedData);
        
        // 4. Re-attach the photo if multer found one!
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