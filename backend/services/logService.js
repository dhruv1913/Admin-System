const pool = require('../config/db');
const sequelize = require('../config/db');
const dbService = require('./dbService');
// =============================
//   HELPER: Parse User Agent
// =============================
function parseUserAgent(ua) {
    let browserName = "Unknown";
    let browserVersion = "Unknown";
    let platform = "Unknown";

    if (!ua) return { browserName, browserVersion, platform };

    if (ua.includes("Windows")) platform = "Windows";
    else if (ua.includes("Mac")) platform = "MacOS";
    else if (ua.includes("Linux")) platform = "Linux";
    else if (ua.includes("Android")) platform = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) platform = "iOS";

    if (ua.includes("Edg/")) {
        browserName = "Edge";
        browserVersion = ua.split("Edg/")[1].split(" ")[0];
    } else if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
        browserName = "Chrome";
        browserVersion = ua.split("Chrome/")[1].split(" ")[0];
    } else if (ua.includes("Firefox/")) {
        browserName = "Firefox";
        browserVersion = ua.split("Firefox/")[1].split(" ")[0];
    } else if (ua.includes("Safari/") && !ua.includes("Chrome/")) {
        browserName = "Safari";
        browserVersion = ua.split("Version/")[1].split(" ")[0];
    }

    return { browserName, browserVersion, platform };
}

// =============================
// HELPER: Clean IP
// =============================
const cleanIP = (ip) => {
    if (!ip) return "127.0.0.1";
    if (ip === "::1") return "127.0.0.1";
    if (ip.includes("::ffff:")) return ip.replace("::ffff:", "");
    return ip;
};

// =============================
// MAIN LOGGER
// =============================
const logAction = async (req, action, uid, role, status, message) => {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const safeMessage = `[${action}] [Role: ${role || 'USER'}] ${message || "System Action"}`;

        // ✅ CLEANED UP: Delegate the query to dbService
        await dbService.insertAuditLog(
            uid || "UNKNOWN",
            ip,
            safeMessage,
            new Date()
        );
    } catch (err) {
        console.error("LOGGER ERROR:", err.message);
    }
};
// =============================
// SIMPLE RETRIEVAL
// =============================
const getSessionLogs = async () => {
    try {
        // 🚨 THE FIX: Query the specific table that exists in the Dashboard DB
        const query = `SELECT * FROM ldap_user_active_log ORDER BY login_time DESC LIMIT 100`;
        
        const result = await sequelize.query(query, { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        return result; 
    } catch (error) {
        console.error("Error fetching session logs:", error.message);
        throw new Error("Failed to fetch session logs");
    }
};

const getAuditLogs = async () => {
    try {
        // 🚨 THE FIX: Query the specific audit table that exists in the Dashboard DB
        const query = `SELECT * FROM ldap_audit_log ORDER BY inserted_on DESC LIMIT 100`;
        
        const result = await sequelize.query(query, { 
            type: sequelize.QueryTypes.SELECT 
        });
        
        return result; 
    } catch (error) {
        console.error("Error fetching audit logs:", error.message);
        throw new Error("Failed to fetch audit logs");
    }
};

module.exports = { logAction, getSessionLogs, getAuditLogs };
