const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const Service = require("../models/Service");
const { LoginToken, LoginAuditLog,ServiceLdapSetting } = require("../models");
const { JWT_SECRET, FRONTEND_URL, BACKEND_URL,JWT_EXPIRES_IN,ENCRYPTION_SECRET,COOKIE_DOMAIN } = process.env;
const { encryptToken,decryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto");
const AppError = require("../utils/appError");
const { checkUserExists } = require("../services/ldapService");
const UAParser = require("ua-parser-js");

const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
};

/* =====================================================
   🔹 Helper: Force Session Save Before Redirect
===================================================== */
const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

async function completeLoginAndRedirect(req, res, userObj, serviceKey) {
  try {
    // 🔹 Fetch service
    const service = await Service.findOne({
      where: { service_key: serviceKey, is_active: true },
    });
    if (!service) throw new AppError("Invalid service", 400);

    const redirectBase = service.service_url || FRONTEND_URL;

    // 🔹 Fetch LDAP settings
    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: service.id },
    });
    if (!settings) throw new AppError("Service LDAP not configured", 404);

    // 🔹 Extract user id from profile
    const profile = userObj.profile || {};
    const userId =
      profile.emails?.[0]?.value || "unknown";

    // 🔐 LDAP CHECK
    const ldapResult = await checkUserExists(userId, settings);
    if (!ldapResult.userExists) {
      req.session.googleOnly = true;
      req.session.ldapUser = false;

      await saveSession(req); // 🔥 IMPORTANT

  return res.redirect(
    `${FRONTEND_URL}/no-record-found`
  );
}


    // ✅ Build JWT payload
    const payload = {
      userId: ldapResult.userName || userId,
      provider: "GOOGLE",
      authType: "Yukti",
      name: ldapResult.fullName || profile.displayName || null,
      email: ldapResult.mail || profile.emails?.[0]?.value || null,
      picture: profile.photos?.[0]?.value || null,
      title: ldapResult.title || null,
      iss: BACKEND_URL,
      aud: redirectBase,
      jti: crypto.randomUUID(),
      service_id: service.id,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    };
console.log("🔹 JWT Payload:", payload);
    // 🔹 Generate JWT
    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    if (!service.secret_key) {
     throw new AppError("Service secret key not configured", 500);
    }

    // 🔐 Encrypt with service secret → for PHP redirect
    const encryptedToken = encryptToken(token, service.secret_key);

    // 🔐 Encrypt with central secret → for SSO cookie
    const encryptedTokenAuth = encryptToken(
      token,
      process.env.ENCRYPTION_SECRET
    );

    // 🔹 Get real client IP
                              const clientIp = getClientIp(req);
                      
                              // 🔹 Parse User Agent
                              const parser = new UAParser(req.headers["user-agent"]);
                              const result = parser.getResult();
                      
                              const browserName = result.browser.name || null;
                              const browserVersion = result.browser.version || null;
                              const os = result.os.name || null;
                              const deviceType = result.device.type || "desktop";
    

    // 🔹 Save login token
    const loginToken = await LoginToken.create({
      username: payload.userId,
      service_id: service.id,
      access_token: payload.jti,
      ip_address: clientIp,
          user_agent: req.headers["user-agent"],

          browser: browserName,
          browser_version: browserVersion,
          os: os,
          device_type: deviceType,
      provider: payload.provider,   // ✅ add this line
    });

    // 🔹 Audit log
    await LoginAuditLog.create({
      username: payload.userId,
      service_id: service.id,
      token_id: loginToken.id,
      action: "LOGIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    // 1 day in milliseconds
const ONE_DAY = 24 * 60 * 60 * 1000;

const cookieOptions = {
  path: "/",
  httpOnly: true,
  secure: false,           // prod me HTTPS ho to true
  sameSite: "lax",
  domain: COOKIE_DOMAIN,  
  maxAge: ONE_DAY          // ✅ 1 day
};

    // 🔹 Set cookies
    res.cookie("sso_token", token, cookieOptions);                 // raw JWT
    res.cookie("auth_token", encryptedTokenAuth, cookieOptions);  // centrally encrypted JWT

    /* ================= SESSION ================= */
    req.session.token = token;
    req.session.authenticated = true;
    req.session.userId = payload.userId;
    req.session.googleOnly = true;
    req.session.ldapUser = true;

    await saveSession(req); // 🔥 FIXED HERE
  

    // 🔹 Redirect to PHP landing page with service-encrypted token
    const phpLandingUrl = `${redirectBase}?token=${encodeURIComponent(
      encryptedToken
    )}`;

    console.log("🔹 Redirecting:", phpLandingUrl);
    return res.redirect(phpLandingUrl);

  } catch (err) {
    console.error("❌ completeLoginAndRedirect error:", err);
    return res.redirect(`${FRONTEND_URL}/auth/failure`);
  }
}

/**
 * 📱 QR / LDAP-based login — returns JSON (no redirect)
 */
async function completeQrLogin(req, res, userObj, serviceKey = "portalA") {
  try {
    const service = await Service.findOne({ where: { service_key: serviceKey, is_active: true } });
    const redirectBase = service?.service_url || FRONTEND_URL;

    const payload = {
      userId: userObj.user_id || userObj.username || userObj.email || "unknown",
      provider: "QR",
      name: userObj.name || userObj.username || null,
      iss: BACKEND_URL,
      aud: FRONTEND_URL,
      jti: crypto.randomUUID(),
      service_id: service?.id || null,
    };

    const token = jwt.sign(payload, JWT_SECRET, { algorithm: "HS512", expiresIn: JWT_EXPIRES_IN });
    const encryptedToken = encryptToken(token);

    // Save login token and audit log
    const loginToken = await LoginToken.create({
      username: payload.userId,
      service_id: service?.id || null,
      access_token: encryptedToken,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    await LoginAuditLog.create({
      username: payload.userId,
      service_id: service?.id || null,
      token_id: loginToken.id,
      action: "QR_LOGIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    const redirectUrl = `${redirectBase}/auth/callback?token=${encodeURIComponent(encryptedToken)}`;

    // ✅ Instead of redirect, return JSON
    return {
      loggedIn: true,
      token: encryptedToken,
      redirectUrl,
    };
  } catch (err) {
    console.error("QR Login Error:", err);
    return {
      loggedIn: false,
      error: "QR login failed",
    };
  }
}

// 🔹 MAIN endpoint: validate cookie-based SSO
async function validateSso(req, res) {
  try {
    const { iv, key, payload } = req.body;
    
        if (!iv || !key || !payload) {
          return res.status(400).json({ error: "Invalid or tampered request." });
        }
    
        // 🔑 1. RSA decrypt AES key
        const aesKey = rsaDecryptKey(key);
    
        // 🔓 2. AES decrypt payload
        const decryptedStr = aesDecrypt(payload, aesKey, iv);
        if (!decryptedStr) {
          return res.status(400).json({ error: "Invalid or tampered request." });
        }
    
        const { service_key } = JSON.parse(decryptedStr);

    let serviceKey1 = service_key;
    if (!serviceKey1) {     
      serviceKey1 = "portalA";
    console.log("🔐 validateSso called for:", req.body.service_key);

    console.log("🔐 validateSso called for:", req.cookies.sso_token);
    }
    // 1️⃣ Cookie से token पढ़ना
    const encryptedToken = req.cookies.auth_token;

    // 🔹 Fetch service by key
    const service = await Service.findOne({ where: { service_key: serviceKey1 } });
    if (!service) throw new AppError("Service Key is not configured. Please contact the administrator.", 404);

    if (!encryptedToken) {
      return res.json({ valid: false, error: "No SSO cookie found" });
    }

    // 2️⃣ Token decrypt करना
    let jwtToken;
    try {
      jwtToken = decryptToken(encryptedToken,ENCRYPTION_SECRET);
    } catch (err) {
      return res.json({ valid: false, error: "Invalid encrypted token" });
    }

    // 3️⃣ JWT verify करना
    console.log("jwtToken  ",jwtToken);
    const unsafeDecoded = jwt.decode(jwtToken);
   // console.log("unsafeDecoded  ",unsafeDecoded);
    let decoded;
    try {
      decoded = jwt.verify(jwtToken, JWT_SECRET, {
        algorithms: ["HS512"],
        issuer: BACKEND_URL,
        audience: unsafeDecoded.aud,
      });
    } catch (err) {
      return res.json({ valid: false, error: "JWT expired or invalid" });
    }

    // 4️⃣ Database active token check
    const dbToken = await LoginToken.findOne({
      where: {
        access_token: decoded.jti,   // JWT unique ID
        username: decoded.userId,
        status: "ACTIVE"             // 🔥 important
      }
    });

    if (!dbToken) {
      return res.json({ valid: false, error: "Token inactive or revoked" });
    }

    // 5️⃣ Fetch service URL
    const service1 = await Service.findOne({
      where: { service_key: serviceKey1, is_active: true }
    });

    if (!service) {
      return res.json({ valid: false, error: "Service not found" });
    }

    // 6️⃣ Final return
    return res.json({
      valid: true,
      service_url: service.service_url,
      token: encryptedToken,
      user: {
        id: decoded.userId,
        name: decoded.name,
        email: decoded.email,
        service_key: serviceKey1
      }
    });

  } catch (err) {
    console.error("🔥 validateSso error:", err);
    return res.status(500).json({ valid: false, error: "Server error" });
  }
}

// 🔹 GET /auth/me
async function getMe(req, res) {
  if (!req.session || !req.session.googleOnly) {
    return res.status(401).json({ google: false });
  }

  return res.json({
    google: true,
    ldapUser: req.session.ldapUser === true,
    user: {
      userId: req.session.userId || null
    }
  });
};



module.exports = {
  completeLoginAndRedirect,
  completeQrLogin,
  validateSso,
  getMe
};
