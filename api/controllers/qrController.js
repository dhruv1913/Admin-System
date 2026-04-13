// controllers/qrController.js
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
const QrLoginSession = require("../models/QrLoginSession");
const { UserTOTP, UserDevices, ServiceLdapSetting, Service,LoginToken,LoginAuditLog } = require("../models");
//const { encryptToken, decryptToken } = require("../utils/Crypto");
const { checkUserExists } = require("../services/ldapService");
const AppError = require("../utils/appError");
const { JWT_SECRET, FRONTEND_URL, BACKEND_URL,JWT_EXPIRES_IN,COOKIE_DOMAIN,NODE_ENV } = process.env;
const { decryptToken,encryptToken,rsaDecryptKey, aesDecrypt } = require("../utils/Crypto"); // AES-256-CBC
const UAParser = require("ua-parser-js");
const getClientIp = (req) => {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip
  );
};
// 🔐 Signature generator
function generateSignature(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");
}

// ----------------------------------------------------------------------
// 1) GENERATE QR
// ----------------------------------------------------------------------
exports.initQr = async (req, res) => {
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
    
        const { service_key, device_id } = JSON.parse(decryptedStr);

    if (!service_key) {
      return res.status(400).json({ message: "service_key required" });
    }

    // Service find → to get SECRET KEY
    const service = await Service.findOne({ where: { service_key } });

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    const session_id = uuidv4();
    const expires_at = new Date(Date.now() + 60 * 1000); // 1 min
    const ts = Date.now();
    const qrPayload = {
      session_id,
      service_key,
      ts,
    };

    // Signature using service.secret_key
    const qr_code_signature = generateSignature(qrPayload, service.secret_key);

    // Final payload stored in QR
    const finalPayload = {
      ...qrPayload,
      signature: qr_code_signature,
    };

    // Make QR image
    const qr_code_data = await QRCode.toDataURL(JSON.stringify(finalPayload));

    // Insert into DB
    await QrLoginSession.create({
      session_id,
      qr_code_data,
      device_id: device_id || null,
      service_key,
      qr_code_signature,
      status: "pending",
      expires_at,
      ts, // 👈 SAVE SAME ts
    });

    return res.json({
      success: true,
      session_id,
      qr_url: qr_code_data,
      expires_at,
    });
  } catch (err) {
    console.error("QR GENERATE ERROR:", err);
    return res.status(500).json({ message: "QR generation failed" });
  }
};

// ----------------------------------------------------------------------
// 2) MOBILE → SCAN QR
// ----------------------------------------------------------------------
// ----------------------------------------------------------------------
// 2) MOBILE → SCAN QR (FULL CODE - FIXED)
// ----------------------------------------------------------------------
exports.scanQR = async (req, res) => {
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
    
        const { session_id,
      service_key,
      ts,
      signature,
      ldap_uid,
      device_id } = JSON.parse(decryptedStr);
  

    // 🔍 Basic validation
    if (
      !session_id ||
      !service_key ||
      !ts ||
      !signature ||
      !ldap_uid ||
      !device_id
    ) {
      return res.status(400).json({ message: "Missing required parameters" });
    }

    // 🔢 Ensure ts is number
    const scanTs = Number(ts);
    if (isNaN(scanTs)) {
      return res.status(400).json({ message: "Invalid timestamp" });
    }

    // 🔎 Find QR session from DB
    const data = await QrLoginSession.findOne({ where: { session_id } });
    if (!data) {
      return res.status(404).json({ message: "QR session not found" });
    }

    // ⛔ Status check
    if (data.status !== "pending") {
      return res.status(400).json({
        message: `QR already ${data.status}`,
      });
    }

    // ⏰ Expiry check
    const now = Date.now();
    if (now > new Date(data.expires_at).getTime()) {
      data.status = "expired";
      await data.save();
      return res.status(400).json({ message: "QR expired" });
    }

    // 🔐 Validate service
    const service = await Service.findOne({ where: { service_key } });
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // 🔐 Signature verification using MOBILE payload
    const qrPayloadVerify = {
      session_id,
      service_key,
      ts: scanTs,
    };

    const expectedSig = generateSignature(qrPayloadVerify, service.secret_key);

    console.log("🔍 QR Verify Payload:", qrPayloadVerify);
    console.log("✅ Expected Sig:", expectedSig);
    console.log("📩 Received Sig:", signature);

    if (expectedSig !== signature) {
      return res.status(401).json({ message: "Invalid QR signature" });
    }

    // 🧾 Cross-check with DB (extra safety)
    if (
      data.service_key !== service_key ||
      Number(data.ts) !== scanTs
    ) {
      return res.status(401).json({ message: "QR payload mismatch" });
    }

    // 🔍 Check device exists & active
    const device = await UserDevices.findOne({
      where: {
        ldap_uid,
        device_id,
        is_active: true,
      },
    });

    if (!device) {
      return res.status(403).json({
        message: "Device not registered or inactive",
      });
    }

    // 📝 Mark as scanned
    data.status = "scanned";
    data.ldap_uid = ldap_uid;
    data.device_id = device_id;
    data.ip_address = req.ip;
    data.device_info = req.headers["user-agent"] || null;

    await data.save();

    return res.json({
      success: true,
      message: "QR scanned successfully. Awaiting approval.",
    });
  } catch (err) {
    console.error("❌ SCAN QR ERROR:", err);
    return res.status(500).json({ message: "QR scan failed" });
  }
};



// ----------------------------------------------------------------------
// 3) MOBILE → APPROVE LOGIN (IMPROVED)
// ----------------------------------------------------------------------
exports.approveQR = async (req, res) => {
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
    
        const { session_id, ldap_uid } = JSON.parse(decryptedStr);


    // 🔍 Basic validation
    if (!session_id || !ldap_uid) {
      return res.status(400).json({ message: "session_id and ldap_uid required" });
    }

    const data = await QrLoginSession.findOne({ where: { session_id } });

    if (!data) {
      return res.status(404).json({ message: "QR session not found" });
    }

    // ⛔ Status check
    if (data.status !== "scanned") {
      return res.status(400).json({
        message: `QR not in scanned state (current: ${data.status})`,
      });
    }

    // 🔐 Ensure same user who scanned is approving
    if (data.ldap_uid !== ldap_uid) {
      return res.status(403).json({ message: "User mismatch for approval" });
    }

    // ⏰ Expiry check
    if (Date.now() > new Date(data.expires_at).getTime()) {
      data.status = "expired";
      await data.save();
      return res.status(400).json({ message: "QR approval timed out. Please rescan." });
    }

    // 🔍 Verify same device still active
    const device = await UserDevices.findOne({
      where: {
        ldap_uid,
        device_id: data.device_id,
        is_active: true,
      },
    });

    if (!device) {
      return res.status(403).json({
        message: "Device not registered or inactive",
      });
    }

    // 🔐 Generate login token
    const loginToken = crypto.randomBytes(32).toString("hex");

    // 📝 Approve login
    data.status = "approved";
    data.approved_at = new Date();
    data.login_token = loginToken;
    data.token_expires_at = new Date(Date.now() + 2 * 60 * 1000); // ⏳ 2 min validity

    await data.save();

    return res.json({
      success: true,
      login_token: loginToken,
      message: "QR Approved successfully",
    });
  } catch (err) {
    console.error("❌ APPROVE QR ERROR:", err);
    return res.status(500).json({ message: "Approval failed" });
  }
};

// ----------------------------------------------------------------------
// 4) PC → POLL STATUS (FINAL LOGIN AFTER QR APPROVAL) — UI ALIGNED
// ----------------------------------------------------------------------
exports.pollStatus = async (req, res) => {
  console.log("🔍 POLL FINAL LOGIN:", req.params);
  try {
    const { session_id } = req.params;
    if (!session_id) return res.json({ status: "invalid" });

    const data = await QrLoginSession.findOne({
      where: { session_id },
    });
    if (!data) return res.json({ status: "invalid" });

    const now = Date.now();

    // ⏰ Expire QR if needed
    if (
      now > new Date(data.expires_at).getTime() &&
      !["expired", "used"].includes(data.status)
    ) {
      data.status = "expired";
      await data.save();
      return res.json({ status: "expired" });
    }

    // ⏳ Still waiting → always return pending for UI
    if (["pending", "scanned"].includes(data.status)) {
      return res.json({ status: "pending" });
    }

    // 🔥 If approved → do FINAL LOGIN
    if (data.status === "approved") {
      // Prevent reuse
      data.status = "used";
      await data.save();

      // 🔎 Fetch service
      const service = await Service.findOne({
        where: { service_key: data.service_key },
      });
      if (!service) return res.json({ status: "error" });

      // 🔎 LDAP user fetch
      const username = data.ldap_uid;

      const settings = await ServiceLdapSetting.findOne({
        where: { service_id: service.id },
      });

      if (!settings || !settings.ldap_url) {
        return res.status(500).json({
          status: "error",
          message: "Authentication configuration missing",
        });
      }

      const ldapResult = await checkUserExists(username, settings, {
      allowUidSearch: true,
    });

      if (!ldapResult.userExists) {
        return res.status(404).json({
          status: "error",
          message: "User not found in LDAP",
        });
      }

      // 🎯 Build JWT payload
      const redirectBase1 =
        service?.service_url || process.env.FRONTEND_URL;

      const payload = {
        userId: ldapResult.userName,
        mobile: ldapResult.mobileNumber,
        service_id: service.id,
        name: ldapResult.fullName,
        title: ldapResult.title,
        email: ldapResult.email || null,
        description: ldapResult.description,
        provider: "QR",
        authType: "Yukti",
        iss: BACKEND_URL,
        aud: redirectBase1,
        jti: crypto.randomUUID(),
      };

      // 🔐 JWT sign
      const token = jwt.sign(payload, JWT_SECRET, {
        algorithm: "HS512",
        expiresIn: JWT_EXPIRES_IN,
      });

      // 🔒 Encrypt token
      const secretKey =
        service.secret_key;

      const encryptedToken = encryptToken(token, secretKey);
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

      // 📝 LoginToken entry
      const loginToken = await LoginToken.create({
        username: ldapResult.userName,
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

      // 🧾 Audit log
      await LoginAuditLog.create({
        username: ldapResult.userName,
        service_id: service.id,
        token_id: loginToken.id,
        action: "LOGIN",
        ip_address: req.ip,
        user_agent: req.headers["user-agent"],
      });

      // 🍪 Cookie options (1 day)
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const cookieOptions = {
        path: "/",
        httpOnly: true,
        secure: false, // prod: true
        sameSite: "lax",
        domain: COOKIE_DOMAIN,
        maxAge: ONE_DAY,
      };

      res.cookie("sso_token", token, cookieOptions);
      res.cookie("auth_token", encryptedTokenAuth, cookieOptions);

      // 🗂 Store in session
      //req.session.authenticated = true;
      //req.session.user = payload;
      //req.session.token = token;

      // ✅ UI expects confirmed
      return res.json({
        status: "confirmed",
        loggedIn: true,
        success: true,
        redirectUrl: `${redirectBase1}?token=${encodeURIComponent(
          encryptedToken
        )}`,
      });
    }

    // ❌ Any other state
    return res.json({ status: data.status });
  } catch (err) {
    console.error("❌ POLL FINAL LOGIN ERROR:", err);
    return res.status(500).json({ status: "error" });
  }
};


