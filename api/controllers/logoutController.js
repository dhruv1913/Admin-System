const { LoginToken, LoginAuditLog } = require("../models");
const jwt = require("jsonwebtoken");
const redisClient = require("../utils/redisClient");

const { JWT_SECRET, COOKIE_DOMAIN, NODE_ENV } = process.env;

exports.logout = async (req, res) => {
  console.log("🔐 Logout called");

  try {
    // --- Extract Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token malformed" });

    // --- Verify Token ---
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] });
      console.log("✅ Token verified:", decoded.userId);
    } catch (err) {
      console.log("❌ Invalid token:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // --- Fetch Session Record ---
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE"
      }
    });

    if (!loginEntry) {
      console.log("⚠️ Session not found");
      return res.status(404).json({ error: "Session already logged out" });
    }

    // --- Clear Cookies (Single Clean Code) ---
   

    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: false, // must match SET cookie
      sameSite: "lax"
    };

    ["sso_token", "auth_token"].forEach((cookie) => {
      res.clearCookie(cookie, cookieOptions);
      res.cookie(cookie, "", { ...cookieOptions, expires: new Date(0) });
    });

    console.log("🍪 Cookies cleared");

    // --- Update DB ---
    await loginEntry.update({
      logout_time: new Date(),
      status: "LOGOUT"
    });

    // --- Audit Log ---
    await LoginAuditLog.create({
      username: decoded.userId,
      service_id: decoded.service_id,
      token_id: loginEntry.id,
      action: "LOGOUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"] || null
    });

    // --- Redis Blacklist ---
    if (decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redisClient.setEx(`blacklist:${token}`, ttl, "1");
      console.log(`🧱 Token blacklisted for ${ttl} seconds`);
    }

    // --- Destroy Session (optional) ---
    if (req.session) {
      req.session.destroy(() => console.log("🧹 Session destroyed"));
    }

    // --- Final Response ---
    return res.json({
      success: true,
      message: "Logged out successfully",
      redirectUrl: process.env.FRONTEND_URL || "http://localhost:5174"
    });

  } catch (err) {
    console.error("🔥 Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



exports.logoutApp = async (req, res) => {
  console.log("🔐 Logout App called");

  try {
    // --- Extract Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token provided" });

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Token malformed" });

    // --- Verify Token ---
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] });
      console.log("✅ Token verified:", decoded.userId);
    } catch (err) {
      console.log("❌ Invalid token:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // --- Fetch Session Record ---
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE"
      }
    });

    if (!loginEntry) {
      console.log("⚠️ Session not found");
      return res.status(404).json({ error: "Session already logged out" });
    }

    // --- Clear Cookies (Single Clean Code) ---
   

    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: false, // must match SET cookie
      sameSite: "lax"
    };

    ["sso_token", "auth_token"].forEach((cookie) => {
      res.clearCookie(cookie, cookieOptions);
      res.cookie(cookie, "", { ...cookieOptions, expires: new Date(0) });
    });

    console.log("🍪 Cookies cleared");

    // --- Update DB ---
    await loginEntry.update({
      logout_time: new Date(),
      status: "LOGOUT"
    });

    // --- Audit Log ---
    await LoginAuditLog.create({
      username: decoded.userId,
      service_id: decoded.service_id,
      token_id: loginEntry.id,
      action: "LOGOUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"] || null
    });

    // --- Redis Blacklist ---
    if (decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) await redisClient.setEx(`blacklist:${token}`, ttl, "1");
      console.log(`🧱 Token blacklisted for ${ttl} seconds`);
    }

    // --- Destroy Session (optional) ---
    if (req.session) {
      req.session.destroy(() => console.log("🧹 Session destroyed"));
    }

    // --- Final Response ---
    return res.json({
      success: true,
      message: "Logged out successfully",
      redirectUrl: process.env.FRONTEND_URL || "http://localhost:5174"
    });

  } catch (err) {
    console.error("🔥 Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};


exports.logouts_old = async (req, res) => {
  console.log("🔐 Logout called");

  try {
    // --------------------------------------------------
    // 🔐 Extract Token (Header OR sso_token cookie only)
    // --------------------------------------------------
    const authHeader = req.headers.authorization;

    let token = null;

    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies?.sso_token) {
      token = req.cookies.sso_token; // ✅ plain JWT only
    }

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    // --------------------------------------------------
    // ✅ Verify Token
    // --------------------------------------------------
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] });
      console.log("✅ Token verified:", decoded.userId);
    } catch (err) {
      console.log("❌ Invalid token:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // --------------------------------------------------
    // 🔎 Fetch Session Record
    // --------------------------------------------------
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE",
      },
    });

    if (!loginEntry) {
      console.log("⚠️ Session not found");
      return res.status(404).json({ error: "Session already logged out" });
    }

    // --------------------------------------------------
    // 🍪 Clear Cookies
    // --------------------------------------------------
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      domain: process.env.COOKIE_DOMAIN,
    };

    ["sso_token", "auth_token"].forEach((cookie) => {
      res.clearCookie(cookie, cookieOptions);
      res.cookie(cookie, "", { ...cookieOptions, expires: new Date(0) });
    });

    console.log("🍪 Cookies cleared");

    // --------------------------------------------------
    // 🧾 Update DB
    // --------------------------------------------------
    await loginEntry.update({
      logout_time: new Date(),
      status: "LOGOUT",
    });

    // --------------------------------------------------
    // 📜 Audit Log
    // --------------------------------------------------
    await LoginAuditLog.create({
      username: decoded.userId,
      service_id: decoded.service_id,
      token_id: loginEntry.id,
      action: "LOGOUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"] || null,
    });

    // --------------------------------------------------
    // 🧱 Redis Blacklist
    // --------------------------------------------------
    if (decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await redisClient.setEx(`blacklist:${token}`, ttl, "1");
        console.log(`🧱 Token blacklisted for ${ttl} seconds`);
      }
    }

    // --------------------------------------------------
    // 🧹 Destroy Session
    // --------------------------------------------------
    if (req.session) {
      req.session.destroy(() => console.log("🧹 Session destroyed"));
    }

    // --------------------------------------------------
    // ✅ Final Response
    // --------------------------------------------------
    return res.json({
      success: true,
      message: "Logged out successfully",
      redirectUrl: process.env.FRONTEND_URL || "http://localhost:5174",
    });

  } catch (err) {
    console.error("🔥 Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};



exports.logouts = async (req, res) => {
  console.log("🔐 Unified Logout called");

  try {
    let jwtHandled = false;

    // --------------------------------------------------
    // 🔐 JWT BASED LOGOUT (LDAP / SSO)
    // --------------------------------------------------
    let token = null;

    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.sso_token) {
      token = req.cookies.sso_token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] });

        const loginEntry = await LoginToken.findOne({
          where: {
            username: decoded.userId,
            service_id: decoded.service_id,
            access_token: decoded.jti,
            status: "ACTIVE",
          },
        });

        if (loginEntry) {
          await loginEntry.update({
            logout_time: new Date(),
            status: "LOGOUT",
          });

          await LoginAuditLog.create({
            username: decoded.userId,
            service_id: decoded.service_id,
            token_id: loginEntry.id,
            action: "LOGOUT",
            ip_address: req.ip,
            user_agent: req.headers["user-agent"],
          });
        }

        if (decoded.exp) {
          const ttl = decoded.exp - Math.floor(Date.now() / 1000);
          if (ttl > 0) {
            await redisClient.setEx(`blacklist:${token}`, ttl, "1");
          }
        }

        jwtHandled = true;
      } catch (err) {
        console.log("⚠️ JWT logout skipped:", err.message);
      }
    }

    // --------------------------------------------------
    // 🔓 SESSION BASED LOGOUT (Google)
    // --------------------------------------------------
    if (req.session) {
      await new Promise((resolve) =>
        req.session.destroy(() => {
          console.log("🧹 Session destroyed");
          resolve();
        })
      );

      res.clearCookie("connect.sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    // --------------------------------------------------
    // 🍪 CLEAR SSO COOKIES
    // --------------------------------------------------
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      domain: process.env.COOKIE_DOMAIN,
    };

    ["sso_token", "auth_token"].forEach((c) =>
      res.clearCookie(c, cookieOptions)
    );

    // --------------------------------------------------
    // ✅ FINAL RESPONSE (ALWAYS SUCCESS)
    // --------------------------------------------------
    return res.json({
      success: true,
      message: jwtHandled
        ? "SSO logout successful"
        : "Session logout successful",
      redirectUrl: process.env.FRONTEND_URL || "http://localhost:5174",  
    });

  } catch (err) {
    console.error("🔥 Logout error:", err);
    return res.status(500).json({ error: "Logout failed" });
  }
};

