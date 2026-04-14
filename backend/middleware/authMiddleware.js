const { verifyToken } = require('../services/tokenService');
const { errorResponse } = require('../utils/responseHandler');
const { createClient, bind, search } = require('../services/ldapService');
const { decryptToken } = require("../utils/encryption");
const jwt = require("jsonwebtoken");

exports.protect = async (req, res, next) => {
  try {
    // 1) Get the encrypted token from the header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({ message: "You are not logged in." });
    }

    // 2) 🚨 THE FIX: Decrypt the AES string back into a Raw JWT!
    let rawJwt = token;
    try {
        // This secret MUST match the service.secret_key in your SSO Database!
        const secretKey = process.env.ENCRYPTION_SECRET || process.env.DEPT_SECRET_KEY;
        const decrypted = decryptToken(token, secretKey);
        
        if (decrypted) {
            rawJwt = decrypted;
        }
    } catch (err) {
        console.log("Token decryption skipped/failed, trying raw token...");
    }

    // 3) Verify the Raw JWT
    // (This is where it previously crashed because rawJwt was an encrypted string)
    const decoded = jwt.verify(rawJwt, process.env.JWT_SECRET, { 
        algorithms: ["HS512", "HS256"] 
    });
    
    // 4) Attach user and grant access
    req.user = decoded;
    next();
    
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return errorResponse(res, "No token provided", 403);

    const token = authHeader.split(" ")[1];
    if (!token) return errorResponse(res, "Malformed token", 403);

    try {
        // 1. Unpack the token payload
        req.user = verifyToken(token);

        // 🚨 2. THE FIX: If this is an Admin and the SSO token forgot their permissions, fetch them now!
        if ((req.user.role === "ADMIN" || req.user.role === "admin") && (!req.user.allowedOUs || req.user.allowedOUs.length === 0)) {
            const client = createClient();
            try {
                await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
                const baseDN = process.env.LDAP_ORG_BASE || process.env.LDAP_BASE_DN;

                // Search LDAP for this specific Admin's profile
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

                // Attach the LDAP permissions directly to the request!
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