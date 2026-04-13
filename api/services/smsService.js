const axios = require("axios");

exports.sendOtpSms = async ({ mobile, otp }) => {
  const url = "https://www.smsgatewayhub.com/api/mt/SendSMS";

  const message = `OTP for secure login is ${otp}. Valid for 5 minutes. Do not share this OTP with anyone. - YUKTIAUTH`;

  const response = await axios.get(url, {
    params: {
      APIKey: process.env.SMS_API_KEY,
      senderid: process.env.SMS_SENDER_ID,
      channel: 2,
      DCS: 0,
      flashsms: 0,
      number: mobile,
      text: message,
      route: 1,
      EntityId: process.env.SMS_ENTITY_ID,
      dlttemplateid: process.env.SMS_TEMPLATE_ID,
    },
    timeout: 10000,
  });

  return response.data;
};
// 🔹 New method: Device/Mobile Registration Alert SMS
exports.sendRegistrationAlertSms = async ({ mobile }) => {
  const url = "https://www.smsgatewayhub.com/api/mt/SendSMS";

  const message = `Alert - Your device has been successfully registered for authentication in YuktiAuth. - YUKTIAUTH`;

  const response = await axios.get(url, {
    params: {
      APIKey: process.env.SMS_API_KEY,
      senderid: process.env.SMS_SENDER_ID,
      channel: 2,
      DCS: 0,
      flashsms: 0,
      number: mobile,
      text: message,
      route: 1,
      EntityId: process.env.SMS_ENTITY_ID,
      // 🔸 Registration alert ke liye alag DLT template ID use karein
      dlttemplateid: process.env.SMS_REG_TEMPLATE_ID,
    },
    timeout: 10000,
  });
//console.log('SMS Response:', response.data);
  return response.data;
};
// 🔹 New method: Change in Registered Device Alert SMS
exports.sendDeviceChangeAlertSms = async ({ mobile }) => {
  const url = "https://www.smsgatewayhub.com/api/mt/SendSMS";

  const message = `Alert - A change in your registered device for authentication was detected. If not initiated by you, contact support immediately. - YUKTIAUTH`;

  const response = await axios.get(url, {
    params: {
      APIKey: process.env.SMS_API_KEY,
      senderid: process.env.SMS_SENDER_ID,
      channel: 2,
      DCS: 0,
      flashsms: 0,
      number: mobile,
      text: message,
      route: 1,
      EntityId: process.env.SMS_ENTITY_ID,
      // 🔸 Device change alert ke liye alag DLT template ID
      dlttemplateid: process.env.SMS_DEVICE_CHANGE_TEMPLATE_ID,
    },
    timeout: 10000,
  });

  return response.data;
};