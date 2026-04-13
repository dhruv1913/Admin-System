const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ServiceLdapSetting, LoginToken, LoginAuditLog, Service } = require("../models");
const SmsOtpLog = require("../models/smsOtpLog");
const { checkUserExists } = require("../services/ldapService");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC
const UAParser = require("ua-parser-js");

const { JWT_SECRET, FRONTEND_URL, BACKEND_URL, JWT_EXPIRES_IN, COOKIE_DOMAIN, NODE_ENV } = process.env;
// 🔹 helper: parse human-friendly expiry (e.g. "15m", "1h", "3600") to milliseconds
function parseExpiryToMs(exp) {
  if (!exp) return 15 * 60 * 1000; // default 15 minutes
  const s = String(exp).trim().toLowerCase();
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000; // numeric seconds
  const num = parseInt(s, 10);
  if (s.endsWith("ms")) return num;
  if (s.endsWith("s")) return num * 1000;
  if (s.endsWith("m")) return num * 60 * 1000;
  if (s.endsWith("h")) return num * 60 * 60 * 1000;
  if (s.endsWith("d")) return num * 24 * 60 * 60 * 1000;
  return 15 * 60 * 1000;
}
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
};
const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};


const USER_LOCK_WINDOW_MIN = 15;
const USER_LOCK_MAX_BLOCKS = 2;
const OTP_MAX_ATTEMPTS = 3;

/* ===============================
   VERIFY OTP
================================ */

exports.verifyOtp = async (req, res) => {
  try {
    /* ===============================
       SESSION INIT
    ============================== */
    if (typeof req.session.otpFailedAttempts !== "number") {
      req.session.otpFailedAttempts = 0;
    }
    if (typeof req.session.otpCaptchaRequired !== "boolean") {
      req.session.otpCaptchaRequired = false;
    }

    /* ===============================
       DECRYPT REQUEST
    ============================== */
    const { iv, key, payload } = req.body;
    if (!iv || !key || !payload) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const aesKey = rsaDecryptKey(key);
    const decryptedStr = aesDecrypt(payload, aesKey, iv);
    if (!decryptedStr) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }

    const { mobile_number, service_id, otp_code, captcha } =
      JSON.parse(decryptedStr);

    if (!mobile_number || !service_id || !otp_code) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    /* ===============================
       CAPTCHA CHECK
    ============================== */

    console.log("OTP Failed Attempts:", req.session);
    console.log("OTP Captcha Required:", req.session.otpCaptchaRequired);
    if (req.session.otpCaptchaRequired) {
      if (!captcha) {
        return res.status(400).json({
          success: false,
          code: "CAPTCHA_REQUIRED",
          message: "Captcha is required 123",
          showCaptcha: true,
        });
      }
console.log("User Captcha:", captcha);
console.log("Session Captcha:", req.session.captcha);
      if (
        !req.session.captcha ||
        captcha.toLowerCase() !== req.session.captcha.toLowerCase()
      ) {
        req.session.captcha = null;
        return res.status(400).json({
          success: false,
          code: "CAPTCHA_INVALID",
          message: "Invalid captcha",
          showCaptcha: true,
        });
      }

      req.session.captcha = null;
    }

    /* ===============================
       USER LOCK CHECK (15 MIN)
    ============================== */
    const lockSince = new Date(
      Date.now() - USER_LOCK_WINDOW_MIN * 60 * 1000
    );

    const blockedCount = await SmsOtpLog.count({
      where: {
        mobile_number,
        service_id,
        status: "blocked",
        updated_at: { [Op.gt]: lockSince },
      },
    });

    if (blockedCount >= USER_LOCK_MAX_BLOCKS) {
      req.session.otpCaptchaRequired = true;
      return res.status(423).json({
        success: false,
        code: "USER_LOCKED",
        message:
          "Too many failed OTP attempts. Account locked for 15 minutes.",
        showCaptcha: true,
      });
    }

    /* ===============================
       FETCH LATEST OTP (IMPORTANT FIX)
    ============================== */
    const otpEntry = await SmsOtpLog.findOne({
      where: {
        mobile_number,
        service_id,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpEntry) {
      req.session.otpCaptchaRequired = true;
      return res.status(404).json({
        success: false,
        code: "OTP_EXPIRED",
        message: "OTP expired or not found. Please request a new OTP.",
        showCaptcha: true,
      });
    }

    /* ===============================
       BLOCKED OTP CHECK
    ============================== */
    if (otpEntry.status === "blocked") {
      return res.status(403).json({
        success: false,
        code: "OTP_BLOCKED",
        message:
          "OTP blocked after multiple invalid attempts. Please request a new OTP.",
        showCaptcha: true,
      });
    }

    /* ===============================
       OTP VALIDATION
    ============================== */
    const hashedInput = hashOtp(otp_code);

    if (otpEntry.otp_code !== hashedInput) {
      otpEntry.attempt_count += 1;
      req.session.otpFailedAttempts += 1;
      req.session.otpCaptchaRequired = true;

      console.log("OTP otpCaptchaRequired:", req.session.otpCaptchaRequired);
      console.log("OTP Captcha Required After Increment:", req.session.otpFailedAttempts);

      if (otpEntry.attempt_count >= OTP_MAX_ATTEMPTS) {
        otpEntry.status = "blocked"; // ✅ DO NOT set is_used here
      }

      await otpEntry.save();

      return res.status(400).json({
        success: false,
        code:
          otpEntry.status === "blocked"
            ? "OTP_BLOCKED"
            : "OTP_INVALID",
        message:
          otpEntry.status === "blocked"
            ? "OTP blocked after 3 invalid attempts. Please request a new OTP."
            : "Invalid OTP",
        attempt_count: otpEntry.attempt_count,
        remaining_attempts: Math.max(
          0,
          OTP_MAX_ATTEMPTS - otpEntry.attempt_count
        ),
        showCaptcha: true,
      });
    }

    /* ===============================
       SUCCESS → RESET SECURITY
    ============================== */
    req.session.otpFailedAttempts = 0;
    req.session.otpCaptchaRequired = false;
    req.session.captcha = null;

    otpEntry.is_used = true;
    otpEntry.status = "verified";
    otpEntry.used_at = new Date();
    await otpEntry.save();

    /* ===============================
       LDAP + SERVICE
    ============================== */
    const settings = await ServiceLdapSetting.findOne({
      where: { service_id },
    });

    const service = await Service.findOne({
      where: { id: service_id, is_active: true },
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }
   const redirectBase1 = service.service_url || FRONTEND_URL;
    const ldapResult = await checkUserExists(otpEntry.mobile_number,settings);

    console.log('rolelllllllllllll  ',ldapResult);

    // 🔹 JWT payload
        const tokenPayload = {
          userId: otpEntry.user_id,
          service_id,
          name: ldapResult.fullName,
          title: ldapResult.title,
          email: ldapResult.email || null,
          mobile: otpEntry.mobile_number,
          description: ldapResult.description,
          provider: "OTP",
          authType: "Yukti",
          iat: Math.floor(Date.now() / 1000),
          jti: crypto.randomUUID(),
          iss: BACKEND_URL,
          aud: redirectBase1,
          role:ldapResult.businessCategory, 
        };
        console.log("Token Payload:", tokenPayload);
        const token = jwt.sign(tokenPayload, JWT_SECRET, {
          algorithm: "HS512",
          expiresIn: JWT_EXPIRES_IN,
        });
    
        const secretKey = service.secret_key || process.env.ENCRYPTION_SECRET;
        const encryptedToken = encryptToken(token, secretKey);
        const encryptedTokenAuth = encryptToken(token, process.env.ENCRYPTION_SECRET);


                // 🔹 Get real client IP
                const clientIp = getClientIp(req);
        
                // 🔹 Parse User Agent
                const parser = new UAParser(req.headers["user-agent"]);
                const result = parser.getResult();
        
                const browserName = result.browser.name || null;
                const browserVersion = result.browser.version || null;
                const os = result.os.name || null;
                const deviceType = result.device.type || "desktop";


    
        // ✅ Create login token entry
        const loginToken = await LoginToken.create({
          username: otpEntry.user_id,
          service_id,
          access_token: tokenPayload.jti,
          ip_address: clientIp,
          user_agent: req.headers["user-agent"],

          browser: browserName,
          browser_version: browserVersion,
          os: os,
          device_type: deviceType,
          provider: tokenPayload.provider,   // ✅ add this line
        });
    
        // ✅ Create audit log entry
        await LoginAuditLog.create({
          username: otpEntry.user_id,
          service_id,
          token_id: loginToken.id,
          action: "LOGIN",
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        });
    
        // 🔹 Cookies
        const ONE_DAY = 24 * 60 * 60 * 1000;
        const cookieOptions = {
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          domain: COOKIE_DOMAIN,
          maxAge: ONE_DAY,
        };
    
        res.cookie("sso_token", token, cookieOptions);
        res.cookie("auth_token", encryptedTokenAuth, cookieOptions);
    
        // 🔹 Session
        // req.session.authenticated = true;
        // req.session.user = JSON.stringify(tokenPayload);
        // req.session.token = token;
    
    
    
    
        // ✅ Final response
        res.json({
          success: true,
          redirectUrl: `${redirectBase1}?token=${encodeURIComponent(encryptedToken)}`,
        });
  } catch (err) {
    console.error("🔥 verifyOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
















exports.verifyOtp_old = async (req, res) => {
  try {
    /* ===============================
       SESSION INIT
    ============================== */
    if (typeof req.session.otpFailedAttempts !== "number") {
      req.session.otpFailedAttempts = 0;
    }

    if (!req.session.otpCaptchaRequired) {
      req.session.otpCaptchaRequired = false;
    }

    /* ===============================
       DECRYPT REQUEST
    ============================== */
    const { iv, key, payload } = req.body;

    if (!iv || !key || !payload) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const aesKey = rsaDecryptKey(key);
    const decryptedStr = aesDecrypt(payload, aesKey, iv);

    if (!decryptedStr) {
      return res.status(400).json({ error: "Invalid encrypted payload" });
    }

    const {
      mobile_number,
      service_id,
      otp_code,
      captcha,
    } = JSON.parse(decryptedStr);

    if (!mobile_number || !service_id || !otp_code) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    /* ===============================
       CAPTCHA VALIDATION (IF REQUIRED)
    ============================== */
    if (req.session.otpCaptchaRequired) {
      if (!captcha) {
        return res.status(400).json({
          success: false,
          code: "CAPTCHA_REQUIRED",
          message: "Captcha is required",
          showCaptcha: true,
        });
      }

      if (
        !req.session.captcha ||
        captcha.toLowerCase() !== req.session.captcha.toLowerCase()
      ) {
        req.session.captcha = null;

        return res.status(400).json({
          success: false,
          code: "CAPTCHA_INVALID",
          message: "Invalid captcha",
          showCaptcha: true,
        });
      }

      // ✅ captcha ok → clear
      req.session.captcha = null;
    }

    /* ===============================
       FETCH OTP
    ============================== */
    const otpEntry = await SmsOtpLog.findOne({
      where: {
        mobile_number,
        service_id,
        is_used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpEntry) {
      return res.status(404).json({
        success: false,
        message: "OTP expired or not found",
      });
    }

    const hashedInput = hashOtp(otp_code);

    /* ===============================
       OTP INVALID
    ============================== */
    if (otpEntry.otp_code !== hashedInput) {
      otpEntry.attempt_count += 1;
      req.session.otpFailedAttempts += 1;

      // 🔥 Enable captcha after first fail
      if (req.session.otpFailedAttempts >= 1) {
        req.session.otpCaptchaRequired = true;
      }

      if (otpEntry.attempt_count >= 3) {
        otpEntry.is_used = true;
        otpEntry.status = "blocked";
      }

      await otpEntry.save();

      return res.status(400).json({
        success: false,
        code: "OTP_INVALID",
        message: "Invalid OTP",
        attempt_count: otpEntry.attempt_count,
        showCaptcha: req.session.otpCaptchaRequired,
      });
    }

    /* ===============================
       OTP VERIFIED → RESET CAPTCHA
    ============================== */
    req.session.otpFailedAttempts = 0;
    req.session.otpCaptchaRequired = false;
    req.session.captcha = null;

    otpEntry.is_used = true;
    otpEntry.used_at = new Date();
    otpEntry.status = "verified";
    await otpEntry.save();

    /* ===============================
       LDAP + SERVICE
    ============================== */
    const settings = await ServiceLdapSetting.findOne({
      where: { service_id },
    });

    const service = await Service.findOne({
      where: { id: service_id, is_active: true },
    });

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const ldapResult = await checkUserExists(
      otpEntry.user_id,
      settings,
      true
    );

    const redirectBase = service.service_url || FRONTEND_URL;

    /* ===============================
       JWT GENERATION
    ============================== */
    const tokenPayload = {
      userId: otpEntry.user_id,
      service_id,
      name: ldapResult.fullName,
      email: ldapResult.email || null,
      mobile: otpEntry.mobile_number,
      provider: "OTP",
      authType: "Yukti",
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
      iss: BACKEND_URL,
      aud: redirectBase,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    const encryptedToken = encryptToken(
      token,
      service.secret_key
    );

    /* ===============================
       LOGIN AUDIT
    ============================== */
    const loginToken = await LoginToken.create({
      username: otpEntry.user_id,
      service_id,
      access_token: tokenPayload.jti,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    await LoginAuditLog.create({
      username: otpEntry.user_id,
      service_id,
      token_id: loginToken.id,
      action: "LOGIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    /* ===============================
       COOKIES
    ============================== */
    res.cookie("sso_token", token, {
      httpOnly: true,
      sameSite: "lax",
      domain: COOKIE_DOMAIN,
      maxAge: 24 * 60 * 60 * 1000,
    });

    /* ===============================
       FINAL RESPONSE
    ============================== */
    return res.json({
      success: true,
      redirectUrl: `${redirectBase}?token=${encodeURIComponent(
        encryptedToken
      )}`,
    });
  } catch (err) {
    console.error("🔥 verifyOtp error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.verifyOtpold = async (req, res) => {
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

    const { mobile_number, service_id, otp_code } = JSON.parse(decryptedStr);

    if (!mobile_number || !service_id || !otp_code) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // 🔹 Find OTP
    const otpEntry = await SmsOtpLog.findOne({
      where: {
        mobile_number,
        service_id,
        is_used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpEntry) {
      return res.status(404).json({
        error: "The OTP you entered is expired or invalid. Please request a new one.",
      });
    }

    const hashedInput = hashOtp(otp_code);

    if (otpEntry.otp_code !== hashedInput) {
      otpEntry.attempt_count += 1;

      if (otpEntry.attempt_count >= 5) {
        otpEntry.is_used = true;
        otpEntry.status = "blocked";
      }

      await otpEntry.save();

      return res.status(400).json({
        success: false,
        message: "The OTP you entered is invalid. Please try again.",
        attempt_count: otpEntry.attempt_count,
      });
    }

    // ✅ OTP verified
    otpEntry.is_used = true;
    otpEntry.used_at = new Date();
    otpEntry.status = "verified";
    await otpEntry.save();

    // 🔹 Service + LDAP
    const settings = await ServiceLdapSetting.findOne({ where: { service_id } });
    const service = await Service.findOne({ where: { id: service_id, is_active: true } });
    if (!service) return res.status(404).json({ error: "Service not found." });

    const redirectBase1 = service.service_url || FRONTEND_URL;
    const ldapResult = await checkUserExists(otpEntry.user_id, settings, true);

    // 🔹 JWT payload
    const tokenPayload = {
      userId: otpEntry.user_id,
      service_id,
      name: ldapResult.fullName,
      title: ldapResult.title,
      email: ldapResult.email || null,
      mobile: otpEntry.mobile_number,
      description: ldapResult.description,
      provider: "OTP",
      authType: "Yukti",
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
      iss: BACKEND_URL,
      aud: redirectBase1,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    const secretKey = service.secret_key || process.env.ENCRYPTION_SECRET;
    const encryptedToken = encryptToken(token, secretKey);
    const encryptedTokenAuth = encryptToken(token, process.env.ENCRYPTION_SECRET);

    // ✅ Create login token entry
    const loginToken = await LoginToken.create({
      username: otpEntry.user_id,
      service_id,
      access_token: tokenPayload.jti,
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    // ✅ Create audit log entry
    await LoginAuditLog.create({
      username: otpEntry.user_id,
      service_id,
      token_id: loginToken.id,
      action: "LOGIN",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"],
    });

    // 🔹 Cookies
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      domain: COOKIE_DOMAIN,
      maxAge: ONE_DAY,
    };

    res.cookie("sso_token", token, cookieOptions);
    res.cookie("auth_token", encryptedTokenAuth, cookieOptions);

    // 🔹 Session
    // req.session.authenticated = true;
    // req.session.user = JSON.stringify(tokenPayload);
    // req.session.token = token;




    // ✅ Final response
    res.json({
      success: true,
      redirectUrl: `${redirectBase1}?token=${encodeURIComponent(encryptedToken)}`,
    });

  } catch (err) {
    console.error("🔥 /verifyOtp error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


