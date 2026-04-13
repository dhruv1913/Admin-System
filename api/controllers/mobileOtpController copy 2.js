const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { ServiceLdapSetting, LoginToken, LoginAuditLog, Service,UserDevices } = require("../models");
const SmsOtpLog = require("../models/smsOtpLog");

const { checkUserExists } = require("../services/ldapService");
//const { encryptToken } = require("../utils/Crypto");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC

const { 
  sendRegistrationAlertSms, 
  sendDeviceChangeAlertSms 
} = require("../services/smsService");

const { JWT_SECRET, JWT_EXPIRES_IN, BACKEND_URL } = process.env;

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


    
                    // 🔹 Get real client IP
            const clientIp = getClientIp(req);
    
            // 🔹 Parse User Agent
            const parser = new UAParser(req.headers["user-agent"]);
            const result = parser.getResult();
    
            const browserName = result.browser.name || null;
            const browserVersion = result.browser.version || null;
            const os = result.os.name || null;
            const deviceType = result.device.type || "desktop";

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
      device_type
    };

    // 🔹 Create JWT token
    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    const encryptedToken = encryptToken(token, service.secret_key);


    // ✅ Create login token entry
        const loginToken = await LoginToken.create({
          username: otpEntry.user_id,
          service_id,
          access_token: payload.jti,
          ip_address: req.ip,
          user_agent: req.headers["user-agent"],
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
