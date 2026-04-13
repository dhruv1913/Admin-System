const {
    Service,
    ServiceLdapSetting,
    UserDevices,
} = require("../models");

const { rsaDecryptKey, aesDecrypt } = require("../utils/Crypto");
const { checkUserExists } = require("../services/ldapService");

// ✅ Pass option: { requireDevice: true/false }
const validateEncryptedRequest = (options = {}) => {
    return async (req, res, next) => {
        try {
            const { requireDevice = false } = options;

            const { iv, key, payload } = req.body;

            if (!iv || !key || !payload) {
                return res.status(400).json({
                    message: "Invalid or tampered request.",
                });
            }

            // 🔑 Decrypt AES key
            const aesKey = rsaDecryptKey(key);
            if (!aesKey) {
                return res.status(400).json({
                    message: "Invalid encryption key.",
                });
            }

            // 🔓 Decrypt payload
            const decryptedStr = aesDecrypt(payload, aesKey, iv);
            if (!decryptedStr) {
                return res.status(400).json({
                    message: "Invalid or tampered payload.",
                });
            }

            // const { ldap_uid, service_id, device_id } =
            //     JSON.parse(decryptedStr);


            const { ldap_uid, service_id, device_id, filter, from, to } =
                JSON.parse(decryptedStr);

            if (!ldap_uid || !service_id) {
                return res.status(400).json({
                    message: "ldap_uid and service_id are required",
                });
            }

            // --------------------------------------------------
            // 🔒 OPTIONAL DEVICE VALIDATION
            // --------------------------------------------------
            if (requireDevice) {
                if (!device_id) {
                    return res.status(400).json({
                        message: "device_id is required",
                    });
                }

                const device = await UserDevices.findOne({
                    where: {
                        ldap_uid,
                        device_id,
                        is_active: true,
                    },
                });

                if (!device) {
                    return res.status(403).json({
                        message: "Device not registered or inactive",
                    });
                }
            }

            // 🔹 Validate Service
            const service = await Service.findOne({
                where: { id: service_id, is_active: true },
                attributes: ["id", "service_name", "department_name"],
            });

            if (!service) {
                return res.status(404).json({
                    message: "Invalid service_id",
                });
            }

            // 🔹 Verify LDAP User
            const settings = await ServiceLdapSetting.findOne({
                where: { service_id: service.id },
            });

            if (!settings || !settings.ldap_url) {
                return res.status(500).json({
                    message: "LDAP settings not found",
                });
            }

            const ldapResult = await checkUserExists(ldap_uid, settings, {
                allowUidSearch: true,
            });

            if (!ldapResult.userExists) {
                return res.status(404).json({
                    message: "User not found in LDAP",
                });
            }

            // ✅ Attach verified data
            req.user = {
                ldap_uid,
                service_id,
                device_id,
                service,
                filter,
                from,
                to
            };

            next();
        } catch (error) {
            console.error("Validation Middleware Error:", error);
            return res.status(500).json({
                message: "Request validation failed",
            });
        }
    };
};

module.exports = validateEncryptedRequest;