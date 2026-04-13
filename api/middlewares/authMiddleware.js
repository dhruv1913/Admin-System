const jwt = require("jsonwebtoken");
const redisClient = require("../utils/redisClient");
const { LoginToken } = require("../models");
const { JWT_SECRET } = process.env;

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ error: "Missing token" });

    const token = authHeader.split(" ")[1];
    if (!token)
      return res.status(401).json({ error: "Token malformed" });

    // ✅ Check Redis blacklist first
    const blacklisted = await redisClient.get(`blacklist:${token}`);
    if (blacklisted)
      return res.status(401).json({ error: "Token has been logged out" });

    // ✅ Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
//console.log(decoded);
    // ✅ Ensure token still active in DB
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE",
      },
    });

    if (!loginEntry)
      return res.status(401).json({ error: "Invalid or logged-out session" });

    req.user = decoded;
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    res.status(401).json({ error: "Unauthorized" });
  }
};
