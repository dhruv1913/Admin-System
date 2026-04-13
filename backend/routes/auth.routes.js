const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const authController = require('../controllers/authController');

// 🛡️ IN-MEMORY BLACKLIST: Remembers logged-out tokens so they can't be copy-pasted
const tokenBlacklist = new Set();

router.get('/public-key', authController.getPublicKey);

// 🚨 100% Environment Driven! No hardcoded URLs.
router.get('/config', (req, res) => {
    res.status(200).json({
        portalUrl: process.env.VITE_SSO_URL, 
        serviceKey: process.env.VITE_SERVICE_KEY,
        tokenUrl: process.env.VITE_TOKEN_URL 
    });
});

router.post('/sendOtp', authController.requestOtp); 
router.post('/requestOtp', authController.requestOtp); 
router.post('/verifyOtp', authController.verifyOtp);
router.get('/captcha', authController.getCaptcha);

// 🚨 THE BOUNCER: Checks if the token is valid AND not blacklisted
router.post('/token/reads', (req, res) => {
    try {
        const token = req.body.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        if (!token) return res.status(401).json({ valid: false, message: "No token provided" });

        if (tokenBlacklist.has(token)) {
            console.log("Blocked attempt to use a logged-out token!");
            return res.status(401).json({ valid: false, message: "Session expired / Logged out" });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return res.status(200).json({ valid: true, user: decoded });
    } catch (err) {
        return res.status(401).json({ valid: false, message: "Invalid session" });
    }
});

// Pass the request to the controller, and include the blacklist so we can add to it!
        
// 🚨 Replace the existing router.post('/logout', ...) with this exact code:
router.post('/logout', async (req, res) => {
    try {
        const token = req.body.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
        
        if (token) {
            tokenBlacklist.add(token);
            console.log("Token permanently blacklisted in memory!");
        }
        
        // Let the authController handle the safe database update!
        return authController.logout(req, res);
    } catch (err) {
        console.error("Logout routing failed:", err);
        return res.status(500).json({ message: "Logout failed" });
    }
});

module.exports = router;