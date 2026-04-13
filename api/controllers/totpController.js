
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { UserTOTP, UserDevices, ServiceLdapSetting, Service,LoginToken,LoginAuditLog } = require("../models");
const { checkUserExists } = require("../services/ldapService");
const { authenticator } = require("otplib");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC
const AppError = require("../utils/appError");
const { JWT_SECRET, FRONTEND_URL, BACKEND_URL,JWT_EXPIRES_IN,COOKIE_DOMAIN,NODE_ENV } = process.env;
const UAParser = require("ua-parser-js");

const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
};
// ------------------------------------------------------
// 1️⃣ Generate TOTP secret for LDAP user & activate device
// ------------------------------------------------------
exports.generate = async (req, res, next) => {
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

    const { username, device_id, device_name, device_type, service_key } = JSON.parse(decryptedStr);
    console.log('request body ->>> ',username);
    if (!username) throw new AppError("username is required", 400);
    if (!device_id) throw new AppError("device_id is required", 400);

    // Default service key
    const key1 = service_key || "portalA";

    // 🔹 Fetch service by key
    const service = await Service.findOne({ where: { service_key: key1 } });
    if (!service) throw new AppError("Invalid service_key", 404);
    console.log("sanjay url :  ",service.id);
    // 🔹 Fetch LDAP settings for this service
    const settings = await ServiceLdapSetting.findOne({ where: { service_id: service.id } });
    console.log('setting ->>>>>>  ',settings);
    if (!settings || !settings.ldap_url) throw new AppError("LDAP settings not found or URL missing", 500);

    // 🔹 Check user in LDAP
    const ldapResult = await checkUserExists(username, settings, {
      allowUidSearch: true,
    });
    if (!ldapResult.userExists) {
      return res.status(404).json({ success: false, message: "User not found in LDAP" });
    }

    // 🔹 Generate TOTP secret
    const plainSecret = authenticator.generateSecret();
    const encryptedSecret = encryptToken(plainSecret,service.secret_key);

    // 🔹 Deactivate all other active devices
    await UserDevices.update(
      { is_active: false },
      { where: { ldap_uid: ldapResult.userName, is_active: true } }
    ).catch(err => console.warn("No active devices to deactivate or error ignored:", err));

    // 🔹 Add or update current device
    let device = await UserDevices.findOne({ where: { ldap_uid: ldapResult.userName, device_id } });
    if (device) {
      await device.update({ is_active: true, device_name, device_type });
    } else {
      device = await UserDevices.create({
        ldap_uid: ldapResult.userName,
        device_id,
        device_name,
        device_type,
        is_active: true
      });
    }

    // 🔹 Add or update TOTP secret safely using findOrCreate
    // const [userTOTP, created] = await UserTOTP.findOrCreate({
    //   where: { ldap_uid: ldapResult.userName },
    //   defaults: {
    //     totp_secret: encryptedSecret,
    //     device_id,
    //     is_totp_enabled: false
    //   }
    // });

    // if (!created) {
    //   await userTOTP.update({
    //     totp_secret: encryptedSecret,
    //     device_id,
    //     is_totp_enabled: false
    //   });
    // }

    const ldapUid = ldapResult.userName.trim().toLowerCase();

    let userTOTP = await UserTOTP.findOne({
      where: { ldap_uid: ldapUid }
    });

    if (!userTOTP) {
      userTOTP = await UserTOTP.create({
        ldap_uid: ldapUid,
        totp_secret: encryptedSecret,
        device_id,
        is_totp_enabled: false
      });
      console.log("TOTP record created");
    } else {
      await userTOTP.update({
        totp_secret: encryptedSecret,
        device_id,
        is_totp_enabled: false
      });
      console.log("TOTP record updated");
    }






    return res.json({
      success: true,
      message: "User exists in LDAP. TOTP secret generated and device activated.",
      secret: plainSecret, // ⚠️ send plaintext only once
      user: {
        username,
        name: ldapResult.fullName,
        mobile: ldapResult.mobileNumber
      }
    });

  } catch (err) {
    next(err);
  }
};

// ------------------------------------------------------
// 2️⃣ Validate OTP for active device & enable TOTP
// ------------------------------------------------------
exports.validate = async (req, res, next) => {
  try {

    if (typeof req.session.totpCaptchaRequired !== "boolean") {
  req.session.totpCaptchaRequired = false;
}
    const { iv, key, payload } = req.body;

    /* ==============================
       1️⃣ BASIC REQUEST VALIDATION
    ============================== */
    if (!iv || !key || !payload) {
      return res.status(400).json({
        success: false,
        message: "Invalid or tampered request.",
      });
    }

    /* ==============================
       2️⃣ DECRYPT REQUEST PAYLOAD
    ============================== */
    const aesKey = rsaDecryptKey(key);
    const decryptedStr = aesDecrypt(payload, aesKey, iv);

    if (!decryptedStr) {
      return res.status(400).json({
        success: false,
        message: "Invalid or tampered request.",
      });
    }

    const {
      username,
      device_id,
      otp,
      service_key,
      captcha,
    } = JSON.parse(decryptedStr);

    if (!username || !device_id || !otp) {
      throw new AppError("Missing required fields.", 400);
    }

    const key1 = service_key || "portalA";
console.log('request body ->>> ',captcha);
    /* ==============================
       3️⃣ SERVICE & LDAP CONFIG
    ============================== */
    const service = await Service.findOne({
      where: { service_key: key1 },
    });
    if (!service) throw new AppError("Service not found.", 404);

    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: service.id },
    });
    if (!settings?.ldap_url) {
      throw new AppError("Authentication configuration missing.", 500);
    }

    /* ==============================
       4️⃣ LDAP USER CHECK
    ============================== */
    const ldapResult = await checkUserExists(username, settings, {
      allowUidSearch: true,
    });

    if (!ldapResult.userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
        showCaptcha: true,
      });
    }

    /* ==============================
       5️⃣ ACTIVE DEVICE CHECK
    ============================== */
    const device = await UserDevices.findOne({
      where: {
        ldap_uid: ldapResult.userName,
        is_active: true
      },
    });

    if (!device) {
      return res.status(403).json({
        success: false,
        message: "Device not active.",
        showCaptcha: true,
      });
    }

    /* ==============================
       6️⃣ DEVICE BLOCK CHECK
    ============================== */
    if (
      device.totp_blocked_until &&
      device.totp_blocked_until > new Date()
    ) {
      return res.status(403).json({
        success: false,
        code: "DEVICE_BLOCKED",
        message: "Too many wrong attempts. Device temporarily blocked.",
        blocked_until: device.totp_blocked_until,
        showCaptcha: true,
      });
    }

/* ==============================
   7️⃣ CAPTCHA CHECK (STRICT)
============================== */
console.log('captcha from request ->>> ',captcha);
console.log('captcha from session ->>> ',req.session.captcha);

if (req.session.totpCaptchaRequired === true) {

  // ❌ captcha missing
  if (!captcha) {
    return res.status(400).json({
      success: false,
      code: "CAPTCHA_REQUIRED",
      message: "Captcha required",
      showCaptcha: true,
    });
  }

  // ❌ captcha expired / not generated
  if (!req.session.captcha) {
    return res.status(400).json({
      success: false,
      code: "CAPTCHA_EXPIRED",
      message: "Captcha expired, please reload",
      showCaptcha: true,
    });
  }

  // ❌ captcha mismatch
  if (
    captcha.toString().trim().toLowerCase() !==
    req.session.captcha.toString().trim().toLowerCase()
  ) {
    req.session.totpCaptchaRequired = true; // 🔒 KEEP IT TRUE
    return res.status(400).json({
      success: false,
      code: "CAPTCHA_INVALID",
      message: "Invalid captcha",
      showCaptcha: true,
    });
  }

  // ✅ CAPTCHA PASSED → consume it
  req.session.captcha = captcha.text;
  req.session.captchaAt = Date.now();
  //req.session.totpCaptchaRequired = false;
}
    /* ==============================
       8️⃣ FETCH USER TOTP
    ============================== */
    const userTOTP = await UserTOTP.findOne({
      where: {
        ldap_uid: ldapResult.userName,
        device_id: device.device_id,
      },
    });

    if (!userTOTP) {
      return res.status(404).json({
        success: false,
        message: "TOTP not configured.",
      });
    }

    /* ==============================
       9️⃣ DECRYPT TOTP SECRET
    ============================== */
    let decryptedSecret;
    try {
      decryptedSecret = decryptToken(
        userTOTP.totp_secret,
        service.secret_key
      );
    } catch (err) {
      console.error("❌ Secret decrypt failed:", err);
      return res.status(500).json({
        success: false,
        message: "Authentication error. Try again later.",
      });
    }

    /* ==============================
       🔟 VERIFY TOTP
    ============================== */
    authenticator.options = { step: 30, window: 0 };

    const isValid = authenticator.verify({
      token: otp,
      secret: decryptedSecret,
    });

/* ==============================
   ❌ WRONG TOTP
============================== */
if (!isValid) {
  const attempts = (device.failed_totp_attempts || 0) + 1;

  const updates = {
    failed_totp_attempts: attempts,
  };

  if (attempts >= 3) {
    updates.totp_blocked_until = new Date(
      Date.now() + 15 * 60 * 1000
    );
  }

  await device.update(updates);

  // 🔐 FORCE CAPTCHA FOR NEXT ATTEMPT
  req.session.totpCaptchaRequired = true;

  // 🔥 IMPORTANT: invalidate old captcha
  req.session.captcha = null;
  req.session.captchaGeneratedAt = null; // ✅ ADD THIS (if you track expiry)

  return res.status(400).json({
    success: false,
    code: attempts >= 3 ? "DEVICE_BLOCKED" : "INVALID_TOTP",
    message:
      attempts >= 3
        ? "Device blocked due to multiple wrong attempts."
        : "Invalid TOTP.",
    blocked_until: updates.totp_blocked_until || null,
    showCaptcha: true,

    // 🔔 frontend ko hint do
    forceReloadCaptcha: true, // ✅ ADD THIS
  });
}

    /* ==============================
       ✅ SUCCESS → RESET FLAGS
    ============================== */
    await device.update({
      failed_totp_attempts: 0,
      totp_blocked_until: null,
    });

    req.session.totpCaptchaRequired = false;
    req.session.captchaText = null;

    if (!userTOTP.is_totp_enabled) {
      await userTOTP.update({ is_totp_enabled: true });
    }

    /* ==============================
       🔥 JWT + COOKIE + REDIRECT
    ============================== */
     const redirectBase1 = service?.service_url || process.env.FRONTEND_URL;

    const payload1 = {
      userId: ldapResult.userName,
      mobile: ldapResult.mobileNumber,
      service_id: service.id,
      name: ldapResult.fullName,
      title: ldapResult.title,
      email: ldapResult.email || null,
      provider: "TOTP",
      authType: "Yukti",
      iss: BACKEND_URL,
      aud: redirectBase1,
      jti: crypto.randomUUID(),
    };


        // 🔐 Use department/service specific secret key
    const secretKey = service.secret_key || process.env.ENCRYPTION_SECRET;
    
    const token = jwt.sign(payload1, JWT_SECRET, { algorithm: "HS512", expiresIn: JWT_EXPIRES_IN });
    
    // 🔒 Encrypt JWT using dept secret key (same as OTP flow)
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
    
    
        // Create login token entry
        const loginToken = await LoginToken.create({
          username:ldapResult.userName,
          service_id: service.id,
          access_token: payload1.jti,
          ip_address: clientIp,
          user_agent: req.headers["user-agent"],

          browser: browserName,
          browser_version: browserVersion,
          os: os,
          device_type: deviceType,
          provider: payload1.provider,   // ✅ add this line
        });
    
        // Create audit log
        await LoginAuditLog.create({
          username:ldapResult.userName,
          service_id: service.id,
          token_id: loginToken.id,
          action: "LOGIN",
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
        });
    
    // 🔹 COOKIE OPTIONS
    
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
    
    
        console.log('🍪 Cookie Options:', cookieOptions);
    
        // 🔹 SET CENTRALIZED SSO COOKIE
        res.cookie("sso_token", token, cookieOptions);
    
        // 🔹 Set encrypted token as backup cookie
        res.cookie("auth_token", encryptedTokenAuth, cookieOptions);
    
        // 🔹 Store in session too
        //req.session.authenticated = true;
        //req.session.user = payload1;
        //req.session.token = token;
    
        // 🔥 Calculate remaining OTP expiry
        const step = 30;
        const now = Math.floor(Date.now() / 1000);
        const expires_in = step - (now % step);
    
        return res.json({
          success: true,
          message: "OTP verified successfully, TOTP enabled.",
          expires_in,
          redirectUrl: `${redirectBase1}?token=${encodeURIComponent(encryptedToken)}`,
        });
  } catch (err) {
    next(err);
  }
};
