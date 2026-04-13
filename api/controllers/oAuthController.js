const jwt = require("jsonwebtoken");
const axios = require("axios");
const crypto = require("crypto");
const { encryptToken } = require("../utils/Crypto");
const { completeLoginAndRedirect } = require("./authController");

const { JWT_SECRET, FRONTEND_URL, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, BACKEND_URL } = process.env;

exports.googleCallback = async (req, res) => {
  try {
    // ✅ Decode the state value you passed
    const serviceKey = decodeURIComponent(req.query.state || "default");
    
    // Continue your existing flow
    await completeLoginAndRedirect(req, res, req.user, serviceKey);
  } catch (err) {
    console.error("Google Callback Error:", err);
    res.redirect(`${process.env.FRONTEND_URL}/auth/failure`);
  }
};

exports.facebookCallback = (req, res) => {
  const profile = req.user.profile;

  const payload = {
    sub: profile.id,
    provider: "facebook",
    name: profile.displayName,
    iss: BACKEND_URL,
    aud: FRONTEND_URL,
    jti: crypto.randomUUID(),
  };

  const token = jwt.sign(payload, JWT_SECRET, { algorithm: "HS512", expiresIn: "1h" });
  const encryptedToken = encryptToken(token);
  const redirectBase = FRONTEND_URL || "http://localhost:5174";
  res.redirect(`${redirectBase}/auth/callback?token=${encodeURIComponent(encryptedToken)}`);
};

exports.linkedinCallback = async (req, res) => {
  const code = req.query.code;
  try {
    const REDIRECT_URI = "http://localhost:5000/auth/linkedin/callback";
    const tokenRes = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const accessToken = tokenRes.data.access_token;

    const [profileRes, emailRes] = await Promise.all([
      axios.get("https://api.linkedin.com/v2/me", { headers: { Authorization: `Bearer ${accessToken}` } }),
      axios.get("https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))", { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);

    const userData = {
      id: profileRes.data.id,
      name: `${profileRes.data.localizedFirstName} ${profileRes.data.localizedLastName}`,
      email: emailRes.data.elements[0]["handle~"].emailAddress,
    };

    const token = jwt.sign(userData, JWT_SECRET, { expiresIn: "1h" });
    res.redirect(`${FRONTEND_URL}/login-success?token=${token}`);
  } catch (err) {
    console.error("LinkedIn login error:", err);
    res.status(500).send("LinkedIn login failed");
  }
};
