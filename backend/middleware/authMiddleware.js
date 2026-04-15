const { verifyToken } = require('../services/tokenService');
const { errorResponse } = require('../utils/responseHandler');
const { createClient, bind, search } = require('../services/ldapService');
const crypto = require('crypto');

// 🚨 THE FIX: A perfect inline AES-256-CBC decryptor that exactly matches your SSO output.
// No file imports needed, so the server will never crash!
const decryptSSOToken = (encryptedBase64, secret) => {
    try {
        if (!encryptedBase64 || !secret) return null;
        
        // Match the SSO encryptToken logic: 32-byte key, 16-byte empty IV
        const KEY = crypto.createHash("sha256").update(String(secret)).digest();
        const IV = Buffer.alloc(16, 0); 
        
        const decipher = crypto.createDecipheriv("aes-256-cbc", KEY, IV);
        let decrypted = decipher.update(encryptedBase64, "base64", "utf8");
        decrypted += decipher.final("utf8");
        
        return decrypted;
    } catch (error) {
        return null; // If it fails, we fall back to assuming it's a raw token
    }
};

const authMiddleware = async (req, res, next) => {
    let token;
    
    // Check headers or cookies
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) return errorResponse(res, "No token provided", 403);

    try {
        let rawJwt = token;
        
        // 1️⃣ Try to decrypt the SSO AES token using the inline tool
        try {
            const secretKey = process.env.ENCRYPTION_SECRET || process.env.DEPT_SECRET_KEY;
            if (secretKey) {
                const decrypted = decryptSSOToken(token, secretKey);
                if (decrypted) rawJwt = decrypted;
            }
        } catch (err) {
            console.log("Decryption attempt failed, assuming raw JWT.");
        }

        // 2️⃣ Verify the raw JWT
        req.user = verifyToken(rawJwt);

        // 3️⃣ LDAP permissions fetch
        if ((req.user.role === "ADMIN" || req.user.role === "admin") && (!req.user.allowedOUs || req.user.allowedOUs.length === 0)) {
            const client = createClient();
            try {
                await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
                const baseDN = process.env.LDAP_ORG_BASE || process.env.LDAP_BASE_DN;

                const adminData = await search(client, baseDN, {
                    scope: "sub",
                    filter: `(uid=${req.user.uid})`,
                    attributes: ["departmentNumber"]
                });

                let fetchedOUs = [];
                if (adminData.length > 0 && adminData[0].departmentNumber) {
                    const rules = Array.isArray(adminData[0].departmentNumber) ? adminData[0].departmentNumber : [adminData[0].departmentNumber];
                    rules.forEach(rule => {
                        const cleaned = String(rule).replace('ALLOW:', '').trim();
                        fetchedOUs.push(...cleaned.split(',').map(s => s.trim()));
                    });
                }
                req.user.allowedOUs = fetchedOUs;
            } catch (e) {
                console.error("AuthMiddleware LDAP fetch error:", e.message);
                req.user.allowedOUs = [];
            } finally {
                client.unbind();
            }
        }

        next();
    } catch (err) {
        console.error("Token verification failed:", err.message);
        return errorResponse(res, "Unauthorized: Invalid token", 401);
    }
};

module.exports = authMiddleware;