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
  return 15 * 60 * 1000; // fallback
}

// ----------------------------------------------------------------------
// 1) /auth/verifyOtp
// ----------------------------------------------------------------------
exports.verifyOtp = async (req, res) => {
  try {
    let { mobile, otp, service_id, device_id } = req.body;

    if (!mobile || !otp || !service_id) {
      return res.status(400).json({ error: "Mobile number, OTP, and service_id are required" });
    }

    if (req.isEncrypted) {
      console.log(`🔐 OTP Payload encrypted:`, req.body.data);
      console.log(`API secret:`, process.env.ENCRYPTION_SECRET, process.env.ENCRYPTION_SECRET.length);

      const decryptedBodyStr = aesDecrypt(req.body.data, process.env.ENCRYPTION_SECRET);
      if (!decryptedBodyStr) {
        return res.status(400).json({ error: "Invalid encrypted payload" });
      }
      const decryptedBody = JSON.parse(decryptedBodyStr);
      mobile = decryptedBody.mobile;
      otp = decryptedBody.otp;
      service_id = decryptedBody.service_id;
      device_id = decryptedBody.device_id;
    }

    // 1️⃣ Block Check (15 mins)
    const blockDurationMs = 15 * 60 * 1000;
    const fifteenMinsAgo = new Date(Date.now() - blockDurationMs);

    const isBlocked = await SmsOtpLog.count({
      where: {
        mobile_number: mobile,
        service_id,
        status: "blocked",
        updated_at: { [Op.gt]: fifteenMinsAgo },
      },
    });

    if (isBlocked > 0) {
      return res.status(403).json({ error: "Too many failed attempts. Try again in 15 minutes." });
    }

    // 2️⃣ Find the latest valid OTP
    const otpEntry = await SmsOtpLog.findOne({
      where: {
        mobile_number: mobile,
        service_id,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpEntry) {
      return res.status(400).json({ error: "OTP expired or not requested" });
    }
    if (otpEntry.is_used) {
      return res.status(400).json({ error: "OTP already used" });
    }
    if (otpEntry.status === "blocked") {
      return res.status(403).json({ error: "OTP blocked due to too many attempts" });
    }

    const failedAttempts = req.session.otpFailedAttempts || 0;
    console.log("OTP Failed Attempts:", req.session);

    // 3️⃣ Verify OTP
    if (otpEntry.otp_code !== otp) {
      req.session.otpFailedAttempts = failedAttempts + 1;

      if (req.session.otpFailedAttempts >= 3) {
        await otpEntry.update({ status: "blocked", updated_at: new Date() });
        req.session.otpFailedAttempts = 0;
        req.session.otpCaptchaRequired = true; // Ask for Captcha next time
        return res.status(403).json({ error: "Too many failed attempts. Try again in 15 minutes." });
      }

      const remaining = 3 - req.session.otpFailedAttempts;
      return res.status(400).json({ error: `Invalid OTP. ${remaining} attempts left.` });
    }

    // ✅ OTP is Correct -> Reset Failed Attempts
    req.session.otpFailedAttempts = 0;
    req.session.otpCaptchaRequired = false;
    await otpEntry.update({ is_used: true, status: "verified", used_at: new Date() });

    // 4️⃣ LDAP Details Check
    const ldapSettings = await ServiceLdapSetting.findOne({ where: { service_id } });
    if (!ldapSettings) {
      return res.status(404).json({ error: "LDAP settings not found for this service" });
    }

    const service = await Service.findOne({ where: { id: service_id, is_active: true } });
    if (!service) {
      return res.status(404).json({ error: "Service not found or inactive" });
    }

    const ldapResult = await checkUserExists(mobile, ldapSettings);
    if (!ldapResult.userExists) {
      return res.status(404).json({ error: "User not found in LDAP" });
    }
    console.log("rolelllllllllllll   " , ldapResult)
    // 5️⃣ Generate Tokens
    const tokenPayload = {
      userId: ldapResult.userName || ldapResult.uid,
      service_id: service.id,
      name: ldapResult.fullName || ldapResult.cn,
      title: ldapResult.title,
      email: ldapResult.email || ldapResult.mail,
      mobile: ldapResult.mobileNumber || ldapResult.mobile,
      description: ldapResult.description,
      provider: "OTP",
      authType: "Yukti",
      role: ldapResult.role || ldapResult.businessCategory || 'SUPER_ADMIN' // Fallback for admin system
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    const decodedToken = jwt.decode(token); // To grab standard fields (iat, exp)

    console.log("Token Payload:", decodedToken);

    // 🚨 NEW: Parse User Agent for the Audit Log
    const userAgentStr = req.headers["user-agent"] || "";
    const parser = new UAParser(userAgentStr);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    const device = parser.getDevice();

    const secretKey = service.secret_key || ENCRYPTION_SECRET;
    const encryptedToken = encryptToken(token, secretKey);
    const encryptedTokenAuth = encryptToken(token, process.env.ENCRYPTION_SECRET);

    // ✅ Create login token entry with all required tracking columns
    const loginToken = await LoginToken.create({
      username: otpEntry.user_id,
      service_id,
      access_token: decodedToken.jti, // Use the generated JTI
      ip_address: getClientIp(req),
      user_agent: userAgentStr,
      provider: "OTP",
      browser: browser.name || "Unknown",
      browser_version: browser.version || "Unknown",
      os: os.name || "Unknown",
      device_type: device.type || "desktop",
    });

    // ✅ Create audit log entry
    await LoginAuditLog.create({
      username: otpEntry.user_id,
      service_id,
      token_id: loginToken.id,
      action: "LOGIN",
      ip_address: getClientIp(req),
      user_agent: userAgentStr,
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

    // 🔹 Session (Optional, keeping your commented code)
    // req.session.authenticated = true;
    // req.session.user = { userId: ldapResult.userName, mobile };

    return res.status(200).json({
      message: "Login successful",
      token: encryptedToken,
      user: {
        userId: ldapResult.userName,
        mobile: ldapResult.mobileNumber,
        name: ldapResult.fullName,
      },
      service_url: service.service_url, // Return to frontend
    });

  } catch (error) {
    console.error("🔥 verifyOtp error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
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


