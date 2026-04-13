const express = require("express");
const router = express.Router();

const totpController = require("../controllers/totpController");

router.post("/generate", totpController.generate);
router.post("/validate", totpController.validate);

module.exports = router;
