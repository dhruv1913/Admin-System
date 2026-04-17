const { errorResponse } = require('../utils/responseHandler');
const { createClient, bind, search } = require('../services/ldapService');
const { decryptToken } = require('../utils/Crypto'); 
const jwt = require('jsonwebtoken'); // 🚨 REQUIRED

const authMiddleware = async (req, res, next) => {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
        token = req.cookies.jwt;
    }

    if (!token) return errorResponse(res, "No token provided", 403);

    try {
        const safeToken = String(token).replace(/ /g, '+');
        let finalPayloadString = null;

        // 1️⃣ SMART CHECK: Is the token already a Pure, Unencrypted JWT?
        const rawDecoded = jwt.decode(safeToken);
        if (rawDecoded && (rawDecoded.userId || rawDecoded.uid || rawDecoded.jti)) {
            finalPayloadString = safeToken; // It's already pure! No decryption needed.
        } else {
            // 2️⃣ FALLBACK: It must be encrypted. Try to decrypt it.
            const keysToTry = [
                process.env.DEPT_SECRET_KEY, 
                process.env.ENCRYPTION_SECRET,
                "mySuperSecretKey123!@#4567890abcdef",
                "12345678901234567890123456789012"
            ];

            for (let secret of keysToTry) {
                if (!secret) continue;
                try {
                    const cleanSecret = String(secret).replace(/^["']|["']$/g, '').trim();
                    const decrypted = decryptToken(safeToken, cleanSecret);
                    if (decrypted) {
                        finalPayloadString = decrypted;
                        break; 
                    }
                } catch (error) {
                    continue; 
                }
            }
        }

        if (!finalPayloadString) {
            return errorResponse(res, "Unauthorized: Cannot parse or decrypt token", 401);
        }

        // 3️⃣ Extract user data
        let userPayload = null;
        try {
            let decoded = jwt.decode(finalPayloadString);
            if (decoded) {
                userPayload = decoded.data || decoded.user || decoded;
            } else {
                const parsed = JSON.parse(finalPayloadString);
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

        // 4️⃣ LDAP permissions fetch
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