const jwt = require('jsonwebtoken');

exports.generateToken = (payload, expiresIn = '8h') => {
    // 🚨 Dynamic load prevents .env race conditions!
    const SECRET = process.env.JWT_SECRET || require('../config/keys').jwtSecret;
    return jwt.sign(payload, SECRET, { expiresIn });
};

exports.verifyToken = (token) => {
    if (!token || token === "undefined") throw new Error("Invalid token string");
    
    // 🚨 Strip accidental literal quotes from SSO decryption
    const cleanToken = String(token).replace(/^["']|["']$/g, '').trim();
    
    // 🚨 Dynamically fetch the key
    const SECRET = process.env.JWT_SECRET || require('../config/keys').jwtSecret;
    
    if (!SECRET) {
        console.error("🚨 CRITICAL: JWT_SECRET is missing from environment variables!");
    }

    return jwt.verify(cleanToken, SECRET);
};