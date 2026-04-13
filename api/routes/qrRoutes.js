// routes/qrRoutes.js
const express = require("express");
const router = express.Router();
const qrController = require("../controllers/qrController");

// -----------------------------------------------
// QR Login Routes
// -----------------------------------------------

// PC → Generate QR
router.post("/init", qrController.initQr);

// 📱 Mobile → Scan QR
router.post("/scan", qrController.scanQR);   // 👈 ADD THIS

// 📱 Mobile → Approve Login
router.post("/approve", qrController.approveQR);

// 🖥️ PC → Poll status
router.get("/status/:loginId", qrController.pollStatus);

module.exports = router;
