const jwt = require("jsonwebtoken");
const { encryptToken, decryptToken } = require("../utils/Crypto");
const { BACKEND_URL, FRONTEND_URL, JWT_SECRET, NODE_ENV } = process.env;
const redisClient = require("../utils/redisClient");
const { ServiceLdapSetting, LoginToken, LoginAuditLog, Service } = require("../models");


if (NODE_ENV !== "production") {
  //console.log("Test Encrypt:", encryptToken("HelloWorld123"));
}

// exports.encrypt = (req, res) => {
//   try {
//     const { text } = req.body;
//     console.log(req.body);
//     if (!text) return res.status(400).json({ success: false, error: "Text is required" });
//     const encrypted = encryptToken(text);
//     console.log(encrypted);
//     res.json({ success: true, encrypted });

//   } catch (err) {
//     res.status(500).json({ success: false, error: err.message });
//   }
// };

// exports.decrypt = (req, res) => {
//   try {
//     const { token } = req.body;
//     const decrypted = decryptToken(token);
//     const payload = jwt.verify(decrypted, process.env.JWT_SECRET, {
//       algorithms: ["HS512"],
//       issuer: BACKEND_URL,
//       audience: FRONTEND_URL,
//     });
//     res.json({ valid: true, jwt: decrypted, payload });
//   } catch (err) {
//     res.status(400).json({ valid: false, error: err.message });
//   }
// };


/**
 * 🔐 Encrypt arbitrary text
 */
exports.encrypt = (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: "Text is required" });
    }

    const encrypted = encryptToken(text);
    return res.json({ success: true, encrypted });
  } catch (err) {
    console.error("Encrypt Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 🔓 Decrypt an encrypted token & verify JWT (if applicable)
 */
exports.decrypt = (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, error: "Token is required" });
    }

    const decrypted = decryptToken(token);

    let payload = null;
    try {
      payload = jwt.verify(decrypted, JWT_SECRET, {
        algorithms: ["HS512"],
        issuer: BACKEND_URL,
        audience: FRONTEND_URL,
      });
    } catch (err) {
      // token decrypted but not a valid JWT
      return res.status(400).json({ valid: false, error: "Invalid or expired JWT" });
    }

    return res.json({ valid: true, jwt: decrypted, payload });
  } catch (err) {
    console.error("Decrypt Error:", err);
    return res.status(400).json({ valid: false, error: err.message });
  }
};

/**
 * 📘 Read Authorization header, decrypt token & verify JWT
 */
exports.tokenRead = (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader)
      return res.status(401).json({ error: "No token provided" });

    const encryptedToken = authHeader.split(" ")[1];
    if (!encryptedToken)
      return res.status(401).json({ error: "Token malformed" });

    // 🔹 Step 1: Decrypt the token
    let decrypted;
    try {
      decrypted = decryptToken(encryptedToken);
    } catch {
      return res.status(400).json({ error: "Invalid encrypted token" });
    }

    // 🔹 Step 2: Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(decrypted, process.env.JWT_SECRET, {
        algorithms: ["HS512"],
        issuer: process.env.BACKEND_URL,
        audience: process.env.FRONTEND_URL,
      });
      console.log('sanjay decoded value ->>> ',decoded)
    } catch (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // 🔹 Step 3: Send response
    return res.status(200).json({
      valid: true,
      jwt: decrypted, // 🟢 decrypted raw JWT
      data: decoded,  // 🟢 verified payload
    });
  } catch (err) {
    console.error("Token read error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.tokenReads = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    const tokenString =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : req.cookies.auth_token;

    if (!tokenString) {
      return res.status(401).json({ error: "No token provided" });
    }
    
    // 🔹 Get service_key from header
    const serviceKey = req.headers["x-service-key"] || req.cookies?.service_key;
    if (!serviceKey) {
      return res.status(400).json({ error: "Service key required" });
    }

    // 🔹 Fetch service from DB
    const service = await Service.findOne({ where: { service_key: serviceKey } });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const secretKey = service.secret_key;
    if (!secretKey) return res.status(500).json({ error: "Service secret missing" });

    // 🚨 SMART CHECK: Is the token already a Pure JWT or is it encrypted?
    let rawJwtString = null;
    const safeToken = String(tokenString).replace(/ /g, '+');

    // Test 1: Is it a valid JWT string already?
    const initialDecode = jwt.decode(safeToken);
    if (initialDecode && (initialDecode.userId || initialDecode.uid || initialDecode.jti)) {
         rawJwtString = safeToken; // It's already pure!
    } else {
        // Test 2: It must be encrypted. Try to decrypt it.
        const keysToTry = [secretKey, process.env.ENCRYPTION_SECRET, "mySuperSecretKey123!@#4567890abcdef"];
        
        for (let key of keysToTry) {
            if (!key) continue;
            try {
                const cleanKey = String(key).replace(/^["']|["']$/g, '').trim();
                const decryptedAttempt = decryptToken(safeToken, cleanKey);
                if (decryptedAttempt) {
                    rawJwtString = decryptedAttempt;
                    break;
                }
            } catch (err) {
                // Silently fail and try the next key
            }
        }
    }

    if (!rawJwtString) {
        console.error("🚨 tokenReads: Failed to decrypt token or parse as JWT.");
        return res.status(401).json({ error: "Cannot parse or decrypt token" });
    }

    // Now we are guaranteed to have a valid raw JWT string
    const unsafeDecoded = jwt.decode(rawJwtString);
    if (!unsafeDecoded || !unsafeDecoded.aud) {
         return res.status(401).json({ error: "Invalid JWT structure" });
    }

    // Verify the signature
    const decoded = jwt.verify(rawJwtString, process.env.JWT_SECRET, {
      algorithms: ["HS512"],
      issuer: process.env.BACKEND_URL,
      audience: unsafeDecoded.aud
    });

    console.log("sanjay decoded value ->>> ", decoded);

    // 🧱 blacklist check
    const blacklisted = await redisClient.get(`blacklist:${rawJwtString}`);
    if (blacklisted) {
      return res.status(401).json({ error: "Session expired" });
    }

    // 🗄 DB session check
    const session = await LoginToken.findOne({
      where: {
        username: decoded.userId,
        service_id: decoded.service_id,
        access_token: decoded.jti,
        status: "ACTIVE",
      },
    });

    if (!session) {
      return res.status(401).json({ error: "Session not active" });
    }

    // ✅ success 
    const responseObj = {
      valid: true,
      sessionValid: true, 
      jwt: rawJwtString,
      data: decoded,
    };

    const jsonText = JSON.stringify(responseObj);
    const encryptedResponse = encryptToken(jsonText, secretKey);

    return res.json({ 
        valid: true,
        sessionValid: true, 
        payload: encryptedResponse,
        data: decoded 
    });

  } catch (err) {
    console.error("tokenReads error:", err);
    return res.status(401).json({ error: "Invalid session" });
  }
};



