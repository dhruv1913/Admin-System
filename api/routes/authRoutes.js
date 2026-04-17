const express = require("express");
const passport = require("passport");
const {
  checkUser,checkUserLdap,checkUserApp
} = require("../controllers/ldapController");
const { verifyOtp } = require("../controllers/otpController");
const { encrypt, decrypt,tokenRead,tokenReads } = require("../controllers/tokenController");
const {
  googleCallback,
  facebookCallback,
  linkedinCallback,
} = require("../controllers/oAuthController");
const { resendOtp } = require("../controllers/resendOtpController");
const {validateSso,getMe}=require("../controllers/authController");
const { initQr, approveQR, pollStatus } = require("../controllers/qrController");
const{logout,logouts}=require("../controllers/logoutController");
const {getPublicKey }=require("../routes/auth");

// Middlewares
const authMiddleware = require("../middlewares/authMiddleware");
const authController = require('../controllers/authController');

const router = express.Router();

router.get("/public-key", getPublicKey);
router.post('/auth/logout', authController.logout);
// LDAP + OTP
router.post("/checkUser", checkUser);
router.post("/checkUserApp", checkUserApp);
router.post("/checkUserLdap", checkUserLdap);
router.post("/verifyOtp", verifyOtp);
router.post("/resendOtp", resendOtp);
// Add this route
router.post("/validate-sso", validateSso);
// router.post("/logout",logout);


// 🔐 Auth status
router.get("/me", getMe);

/* ---------------- JWT Logout ---------------- */
router.post("/logout", logout);
router.post("/logouts", logouts);

// Token encryption
router.post("/encrypt", encrypt);
router.post("/decrypt", decrypt);
// Token read / verification
router.post("/token/read", tokenRead);
router.post("/token/reads", tokenReads);
// ✅ Dynamic route
router.get("/google", (req, res, next) => {
  const serviceKey = req.query.service || "default";

  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
    state: encodeURIComponent(serviceKey),
  })(req, res, next);
});
router.get("/google/callback", passport.authenticate("google", { failureRedirect: "/auth/failure" }), googleCallback);

// Facebook
router.get("/facebook", passport.authenticate("facebook", { scope: ["email"] }));
router.get("/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/login" }), facebookCallback);



// LinkedIn
router.get("/linkedin", linkedinCallback);

// QR Login
router.post("/qr/init", initQr);
router.post("/approve", approveQR);
router.get("/qr/status/:session_id", pollStatus);

module.exports = router;
