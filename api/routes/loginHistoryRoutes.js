const express = require("express");
const router = express.Router();
const validateEncryptedRequest = require("../middlewares/validateEncryptedRequest");

const loginHistoryController = require("../controllers/loginHistoryController");

// 🔐 Login History (Mobile - Encrypted Request)

router.post(
  "/data",
  validateEncryptedRequest({ requireDevice: true }),
  loginHistoryController.getLoginHistory
);

router.post(
  "/recent",
  validateEncryptedRequest({ requireDevice: true }),
  loginHistoryController.getLastFiveLogins
);

router.post(
  "/secure-login-history",
  validateEncryptedRequest({ requireDevice: true }),
  loginHistoryController.getLastWeekLogins
);

router.post(
  "/login-history",
  validateEncryptedRequest(), // default false
  loginHistoryController.getLastWeekLogins
);
router.post(
  "/login-history-data",
  validateEncryptedRequest(), // default false
  loginHistoryController.getLoginHistoryData
);
module.exports = router;