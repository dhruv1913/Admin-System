const { SmsOtpLog, ServiceLdapSetting, Service } = require("../models");
const { checkUserExists } = require("../services/ldapService");
const crypto = require("crypto");
const AppError = require("../utils/appError");
const { sendOtpSms } = require("../services/smsService");
const { title } = require("process");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC
const { generateCaptcha } = require("../utils/captcha.util");


const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};

const maskMobile = (mobile = "") => {
  if (mobile.length < 10) return mobile;
  return mobile.replace(/^(\d{2})\d+(\d{2})$/, "$1******$2");
};

const getPhotoBase64 = (entry) => {
  const photoAttr = entry.attributes.find(a => a.type === "jpegPhoto");
  if (!photoAttr || !photoAttr.vals || !photoAttr.vals.length) {
    return null; // ✅ SAFE
  }
  return Buffer.from(photoAttr.vals[0]).toString("base64");
};


const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;

const validateUsernameFormat = (username) => {
  if (EMAIL_REGEX.test(username)) return { valid: true, type: "email" };
  if (MOBILE_REGEX.test(username)) return { valid: true, type: "mobile" };
  return { valid: false };
};


/**
 * @desc Check if user exists in LDAP and generate OTP
 * @route POST /ldap/checkUser
 * @body { username, service_key }
 */

exports.checkUser = async (req, res, next) => {
  try {
    /* ==============================
       1️⃣ SESSION INIT
    ============================== */
    if (typeof req.session.failedAttempts !== "number") {
      req.session.failedAttempts = 0;
    }

    /* ==============================
       2️⃣ CAPTCHA EXPIRY RESET (5 min)
    ============================== */
    if (
      req.session.captchaAt &&
      Date.now() - req.session.captchaAt > 5 * 60 * 1000
    ) {
      req.session.failedAttempts = 0;
      req.session.showCaptcha = false;
      req.session.captcha = null;
      req.session.captchaAt = null;
    }

    /* ==============================
       3️⃣ MAX ATTEMPTS LOCK
    ============================== */
    if (req.session.failedAttempts >= 5) {
      throw new AppError(
        "Too many failed attempts. Try again after some time.",
        429
      );
    }

    /* ==============================
       4️⃣ DECRYPT PAYLOAD
    ============================== */
    const { payload, key, iv } = req.body;

    if (!payload || !key || !iv) {
      throw new AppError("Invalid or tampered request", 400);
    }

    const aesKey = rsaDecryptKey(key);
    const decryptedStr = aesDecrypt(payload, aesKey, iv);

    if (!decryptedStr) {
      throw new AppError("Invalid payload", 400);
    }

    const {
      username,
      captcha,
      service_key = "portalA",
      ts,
    } = JSON.parse(decryptedStr);

    /* ==============================
       5️⃣ TIMESTAMP CHECK
    ============================== */
    if (ts && Date.now() - ts > 2 * 60 * 1000) {
      throw new AppError("Request expired", 400);
    }

    if (!username) {
      throw new AppError("username is required", 400);
    }

    /* ==============================
       6️⃣ CAPTCHA VALIDATION
    ============================== */
    console.log("🔍 Captcha Check (checkUser) - showCaptcha:", req.session.showCaptcha === true, "captcha input:", captcha, "captcha stored:", req.session.captcha);
    
    if (req.session.showCaptcha === true) {
      console.log("✓ Captcha validation triggered in checkUser");
      if (!captcha) {
        // 🔥 Save session before response
        await new Promise((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        return res.status(400).json({
          message: "Captcha is required",
          showCaptcha: true,
        });
      }

      console.log("Comparing:", captcha.toLowerCase(), "vs", req.session.captcha?.toLowerCase());

      if (
        !req.session.captcha ||
        captcha.toLowerCase() !== req.session.captcha.toLowerCase()
      ) {
        console.log("❌ Invalid captcha in checkUser - Generating new one");
        req.session.failedAttempts += 1;
        
        // 🔄 Auto-generate new captcha for refresh
        const newCaptcha = generateCaptcha();
        req.session.captcha = newCaptcha.text;
        req.session.captchaAt = Date.now();
        console.log("🎨 New captcha generated:", newCaptcha.text);
        
        // 🔥 Save session to Redis before response
        await new Promise((resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              console.error("❌ Save error:", err);
              reject(err);
            } else {
              console.log("✅ New captcha saved to Redis");
              resolve();
            }
          });
        });
        
        const captchaStr = typeof newCaptcha.data === 'string' ? newCaptcha.data : newCaptcha.data.toString();
        
        return res.status(400).json({
          success: false,
          message: "Invalid captcha",
          showCaptcha: true,
          data: {
            captcha: captchaStr, // 🎨 New captcha SVG to display
            newCaptchaGenerated: true,
          }
        });
      }

      // ✅ Captcha correct - clear it
      console.log("✓ Captcha is correct in checkUser");
      req.session.captcha = null;
      req.session.captchaAt = null;
      req.session.showCaptcha = false;
      
      // 🔥 Save session to Redis (captcha cleared)
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } else {
      console.log("⚠️ Captcha check skipped in checkUser - showCaptcha is:", req.session.showCaptcha);
    }

    /* ==============================
       7️⃣ USERNAME FORMAT CHECK
    ============================== */
    const usernameCheck = validateUsernameFormat(username);
    if (!usernameCheck.valid) {
      req.session.failedAttempts += 1;
      req.session.showCaptcha = true;
      req.session.captchaAt = Date.now();

      // 🔥 Save session to Redis before response
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(400).json({
        message:
          "Invalid username format. Use valid email or 10-digit mobile number.",
        showCaptcha: true,
      });
    }

    /* ==============================
       8️⃣ SERVICE + LDAP
    ============================== */
    const service = await Service.findOne({
      where: { service_key },
    });
    if (!service) throw new AppError("Service not configured", 404);

    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: service.id },
    });
    if (!settings) throw new AppError("Service not configured", 404);

    const ldapResult = await checkUserExists(username, settings);

    console.log("LDAP Result:", ldapResult);

    /* ==============================
       9️⃣ USER NOT FOUND
    ============================== */
    if (!ldapResult.userExists) {
      req.session.failedAttempts += 1;
      req.session.showCaptcha = true;
      req.session.captchaAt = Date.now();

      // 🔥 Save session to Redis before response
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(200).json({
        message: "User not found",
        showCaptcha: true,
        data: {
          userExists: false,
          service_id: service.id,
        },
      });
    }

    /* ==============================
       🔟 USER FOUND → OTP FLOW
    ============================== */
    const normalizeMobile = (m) =>
      String(m || "").replace(/\D/g, "").slice(-10);

    const TEST_MOBILE = "6234567890";
    const isTestUser =
      normalizeMobile(ldapResult.mobileNumber) === TEST_MOBILE;

    let otpCode;
    if (isTestUser) {
      otpCode = "123456";
      console.log("🧪 Test user → SMS skipped");
    } else {
      otpCode = crypto.randomInt(100000, 999999).toString();
    }

    // 🔥 Expire old OTPs
    await SmsOtpLog.update(
      { status: "expired" },
      {
        where: {
          user_id: ldapResult.userName,
          service_id: service.id,
          status: "pending",
        },
      }
    );

    const hashedOtp = hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await SmsOtpLog.create({
      user_id: ldapResult.userName,
      service_id: service.id,
      mobile_number: ldapResult.mobileNumber,
      otp_code: hashedOtp,
      status: "pending",
      expires_at: expiresAt,
    });

    // 📩 SMS ONLY FOR REAL USERS
    if (!isTestUser) {
      try {
        await sendOtpSms({
          mobile: ldapResult.mobileNumber,
          otp: otpCode,
        });
      } catch (smsErr) {
        console.error("⚠️ SMS failed:", smsErr.message);
      }
    }

    /* ==============================
       ✅ RESET SESSION ON SUCCESS
    ============================== */
    req.session.failedAttempts = 0;
    req.session.showCaptcha = false;
    req.session.captcha = null;
    req.session.captchaAt = null;

    // 🔥 Save session to Redis before response
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const pictureUrl = ldapResult.picture
      ? `data:image/jpeg;base64,${ldapResult.picture}`
      : null;

    return res.json({
      message: "User found and OTP sent",
      data: {
        service_id: service.id,
        userExists: true,
        mobileNumber: ldapResult.mobileNumber,
        userName: ldapResult.userName,
        firstName: ldapResult.firstName,
        lastName: ldapResult.lastName,
        fullName: ldapResult.fullName,
        email: ldapResult.email,
        title: ldapResult.title,
        picture: pictureUrl,
        expires_at: expiresAt,
      },
    });
  } catch (err) {
    next(err);
  }
};


exports.checkUserApp = async (req, res, next) => {
  try {

    /* ==============================
       1️⃣ SESSION INIT
    ============================== */
    if (typeof req.session.failedAttempts !== "number") {
      req.session.failedAttempts = 0;
    }

    /* ==============================
       2️⃣ MAX ATTEMPTS LOCK
    ============================== */
    if (req.session.failedAttempts >= 5) {
      throw new AppError(
        "Too many failed attempts. Try again after some time.",
        429
      );
    }

    /* ==============================
       3️⃣ DECRYPT PAYLOAD
    ============================== */
    const { payload, key, iv } = req.body;

    if (!payload || !key || !iv) {
      throw new AppError("Invalid or tampered request", 400);
    }

    const aesKey = rsaDecryptKey(key);
    const decryptedStr = aesDecrypt(payload, aesKey, iv);

    if (!decryptedStr) {
      throw new AppError("Invalid payload", 400);
    }

    const {
      username,
      service_key = "portalA",
      ts,
    } = JSON.parse(decryptedStr);

    /* ==============================
       4️⃣ TIMESTAMP CHECK
    ============================== */
    if (ts && Date.now() - ts > 2 * 60 * 1000) {
      throw new AppError("Request expired", 400);
    }

    if (!username) {
      throw new AppError("username is required", 400);
    }

    /* ==============================
       5️⃣ USERNAME FORMAT CHECK
    ============================== */
    const usernameCheck = validateUsernameFormat(username);

    if (!usernameCheck.valid) {
      req.session.failedAttempts += 1;

      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(400).json({
        message:
          "Invalid username format. Use valid email or 10-digit mobile number."
      });
    }

    /* ==============================
       6️⃣ SERVICE + LDAP
    ============================== */
    const service = await Service.findOne({
      where: { service_key },
    });

    if (!service) throw new AppError("Service not configured", 404);

    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: service.id },
    });

    if (!settings) throw new AppError("Service not configured", 404);

    const ldapResult = await checkUserExists(username, settings);

    console.log("LDAP Result:", ldapResult);

    /* ==============================
       7️⃣ USER NOT FOUND
    ============================== */
    if (!ldapResult.userExists) {

      req.session.failedAttempts += 1;

      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return res.status(200).json({
        message: "User not found",
        data: {
          userExists: false,
          service_id: service.id,
        },
      });
    }

    /* ==============================
       8️⃣ USER FOUND → OTP FLOW
    ============================== */

    const normalizeMobile = (m) =>
      String(m || "").replace(/\D/g, "").slice(-10);

    const TEST_MOBILE = "6234567890";
    const isTestUser =
      normalizeMobile(ldapResult.mobileNumber) === TEST_MOBILE;

    let otpCode;

    if (isTestUser) {
      otpCode = "123456";
      console.log("🧪 Test user → SMS skipped");
    } else {
      otpCode = crypto.randomInt(100000, 999999).toString();
    }

    await SmsOtpLog.update(
      { status: "expired" },
      {
        where: {
          user_id: ldapResult.userName,
          service_id: service.id,
          status: "pending",
        },
      }
    );

    const hashedOtp = hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await SmsOtpLog.create({
      user_id: ldapResult.userName,
      service_id: service.id,
      mobile_number: ldapResult.mobileNumber,
      otp_code: hashedOtp,
      status: "pending",
      expires_at: expiresAt,
    });

    if (!isTestUser) {
      try {
        await sendOtpSms({
          mobile: ldapResult.mobileNumber,
          otp: otpCode,
        });
      } catch (smsErr) {
        console.error("⚠️ SMS failed:", smsErr.message);
      }
    }

    /* ==============================
       ✅ RESET SESSION
    ============================== */
    req.session.failedAttempts = 0;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const pictureUrl = ldapResult.picture
      ? `data:image/jpeg;base64,${ldapResult.picture}`
      : null;

    return res.json({
      message: "User found and OTP sent",
      data: {
        service_id: service.id,
        userExists: true,
        mobileNumber: ldapResult.mobileNumber,
        userName: ldapResult.userName,
        firstName: ldapResult.firstName,
        lastName: ldapResult.lastName,
        fullName: ldapResult.fullName,
        email: ldapResult.email,
        title: ldapResult.title,
        picture: pictureUrl,
        expires_at: expiresAt,
      },
    });

  } catch (err) {
    next(err);
  }
};


exports.checkUserLdap = async (req, res, next) => {
  try {

    console.log("═══════════════════════════════════════════");
    console.log("📍 checkUserLdap START");
    console.log("Session ID:", req.sessionID);
    console.log("Session Keys:", Object.keys(req.session).filter(k => k !== 'cookie'));
    console.log("failedAttempts:", req.session.failedAttempts);
    console.log("showCaptcha:", req.session.showCaptcha);
    console.log("captcha:", req.session.captcha);
    
    // 🔍 Debug: Check Redis directly
    try {
      const redisClient = require("../utils/redisClient");
      const redisKey = `sess:${req.sessionID}`;
      const redisData = await redisClient.get(redisKey);
      console.log("🔴 Redis raw data:", redisData);
    } catch (e) {
      console.log("⚠️ Redis check failed:", e.message);
    }
    console.log("═══════════════════════════════════════════");

    /* ==============================
       1️⃣ SESSION INIT
    ============================== */
    if (typeof req.session.failedAttempts !== "number") {
      req.session.failedAttempts = 0;
    }

    /* ==============================
       2️⃣ CAPTCHA EXPIRY CHECK
       (refresh / timeout → reset)
    ============================== */
    if (
      req.session.captchaAt &&
      Date.now() - req.session.captchaAt > 5 * 60 * 1000
    ) {
      req.session.failedAttempts = 0;
      req.session.showCaptcha = false;
      req.session.captcha = null;
      req.session.captchaAt = null;
    }

    /* ==============================
       3️⃣ MAX ATTEMPTS LOCK
       (bruteforce protection)
    ============================== */
    if (req.session.failedAttempts >= 5) {
      throw new AppError(
        "Too many failed attempts. Try again after some time.",
        429
      );
    }
console.log("SESSIOM[--] with body:", req.session.captcha);
    /* ==============================
       4️⃣ DECRYPT PAYLOAD
    ============================== */
    const { payload, key, iv } = req.body;

    if (!payload || !key || !iv) {
      throw new AppError("Invalid encrypted request", 400);
    }

    // 🔑 RSA decrypt AES key
    const aesKey = rsaDecryptKey(key);

    // 🔓 AES decrypt payload
    const decrypted = aesDecrypt(payload, aesKey, iv);
    const { username, captcha, service_key = "portaA", ts } = JSON.parse(decrypted);

    /* ==============================
       5️⃣ REPLAY / TIMESTAMP CHECK
    ============================== */
    if (ts && Date.now() - ts > 2 * 60 * 1000) {
      throw new AppError("Request expired", 400);
    }

    if (!username) {
      throw new AppError("username is required", 400);
    }
    

    // ==============================
// 6️⃣ CAPTCHA VALIDATION
// ==============================
console.log("═══════════════════════════════════════════");
console.log("🔍 CAPTCHA VALIDATION CHECK");
console.log("  showCaptcha flag:", req.session.showCaptcha);
console.log("  captcha input:", !!captcha);
console.log("  captcha stored:", !!req.session.captcha);
console.log("  failedAttempts:", req.session.failedAttempts);
console.log("═══════════════════════════════════════════");

// 🔥 Check if captcha should be validated
// Either: showCaptcha is explicitly true, OR user is providing a captcha input after failed attempts
const shouldValidateCaptcha = req.session.showCaptcha === true || (captcha && req.session.failedAttempts > 0);

console.log("Should validate captcha?", shouldValidateCaptcha);

if (shouldValidateCaptcha) {
  console.log("✓ Captcha validation ENABLED");

  if (!captcha) {
    console.log("❌ Captcha required but not provided");
    
    // 🔥 Re-enable captcha display if it was lost
    if (!req.session.showCaptcha) {
      req.session.showCaptcha = true;
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    return res.status(400).json({
      success: false,
      message: "Captcha is required",
      showCaptcha: true,
    });
  }

  console.log("Comparing:", captcha.toLowerCase(), "vs", req.session.captcha?.toLowerCase());

  if (
    !req.session.captcha ||
    captcha.toLowerCase() !== req.session.captcha.toLowerCase()
  ) {
    console.log("❌ Invalid captcha - Generating new one");
    req.session.failedAttempts += 1;

    // 🔄 Auto-generate new captcha for refresh
    const newCaptcha = generateCaptcha();
    req.session.captcha = newCaptcha.text;
    req.session.captchaAt = Date.now();
    req.session.showCaptcha = true; // 🔥 Make sure flag is set
    console.log("🎨 New captcha generated:", newCaptcha.text);
    console.log("📦 Captcha data type:", typeof newCaptcha.data, "length:", newCaptcha.data?.length);

    // 🔥 Save session with new captcha before response
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("❌ Save error:", err);
          reject(err);
        } else {
          console.log("✅ New captcha saved to Redis");
          resolve();
        }
      });
    });

    const captchaStr = typeof newCaptcha.data === 'string' ? newCaptcha.data : newCaptcha.data.toString();
    console.log("📤 Sending error response with new captcha");
    
    return res.status(400).json({
      success: false,
      message: "Invalid captcha",
      showCaptcha: true,
      data: {
        captcha: captchaStr, // 🎨 New captcha SVG as string
        newCaptchaGenerated: true,
      }
    });
  }

  // ✅ Captcha is correct - clear it
  console.log("✓ Captcha validated successfully");
  req.session.captcha = null;
  req.session.captchaAt = null;
  req.session.showCaptcha = false;

  // 🔥 Save session before continuing
  await new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
} else {
  console.log("⚠️ Captcha was skipped - no captcha required for this attempt");
}


    /* ==============================
       7️⃣ FETCH SERVICE
    ============================== */
    const service = await Service.findOne({ where: { service_key } });
    if (!service) {
      throw new AppError(
        "Service Key is not configured. Please contact the administrator.",
        404
      );
    }

    /* ==============================
       8️⃣ FETCH LDAP SETTINGS
    ============================== */
    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: service.id },
    });

    if (!settings) {
      throw new AppError(
        "Service is not configured. Please contact the administrator.",
        404
      );
    }

    /* ==============================
       9️⃣ CHECK USER IN LDAP
    ============================== */
    const ldapResult = await checkUserExists(username, settings);

    if (!ldapResult.userExists) {
      req.session.failedAttempts += 1;

      // ⭐ Decide to show CAPTCHA after first failed attempt
      if (req.session.failedAttempts >= 1 && !req.session.showCaptcha) {
        req.session.showCaptcha = true;
        req.session.captchaAt = Date.now();
      }

      console.log("💾 SAVING SESSION - User Not Found");
      console.log("  Session ID:", req.sessionID);
      console.log("  failedAttempts:", req.session.failedAttempts);
      console.log("  showCaptcha:", req.session.showCaptcha);
      console.log("  captchaAt:", req.session.captchaAt);

      // 🔥 Save session to Redis before response
      await new Promise((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("❌ Session save error:", err);
            reject(err);
          } else {
            console.log("✅ Session saved to Redis");
            resolve();
          }
        });
      });

     return res.success("User not found in our records.", {
  errorType: "USER_NOT_FOUND",
  service_id: service.id,
  userExists: false,
  name:ldapResult.fullName,
  showCaptcha: req.session.showCaptcha,
});

    }

    /* ==============================
       🔹 USER FOUND → RESET SESSION
    ============================== */
    req.session.failedAttempts = 0;
    req.session.showCaptcha = false;
    req.session.captcha = null;

    // 🔥 Save session to Redis before response
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    return res.success("User found in our records", {
      service_id: service.id,
      userExists: true,
      username:ldapResult.fullName,
      showCaptcha: false,
    });

  } catch (err) {
    next(err);
  }
};








