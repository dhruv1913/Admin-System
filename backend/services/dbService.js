// We only need the sequelize import since pool and sequelize point to the same thing
const sequelize = require('../config/db');
const CryptoJS = require('crypto-js');
const secretKey = process.env.JWT_SECRET;

// Securely encrypt the plaintext password to save to DB
const encryptDbPassword = (password) => {
    return CryptoJS.AES.encrypt(password, secretKey).toString();
};

// Decrypt the DB password back to plaintext exactly when requested 
const decryptDbPassword = (encryptedPassword) => {
    try {
        if (!encryptedPassword) return null;
        const decrypted = CryptoJS.AES.decrypt(encryptedPassword, secretKey).toString(CryptoJS.enc.Utf8);
        return decrypted || encryptedPassword; // Fallback to plain if not AES format
    } catch (err) {
        return encryptedPassword; // Legacy plaintext support
    }
};

// ✅ FIXED: Check if a user ID already exists in the database
exports.checkUserExists = async (uid) => {
    const result = await sequelize.query(
        "SELECT id FROM ldap_user_mapping WHERE ldap_uid = :uid", 
        {
            replacements: { uid: uid },
            type: sequelize.QueryTypes.SELECT
        }
    );
    return result.length > 0;
};

// ✅ FIXED: Insert a new user into the database
exports.insertUserMapping = async (uid, password, ipAddress, userDN) => {
    const safePassword = encryptDbPassword(password);
    await sequelize.query(
        "INSERT INTO ldap_user_mapping (ldap_uid, ldap_pwd, ip_address, is_active, ldap_user_dn) VALUES (:uid, :pwd, :ip, TRUE, :dn)",
        {
            replacements: { 
                uid: uid, 
                pwd: safePassword, 
                ip: ipAddress, 
                dn: userDN 
            },
            type: sequelize.QueryTypes.INSERT
        }
    );
};

// ✅ FIXED: Update a user's password in the database
exports.updateUserPassword = async (uid, newPassword) => {
    const safePassword = encryptDbPassword(newPassword);
    await sequelize.query(
        "UPDATE ldap_user_mapping SET ldap_pwd = :pwd, updated_on = NOW() WHERE ldap_uid = :uid",
        {
            replacements: { pwd: safePassword, uid: uid },
            type: sequelize.QueryTypes.UPDATE
        }
    );
};

// Update a user's active/inactive status in the database (Already correct)
exports.updateUserStatus = async (uid, isActive) => {
    await sequelize.query(
        "UPDATE ldap_user_mapping SET is_active = :isActive, updated_on = NOW() WHERE ldap_uid = :uid",
        {
            replacements: { isActive: isActive, uid: uid },
            type: sequelize.QueryTypes.UPDATE
        }
    );
};

// ✅ FIXED: Permanently delete a user from the database
exports.deleteUserMapping = async (uid) => {
    await sequelize.query(
        "DELETE FROM ldap_user_mapping WHERE ldap_uid = :uid", 
        {
            replacements: { uid: uid },
            type: sequelize.QueryTypes.DELETE
        }
    );
};

// ✅ FIXED: Fetch a stored password (used by authController)
exports.getStoredPassword = async (uid) => {
    const result = await sequelize.query(
        "SELECT ldap_pwd FROM ldap_user_mapping WHERE ldap_uid = :uid AND is_active = TRUE",
        {
            replacements: { uid: uid },
            type: sequelize.QueryTypes.SELECT
        }
    );
    return result.length > 0 ? decryptDbPassword(result[0].ldap_pwd) : null;
};



// Update Logout Time securely using your provided query structure
exports.updateLogoutTime = async (uid) => {
    await sequelize.query(
        `UPDATE ldap_user_active_log 
         SET logout_time = :logoutTime 
         WHERE id = (
             SELECT id FROM ldap_user_active_log 
             WHERE ldap_uid = :uid AND logout_time IS NULL 
             ORDER BY login_time DESC LIMIT 1
         )`,
        {
            replacements: { logoutTime: new Date(), uid: uid },
            type: sequelize.QueryTypes.UPDATE
        }
    );
};

// Insert an Audit Log
exports.insertAuditLog = async (uid, ip, msg, time) => {
    await sequelize.query(
        `INSERT INTO ldap_audit_log (ldap_uid, ip_address, audit_msg, inserted_on, updated_on) 
         VALUES (:uid, :ip, :msg, :time, :time)`,
        {
            replacements: { uid, ip, msg, time },
            type: sequelize.QueryTypes.INSERT
        }
    );
};

// Fetch recent Session Logs
exports.getRecentSessionLogs = async () => {
    const result = await pool.query(`
        SELECT * FROM ldap_user_active_log
        ORDER BY id DESC
        LIMIT 1000
    `);
    return result.rows;
};

// Fetch recent Audit Logs
exports.getRecentAuditLogs = async () => {
    const result = await pool.query(`
        SELECT * FROM ldap_audit_log
        ORDER BY id DESC
        LIMIT 1000
    `);
    return result.rows;
};