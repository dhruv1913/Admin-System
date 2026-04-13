const { Op } = require("sequelize");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { ServiceLdapSetting, Service } = require("../models");
const SmsOtpLog = require("../models/smsOtpLog");
const { checkUserExists } = require("../services/ldapService");
const { encryptToken } = require("../utils/Crypto");

const { JWT_SECRET, JWT_EXPIRES_IN, BACKEND_URL } = process.env;
const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};
exports.verifyMobileOtp = async (req, res) => {
  const { mobile_number, service_id, otp_code } = req.body;

  // 🔹 Validate input
  if (!mobile_number || !otp_code) {
    return res.status(400).json({
      success: false,
      message: "mobile_number and otp_code are required",
    });
  }

  try {
    // 🔹 If service_id is null, load default service
    let finalServiceId = service_id;

    // if (!finalServiceId) {
    //   const defaultService = await Service.findOne({ where: { is_active: true } }) 
    //     || await Service.findOne();

    //   finalServiceId = defaultService.id;
    //   console.log("📌 Using default service_id:", finalServiceId);
    // }

     const service = await Service.findOne({ where: { id: service_id, is_active: true } });
        
    
    if (!service) return res.status(404).json({ error: "Service not found." });

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

    // 🔹 LDAP Authentication
    const settings = await ServiceLdapSetting.findOne({ where: { service_id: finalServiceId } });
    const ldapResult = await checkUserExists(otpEntry.user_id, settings);

    if (!ldapResult.userExists) {
      return res.status(400).json({ success: false, message: "User not found in LDAP" });
    }

    // 🔹 Prepare JWT payload
    const payload = {
      userId: otpEntry.user_id,
      mobile_number: otpEntry.mobile_number,
      service_id: finalServiceId,
      name: ldapResult.name,
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
    };

    // 🔹 Create JWT token
    const token = jwt.sign(payload, JWT_SECRET, {
      algorithm: "HS512",
      expiresIn: JWT_EXPIRES_IN,
    });

    const encryptedToken = encryptToken(token,service.secret_key);

    // 🔹 Return JSON (NO COOKIE)
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
