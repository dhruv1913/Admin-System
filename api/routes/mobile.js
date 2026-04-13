const express = require("express");
const router = express.Router();

const { verifyMobileOtp,mobileLogout } = require("../controllers/mobileOtpController");

// POST /mobile/verify-otp
router.post("/verify-otp", verifyMobileOtp);

// POST /mobile/logout
router.post("/logout", mobileLogout);

module.exports = router;
