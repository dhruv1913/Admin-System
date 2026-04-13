// server.js or routes/sms.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

router.post("/send-otp", async (req, res) => {
  const { mobile, otp } = req.body;

  if (!mobile || !otp) {
    return res.status(400).json({ success: false, message: "Mobile and OTP required" });
  }

  const message = `OTP for secure login is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone. - SMSHUB`;

  const url = "https://www.smsgatewayhub.com/api/mt/SendSMS";

  try {
    const response = await axios.get(url, {
      params: {
        APIKey: process.env.SMS_API_KEY,        // keep in .env
        senderid: "senderid",
        channel: 2,
        DCS: 0,
        flashsms: 0,
        number: mobile,
        text: message,
        route: 1,
        EntityId: "434344444444",
        dlttemplateid: "432434234324324324",
      },
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("SMS Error:", error.message);
    res.status(500).json({ success: false, message: "Failed to send SMS" });
  }
});

module.exports = router;
