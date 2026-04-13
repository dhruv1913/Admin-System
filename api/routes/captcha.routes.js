const express = require("express");
const router = express.Router();
const { getCaptcha,captchaStatus } = require("../controllers/captcha.controller");

router.get("/captcha", getCaptcha);
router.get("/status",captchaStatus);


module.exports = router;
