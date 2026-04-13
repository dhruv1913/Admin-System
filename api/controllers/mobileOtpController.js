const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { ServiceLdapSetting, LoginToken, LoginAuditLog, Service,UserDevices } = require("../models");
const SmsOtpLog = require("../models/smsOtpLog");

const { checkUserExists } = require("../services/ldapService");
//const { encryptToken } = require("../utils/Crypto");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC
const UAParser = require("ua-parser-js");
const { 
  sendRegistrationAlertSms, 
  sendDeviceChangeAlertSms 
} = require("../services/smsService");

const { JWT_SECRET, JWT_EXPIRES_IN, BACKEND_URL } = process.env;
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
};
const hashOtp = (otp) =>
  crypto.createHash("sha256").update(otp).digest("hex");

exports.verifyMobileOtp = async (req, res) => {

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

    const { 
    mobile_number, 
    service_id, 
    otp_code,
    device_id,
    device_name,
    device_type
  } = JSON.parse(decryptedStr);

  console.log("📌 verifyMobileOtp called", req.body);

  if (!mobile_number || !otp_code || !device_id) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    const finalServiceId = service_id;

    const service = await Service.findOne({ 
      where: { id: finalServiceId, is_active: true } 
    });

    if (!service) {
      return res.status(404).json({ success: false, message: "Service not found." });
    }


    // 🔹 LDAP Authentication
    const settings = await ServiceLdapSetting.findOne({ 
      where: { service_id: finalServiceId } 
    });

    const ldapResult = await checkUserExists(mobile_number, settings);

    if (!ldapResult.userExists) {
      return res.status(400).json({ success: false, message: "User not found in LDAP" });
    }

    // 🔹 Find OTP entry
    const otpEntry = await SmsOtpLog.findOne({
      where: {
        mobile_number,
        service_id: finalServiceId,
        is_used: false,
        expires_at: { [Op.gt]: new Date() },
      },
      order: [["created_at", "DESC"]],
    });

    if (!otpEntry) {
      return res.status(404).json({ success: false, message: "OTP expired or invalid" });
    }

    const hashedInput = hashOtp(otp_code);

    // 🔹 Verify OTP
    if (otpEntry.otp_code !== hashedInput) {
      otpEntry.attempt_count += 1;

      if (otpEntry.attempt_count >= 5) {
        otpEntry.is_used = true;
        otpEntry.status = "blocked";
      }

      await otpEntry.save();

      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
        attempt_count: otpEntry.attempt_count,
      });
    }

    // 🔹 Mark OTP as used
    otpEntry.is_used = true;
    otpEntry.status = "verified";
    otpEntry.used_at = new Date();
    await otpEntry.save();

    

    // =================================================
    // 📱 DEVICE REGISTER / UPDATE LOGIC
    // =================================================
    let isFirstDevice = false;
    let isDeviceChanged = false;

    const activeDevice = await UserDevices.findOne({
      where: { ldap_uid: ldapResult.userName, is_active: true }
    });

    // 🔹 Deactivate all active devices
    await UserDevices.update(
      { is_active: false },
      { where: { ldap_uid: ldapResult.userName, is_active: true } }
    );

    // 🔹 Add or update current device
    let device = await UserDevices.findOne({
      where: { ldap_uid: ldapResult.userName, device_id }
    });

    if (device) {
      await device.update({ 
        is_active: true, 
        device_name, 
        device_type 
      });
    } else {
      await UserDevices.create({
        ldap_uid: ldapResult.userName,
        device_id,
        device_name,
        device_type,
        is_active: true
      });

      if (!activeDevice) isFirstDevice = true;
      else isDeviceChanged = true;
    }

    // 🔹 Send SMS alerts (non-blocking)
    try {
      if (isFirstDevice) {
        await sendRegistrationAlertSms({ mobile: otpEntry.mobile_number });
      } else if (isDeviceChanged) {
        await sendDeviceChangeAlertSms({ mobile: otpEntry.mobile_number });
      }
    } catch (smsErr) {
      console.error("⚠️ SMS send failed:", smsErr.message);
    }

    // =================================================
    // 🔐 Prepare JWT payload
    // =================================================
    const payload = {
      userId: otpEntry.user_id,
      mobile_number: otpEntry.mobile_number,
      service_id: finalServiceId,
      name: ldapResult.name || ldapResult.fullName,
      cn: ldapResult.cn,
      sn: ldapResult.sn,
      email: ldapResult.email || null,
      title: ldapResult.title,
      desc: ldapResult.desc,
      provider: "MOBILE_APP",
      authType: "Yukti",
      jti: crypto.randomUUID(),
      iss: BACKEND_URL,
      user_agent: "mobile-app",
      device_id,
      device_type,
      device_name
    };

    // 🔹 Create JWT token
    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    const encryptedToken = encryptToken(token, service.secret_key);

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
          access_token: payload.jti,
          ip_address: clientIp,
          user_agent: req.headers["user-agent"],

          browser: payload.device_name,
          browser_version: browserVersion,
          os: payload.device_type,
          device_type: payload.device_id,
          provider: payload.provider,   // ✅ add this line
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

    // 🔹 Return JSON
    return res.json({
      success: true,
      message: "OTP verified successfully",
      token: encryptedToken,
      user: {
        userId: ldapResult.userName,
        mobile: ldapResult.mobileNumber,
        name: ldapResult.fullName,
        email: ldapResult.email,
        title: ldapResult.title,
      },
    });

  } catch (error) {
    console.error("🔥 Mobile OTP Verify Error:", error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};


exports.mobileLogout = async (req, res) => {
  console.log("📱 Mobile Logout called");

  try {

    // 🔐 Decrypt request
    const { iv, key, payload } = req.body;

    if (!iv || !key || !payload) {
      return res.status(400).json({ error: "Invalid or tampered request." });
    }

    // 🔑 RSA decrypt AES key
    const aesKey = rsaDecryptKey(key);

    // 🔓 AES decrypt payload
    const decryptedStr = aesDecrypt(payload, aesKey, iv);
    if (!decryptedStr) {
      return res.status(400).json({ error: "Invalid or tampered request." });
    }

    const { token, device_id, service_id } = JSON.parse(decryptedStr);

    if (!token || !device_id || !service_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    // 🔹 Find service for secret key
    const service = await Service.findOne({
      where: { id: service_id, is_active: true }
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    // 🔓 Decrypt token
    const decryptedToken = decryptToken(token, service.secret_key);

    // 🔹 Verify JWT
    const decoded = jwt.verify(decryptedToken, JWT_SECRET, {
      algorithms: ["HS512"]
    });

    console.log("✅ Token verified:", decoded.userId);

    // 🔹 Find active login session
    const loginEntry = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE"
      }
    });

    if (!loginEntry) {
      return res.status(404).json({
        success: false,
        message: "Session already logged out"
      });
    }

    // 🔹 Update session
    await loginEntry.update({
      logout_time: new Date(),
      status: "LOGOUT"
    });

    // 🔹 Deactivate device
    await UserDevices.update(
      { is_active: false },
      { where: { ldap_uid: decoded.userId, device_id } }
    );

    // 🔹 Audit log
    await LoginAuditLog.create({
      username: decoded.userId,
      service_id: decoded.service_id,
      token_id: loginEntry.id,
      action: "MOBILE_LOGOUT",
      ip_address: req.ip,
      user_agent: req.headers["user-agent"] || null
    });

    return res.json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (err) {
    console.error("🔥 Mobile logout error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
