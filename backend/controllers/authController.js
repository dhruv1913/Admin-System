const { createClient, bind, search } = require("../services/ldapService");
const { generateToken } = require("../services/tokenService");
const { logAction } = require("../services/logService");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const dbService = require("../services/dbService"); // 🚨 Imported the new DB service
const svgCaptcha = require("svg-captcha");
const fs = require("fs");
const path = require("path");
const sequelize = require('../config/db');
const jwt = require('jsonwebtoken');

let publicKey = "";
let privateKey = "";

// 🚨 SMART KEY LOADER: This will check both possible file names automatically!
try {
  // Checks for both naming conventions automatically
  const publicPath1 = path.join(__dirname, "../public.pem");
  const publicPath2 = path.join(__dirname, "../public_key.pem");
  
  if (fs.existsSync(publicPath1)) publicKey = fs.readFileSync(publicPath1, "utf8");
  else if (fs.existsSync(publicPath2)) publicKey = fs.readFileSync(publicPath2, "utf8");

  const privatePath1 = path.join(__dirname, "../private.pem");
  const privatePath2 = path.join(__dirname, "../private_key.pem");
  
  if (fs.existsSync(privatePath1)) privateKey = fs.readFileSync(privatePath1, "utf8");
  else if (fs.existsSync(privatePath2)) privateKey = fs.readFileSync(privatePath2, "utf8");

  if (publicKey && privateKey) {
      console.log(" RSA Keys successfully loaded from file system.");
  } else {
      console.error("🚨 CRITICAL: One or both RSA Keys are missing from the backend folder!");
  }
} catch (err) {
  console.error("🚨 CRITICAL: Error reading RSA Keys!", err.message);
}

exports.getPublicKey = (req, res) => {
  if (!publicKey) {
    return res.status(500).send("Public key not available on server.");
  }
  res.type("text/plain").send(publicKey);
};

exports.getPrivateKey = () => privateKey;

exports.getCaptcha = (req, res) => {
    try {
        // Generate a new SVG captcha
        const captcha = svgCaptcha.create({
            size: 5,           // length of characters
            ignoreChars: '0o1i', // filter out confusing characters
            noise: 2,          // number of noise lines
            color: true,       // characters will have distinct colors
            background: '#f4f4f4' 
        });

        // Save the text value to the user's session so you can verify it on login
        req.session.captcha = captcha.text;

        // Send the SVG string to the React frontend
        res.status(200).json({ image: captcha.data });
    } catch (error) {
        console.error("Captcha generation failed:", error);
        res.status(500).json({ message: "Failed to generate security check" });
    }
};

exports.login = async (req, res) => {
  const { uid, captchaValue } = req.body || {};

  // 1. Initial Validation
  if (!uid) return errorResponse(res, "Missing UID", 400);
  if (
    !req.session.captcha ||
    req.session.captcha !== captchaValue?.toLowerCase()
  ) {
    return errorResponse(res, "Incorrect CAPTCHA", 400);
  }
  req.session.captcha = null;

  // Define adminClient outside try/catch so 'finally' can access it
  let adminClient;

  try {
    // 2. Fetch password from Postgres
    const storedPassword = await dbService.getStoredPassword(uid);
    if (!storedPassword) {
      return errorResponse(res, "User not found or inactive", 401);
    }

    // 3. Fetch LDAP Settings
    const settings = await ServiceLdapSetting.findOne({
      where: { service_id: 1 },
    });
    if (!settings) return errorResponse(res, "LDAP configuration missing", 500);

    // 4. Connect as Admin
    adminClient = createClient(settings.ldap_url);
    await bind(adminClient, settings.bind_dn, settings.password);

    // 5. Find User DN
    const searchResult = await search(adminClient, settings.base_dn, {
      scope: "sub",
      filter: `(uid=${uid})`,
      attributes: ["dn", "businessCategory", "cn", "departmentNumber"],
    });

    if (searchResult.length === 0) {
      return errorResponse(res, "User not found in LDAP Directory", 404);
    }

    const userRecord = searchResult[0];

    // 6. Attempt User Bind with Postgres Password
    const userClient = createClient(settings.ldap_url);
    try {
      console.log(`🔑 Attempting user bind for: ${userRecord.dn}`);
      await bind(userClient, userRecord.dn, storedPassword);
      console.log("✅ User authentication successful");
    } catch (bindErr) {
      console.error("❌ User bind failed:", bindErr.message);
      return errorResponse(res, "Invalid Credentials", 401);
    } finally {
      userClient.unbind();
    }

    // 7. Success Flow: Extract Roles & Names
    const role = Array.isArray(userRecord.businessCategory)
      ? userRecord.businessCategory[0]
      : userRecord.businessCategory || "USER";

    const name = Array.isArray(userRecord.cn)
      ? userRecord.cn[0]
      : userRecord.cn;

    let allowedOUs = [];
    if (userRecord.departmentNumber) {
      const rules = Array.isArray(userRecord.departmentNumber)
        ? userRecord.departmentNumber
        : [userRecord.departmentNumber];
      rules.forEach((rule) => {
        const cleaned = rule.replace("ALLOW:", "").trim();
        allowedOUs.push(...cleaned.split(",").map((s) => s.trim()));
      });
    }

    // 8. Token & Redirect
    const token = generateToken({ uid, role: role.toUpperCase(), allowedOUs });
    const frontendUrl = process.env.FRONTEND_URL ;
    const targetUrl = `${frontendUrl}/dashboard?token=${token}`;

    await logAction(
      req,
      "LOGIN",
      uid,
      role,
      "ACTIVE",
      "Logged in via LDAP Bind",
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      redirectUrl: targetUrl,
      data: { token, role: role.toUpperCase(), name, redirectUrl: targetUrl },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return errorResponse(res, "Internal Server Error", 500);
  } finally {
    if (adminClient) adminClient.unbind();
  }
};

exports.logout = async (req, res, tokenBlacklist) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.body.token;
        let uid = req.user?.uid;

        if (token) {
            // 1. Blacklist in memory
            if (tokenBlacklist) tokenBlacklist.add(token);

            // 2. Extract the UID
            if (!uid) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    uid = decoded.uid;
                } catch (e) {
                    console.log("Could not decode token to find UID for logout.");
                }
            }

            // 3. Update using NODE.JS time, not Postgres time!
            if (uid) {
                try {
                    await sequelize.query(
                        `UPDATE ldap_user_active_log 
                         SET logout_time = :logoutTime 
                         WHERE id = (
                             SELECT id FROM ldap_user_active_log 
                             WHERE ldap_uid = :uid AND logout_time IS NULL 
                             ORDER BY login_time DESC LIMIT 1
                         )`, 
                        { 
                            // 🚨 THE FIX: new Date() forces it to use your local IST time
                            replacements: { uid: uid, logoutTime: new Date() },
                            type: sequelize.QueryTypes.UPDATE
                        }
                    );
                } catch (dbErr) {
                    console.error("Logout DB Update Error (Non-Fatal):", dbErr.message);
                }
            }
        }

        // 4. Record the audit log
        const logRole = req.user?.role || "USER";
        await logAction(req, "LOGOUT", uid || "UNKNOWN", logRole, "ACTIVE", "User logged out");
        
        return successResponse(res, null, "Logout successful");
    } catch (err) {
        console.error("Logout Error:", err);
        return errorResponse(res, "Error logging logout", 500);
    }
};

exports.requestOtp = async (req, res) => {
  console.log("Frontend sent to Request OTP:", req.body);
  const identifier =
    req.body.email ||
    req.body.mobile ||
    req.body.phone ||
    req.body.username ||
    req.body.identifier ||
    Object.values(req.body)[0];

  if (!identifier)
    return res.status(400).json({ message: "Identifier missing" });

  const adminClient = createClient();
  try {
    await bind(
      adminClient,
      process.env.LDAP_BIND_DN,
      process.env.LDAP_BIND_PASSWORD,
    );
    const filter = `(|(mail=${identifier})(mobile=${identifier}))`;
    const searchResult = await search(adminClient, process.env.LDAP_ORG_BASE, {
      scope: "sub",
      filter: filter,
      attributes: ["uid"],
    });

    if (searchResult.length === 0)
      return res.status(404).json({ message: "User not found in Directory" });

    req.session.pendingUid = Array.isArray(searchResult[0].uid)
      ? searchResult[0].uid[0]
      : searchResult[0].uid;
    return res.status(200).json({ message: "OTP Sent", success: true });
  } catch (err) {
    console.error("OTP Request Error:", err);
    return res.status(500).json({ message: "Server Error" });
  } finally {
    adminClient.unbind();
  }
};

exports.verifyOtp = async (req, res) => {
  console.log("Frontend sent to Verify OTP:", req.body);
  const otp =
    req.body.otp ||
    req.body.code ||
    req.body.otpCode ||
    Object.values(req.body)[0];
  const pendingUid = req.session.pendingUid;

  if (!pendingUid)
    return res
      .status(400)
      .json({ message: "Session expired, request OTP again" });
  const validOtp = process.env.DEFAULT_OTP;
  if (String(otp) !== validOtp)
    return res.status(400).json({ message: "Invalid OTP" });

  const adminClient = createClient();
  try {
    await bind(
      adminClient,
      process.env.LDAP_BIND_DN,
      process.env.LDAP_BIND_PASSWORD,
    );
    const searchResult = await search(adminClient, process.env.LDAP_ORG_BASE, {
      scope: "sub",
      filter: `(uid=${pendingUid})`,
      attributes: ["businessCategory", "cn", "departmentNumber"],
    });

    const userRecord = searchResult[0];
    const role = Array.isArray(userRecord.businessCategory)
      ? userRecord.businessCategory[0]
      : userRecord.businessCategory || "USER";
    const name = Array.isArray(userRecord.cn)
      ? userRecord.cn[0]
      : userRecord.cn;

    let allowedOUs = [];
    if (userRecord.departmentNumber) {
      const rules = Array.isArray(userRecord.departmentNumber)
        ? userRecord.departmentNumber
        : [userRecord.departmentNumber];
      rules.forEach((rule) => {
        const cleaned = rule.replace("ALLOW:", "").trim();
        allowedOUs.push(...cleaned.split(",").map((s) => s.trim()));
      });
    }

    const token = generateToken({
      uid: pendingUid,
      role: role.toUpperCase(),
      allowedOUs,
    });
    req.session.pendingUid = null;

    // 🚨 Build the explicit redirect URL with the token attached
    const frontendUrl = process.env.FRONTEND_URL;
    const targetUrl = `${frontendUrl}/dashboard?token=${token}`;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token: token,
      redirectUrl: targetUrl,
      url: targetUrl,
      data: { token, role: role.toUpperCase(), name, redirectUrl: targetUrl },
    });
  } catch (err) {
    console.error("OTP Verify Error:", err);
    return res.status(500).json({ message: "Server Error" });
  } finally {
    adminClient.unbind();
  }
};
