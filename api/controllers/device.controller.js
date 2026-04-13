// controllers/device.controller.js
const { UserDevices } = require("../models");
const { rsaDecryptKey, aesDecrypt } = require("../utils/Crypto");

exports.checkDeviceStatus = async (req, res) => {
    //console.log("CONTENT-TYPE:", req.headers["content-type"]);
//console.log("RAW BODY:", req.body);
  try {
    const { iv, key, payload } = req.body;

    if (!iv || !key || !payload) {
      return res.status(400).json({ error: "Invalid or tampered request." });
    }

    // 🔑 1. RSA decrypt AES key
    const aesKey = rsaDecryptKey(key);
    if (!aesKey) {
      return res.status(400).json({ error: "Invalid encryption key." });
    }

    // 🔓 2. AES decrypt payload
    const decryptedStr = aesDecrypt(payload, aesKey, iv);
    if (!decryptedStr) {
      return res.status(400).json({ error: "Invalid or tampered payload." });
    }

    let decryptedData;
    try {
      decryptedData = JSON.parse(decryptedStr);
    } catch {
      return res.status(400).json({ error: "Invalid payload format." });
    }

    const { ldap_uid, device_id } = decryptedData;

    if (!ldap_uid || !device_id) {
      return res.status(400).json({
        message: "ldap_uid and device_id are required",
      });
    }

    // 🔍 Check device status
    const device = await UserDevices.findOne({
      where: {
        ldap_uid,
        device_id,
        is_active: true,
      },
    });

    if (!device) {
      return res.status(200).json({
        active: false,
        message: "Device not registered or inactive",
      });
    }

    return res.status(200).json({
      active: true,
      message: "Device is active",
    });

  } catch (error) {
    console.error("Device check error:", error);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

exports.getAllDevices = async (req, res) => {
  try {

    const { ldap_uid } = req.decrypted;

    if (!ldap_uid) {
      return res.status(400).json({
        message: "ldap_uid is required"
      });
    }

    const devices = await UserDevices.findAll({
      where: { ldap_uid },
      order: [["created_on", "DESC"]]
    });

    return res.json({
      ldap_uid,
      total_devices: devices.length,
      devices
    });

  } catch (error) {

    console.error("Get devices error:", error);

    return res.status(500).json({
      message: "Internal server error"
    });

  }
};
