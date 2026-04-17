const { errorResponse } = require('../utils/responseHandler');
const { createClient, bind, search } = require('../services/ldapService');
const { decryptToken } = require('../utils/Crypto'); 
const jwt = require('jsonwebtoken'); // 🚨 THIS IS CRITICAL

const authMiddleware = async (req, res, next) => {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) return errorResponse(res, "No token provided", 403);

    try {
        const keysToTry = [
            process.env.DEPT_SECRET_KEY, 
            process.env.ENCRYPTION_SECRET
        ];

        let decrypted = null;
        const safeToken = String(token).replace(/ /g, '+');

        // 1️⃣ Decrypt the payload
        for (let secret of keysToTry) {
            if (!secret) continue;
            try {
                const cleanSecret = String(secret).replace(/^["']|["']$/g, '').trim();
                decrypted = decryptToken(safeToken, cleanSecret);
                if (decrypted) break; 
            } catch (error) {
                continue; 
            }
        }

        if (!decrypted) {
            return errorResponse(res, "Unauthorized: Cannot decrypt token", 401);
        }

        // 2️⃣ 🚨 THE FIX: Decode the JWT
        let userPayload = null;
        try {
            // Decrypt returns a JWT string (e.g., "eyJhbGciOiJIUzUxMi..."). We must decode it.
            let decoded = jwt.decode(decrypted);
            
            if (decoded) {
                userPayload = decoded.data || decoded.user || decoded;
            } else {
                // Fallback just in case it ever IS pure JSON
                const parsed = JSON.parse(decrypted);
                userPayload = parsed.data || parsed.user || parsed;
            }
        } catch (e) {
            console.error("Payload extraction failed:", e.message);
            return errorResponse(res, "Unauthorized: Invalid payload format", 401);
        }

        if (!userPayload) {
             return errorResponse(res, "Unauthorized: Missing user data", 401);
        }

        // Standardize the user object for the Dashboard
        req.user = {
            uid: userPayload.userId || userPayload.uid,
            role: userPayload.role || "USER",
            name: userPayload.name || "User"
        };

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
        console.error("Critical Auth Error:", err.message);
        return errorResponse(res, "Unauthorized", 401);
    }
};

module.exports = authMiddleware;