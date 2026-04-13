const jwt = require("jsonwebtoken");
const { LoginToken, Service } = require("../models");
const { JWT_SECRET,COOKIE_DOMAIN,BACKEND_URL } = process.env;
const redisClient = require("../utils/redisClient");

/**
 * 🔹 Verify JWT Token Middleware
 * Checks:
 *  1. Token presence
 *  2. JWT signature, expiry, issuer, audience
 *  3. Redis blacklist (instant revocation)
 *  4. Database ACTIVE status (not logged out)
 */
async function verifyToken(req, res, next) {
  // const authHeader = req.headers["authorization"];
  // const token = authHeader?.split(" ")[1] || req.query.token;


  const authHeader = req.headers["authorization"];

const token =
  authHeader?.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : req.cookies?.sso_token;


  if (!token) {
    return res.status(401).json({
      status: "failure",
      tokenValid: false,
      message: "Token missing",
    });
  }

  try {
    // Step 1️⃣ — Verify JWT
    const unsafeDecoded = jwt.decode(token);
    //console.log('unsafeDecoded',unsafeDecoded);
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS512"],
      issuer: BACKEND_URL,
      audience: unsafeDecoded.aud
    });

    // Step 2️⃣ — Check if blacklisted in Redis
    const isBlacklisted = await redisClient.get(`blacklist:${decoded.jti}`);
    if (isBlacklisted) {
      return res.status(401).json({
        status: "failure",
        tokenValid: false,
        message: "Token revoked (blacklisted)",
      });
    }

    // Step 3️⃣ — Check token status in DB
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti, // jti from JWT
      },
    });

    if (!loginEntry || loginEntry.status !== "ACTIVE") {
      return res.status(401).json({
        status: "failure",
        tokenValid: false,
        message: "Token has been logged out or invalidated",
      });
    }

    // ✅ Token is valid
    req.user = decoded;
    next();
  } catch (err) {
    console.error("verifyToken error:", err.message);
    return res.status(401).json({
      status: "failure",
      tokenValid: false,
      message: err.message,
    });
  }
}

async function validateServiceKey(req, res, next) {
  const serviceKey = req.params.serviceKey || req.query.serviceKey;
  if (!serviceKey)
    return res.status(400).json({ status: "failure", tokenValid: false, message: "Service key missing" });

  const service = await Service.findOne({ where: { service_key: serviceKey, is_active: true } });
  if (!service)
    return res.status(404).json({ status: "failure", tokenValid: false, message: "Service not found" });

  req.service = service;
  next();
}

module.exports = { verifyToken, validateServiceKey };
