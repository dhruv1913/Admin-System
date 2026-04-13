const jwt = require('jsonwebtoken');
const keys = require('../config/keys');

// Fallback secret ensures tokens always work
const SECRET = keys.jwtSecret;

exports.generateToken = (payload, expiresIn = '8h') => {
    return jwt.sign(payload, SECRET, { expiresIn });
};

exports.verifyToken = (token) => {
    if (!token || token === "undefined") throw new Error("Invalid token string");
    return jwt.verify(token, SECRET);
};