const { SmsOtpLog, ServiceLdapSetting } = require("../models");
const { checkUserExists } = require("../services/ldapService");
const crypto = require("crypto");
const AppError = require("../utils/appError");
const { sendOtpSms } = require("../services/smsService");
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC



const hashOtp = (otp) => {
  return crypto.createHash("sha256").update(otp).digest("hex");
};

// Constants
const OTP_EXPIRY_MINUTES = 5;
const RESEND_COOLDOWN_SEC = 60;
const MAX_RESEND_ATTEMPTS = 3;

/**
 * @desc Resend OTP for mobile login
 * @route POST /auth/resendOtp
 * @body { mobile_number, service_id }
 */
exports.resendOtp = async (req, res) => {
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
    
        const { mobile_number, service_id } = JSON.parse(decryptedStr);
    
       
//console.log(req.body);
    if (!mobile_number || !service_id) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields.",
      });
    }

       // 🔹 Get last OTP
    const lastOtp = await SmsOtpLog.findOne({
      where: { mobile_number, service_id, is_used: false },
      order: [["created_at", "DESC"]],
    });

    if (!lastOtp) {
      return res.status(404).json({
        success: false,
        message: "No active OTP found. Please start login again.",
      });
    }

    // ⏱️ Cooldown check (1 min)
    const now = Date.now();
    if (lastOtp.last_resend_time && now - new Date(lastOtp.last_resend_time).getTime() < RESEND_COOLDOWN_SEC * 1000) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_SEC * 1000 - (now - new Date(lastOtp.last_resend_time).getTime())) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSec} seconds before resending OTP`,
      });
    }

    // 🔢 Max resend attempts check
    if ((lastOtp.resend_attempts || 0) >= MAX_RESEND_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        message: "Maximum OTP resend limit reached",
      });
    }


    const settings = await ServiceLdapSetting.findOne({
      where: { service_id },
    });
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "LDAP settings not found",
      });
    }

    const ldapResult = await checkUserExists(lastOtp.mobile_number, settings);
    if (!ldapResult.userExists) {
      return res.status(404).json({
        success: false,
        message: "User not found in LDAP",
      });
    }

    await lastOtp.update({ is_used: true, status: "blocked" });


    // 🔹 Generate new OTP
    const otpCode = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = hashOtp(otpCode);
    const expiresAt = new Date(now + OTP_EXPIRY_MINUTES * 60 * 1000);



 const otpLog = await SmsOtpLog.create({
      user_id: lastOtp.user_id,
      service_id,
      mobile_number,
      otp_code: hashedOtp,
      provider: "SMSGatewayHub",
      status: "pending",
      attempt_count: 0,
      resend_attempts: (lastOtp.resend_attempts || 0) + 1,
      last_resend_time: new Date(),
      is_used: false,
      expires_at: expiresAt,
    });

    // 📲 Send SMS
    try {
      const smsResponse = await sendOtpSms({
        mobile: mobile_number,
        otp: otpCode,
      });

      if (smsResponse?.ErrorCode === "000") {
        const msg = smsResponse.MessageData?.[0];
        await otpLog.update({
          status: "sent",
          provider_message_id: msg?.MessageId || null,
        });
      } else {
        await otpLog.update({
          status: "failed",
          error_message: smsResponse?.ErrorMessage || "SMS failed",
        });
        return res.status(502).json({
          success: false,
          message: "SMS gateway error",
        });
      }
    } catch (smsErr) {
      await otpLog.update({
        status: "failed",
        error_message: smsErr.message,
      });
      return res.status(502).json({
        success: false,
        message: "Failed to send OTP SMS. Please try again.",
      });
    }

    return res.json({
      success: true,
      message: "OTP resent successfully",
      otp_id: otpLog.id,
      expires_at: expiresAt,
      resend_attempts: otpLog.resend_attempts,
    });
  } catch (err) {
    console.error("🔥 /resendOtp error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

