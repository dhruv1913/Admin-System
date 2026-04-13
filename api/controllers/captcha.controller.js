const { generateCaptcha } = require("../utils/captcha.util");

exports.getCaptcha = async (req, res) => {
  try {
    const captcha = generateCaptcha();
    
    req.session.captcha = captcha.text;
    req.session.captchaAt = Date.now();
    
    console.log("🎨 CAPTCHA GENERATED");
    console.log("  Session ID:", req.sessionID);
    console.log("  Captcha text:", captcha.text);
    console.log("  showCaptcha:", req.session.showCaptcha);
    
    // 🔥 PROPERLY save to Redis
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error("❌ Captcha save failed:", err);
          reject(err);
        } else {
          console.log("✅ Captcha saved to Redis");
          resolve();
        }
      });
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // ⭐

    res.status(200).send(captcha.data);
  } catch (err) {
    console.error("🔥 Captcha generation error:", err);
    res.status(500).json({ error: "Failed to generate captcha" });
  }
};

exports.captchaStatus = (req, res) => {
  res.json({
    showCaptcha: !!req.session.showCaptcha
  });
};

