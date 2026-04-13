const { LoginToken } = require("../models");
const { Op } = require("sequelize");

// ============================================
// 📌 Common Session Formatter
// ============================================
const formatSession = (session) => ({
  login_time: session.login_time,
  logout_time: session.logout_time,
  status: session.status,
  provider: session.provider,
  ip: session.ip_address,

  // Raw user agent
  user_agent: session.user_agent,

  // Structured fields
  browser: session.browser,
  browser_version: session.browser_version,
  os: session.os,
  device_type: session.device_type,
});

// ============================================
// 📜 Get Last 2 Logins
// Route: /data
// ============================================
exports.getLoginHistory = async (req, res) => {
  try {
    const { ldap_uid, service_id, device_id, service } = req.user;

    const sessions = await LoginToken.findAll({
      where: {
        username: ldap_uid,
        service_id,
        provider: "MOBILE_APP", // Only mobile logins for this endpoint

      },
      order: [["login_time", "DESC"]],
      limit: 2,
    });

    const current = sessions[0] || null;
    const previous = sessions[1] || null;

    return res.json({
      ldap_uid,
      device_id,
      service,
      current_login: current ? formatSession(current) : null,
      previous_login: previous ? formatSession(previous) : null,
    });
  } catch (error) {
    console.error("❌ LOGIN HISTORY ERROR:", error);
    return res.status(500).json({
      message: "Login history fetch failed",
    });
  }
};

// ============================================
// 📜 Get Last 5 Logins
// Route: /recent
// ============================================
exports.getLastFiveLogins = async (req, res) => {
  try {
    const { ldap_uid, service_id, device_id, service } = req.user;

    const sessions = await LoginToken.findAll({
      where: {
        username: ldap_uid,
        service_id,
      },
      order: [["login_time", "DESC"]],
      limit: 5,
    });

    return res.json({
      ldap_uid,
      device_id,
      service,
      recent_logins: sessions.map(formatSession),
    });
  } catch (error) {
    console.error("❌ LAST FIVE LOGIN ERROR:", error);
    return res.status(500).json({
      message: "Last five login fetch failed",
    });
  }
};

// ============================================
// 📜 Get Last Week Logins
// Route: /login-history & /secure-login-history
// ============================================
exports.getLastWeekLogins = async (req, res) => {
  try {
    const { ldap_uid, service_id, device_id, service } = req.user;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const sessions = await LoginToken.findAll({
      where: {
        username: ldap_uid,
        service_id,
        login_time: {
          [Op.gte]: startDate,
        },
      },
      order: [["login_time", "DESC"]],
    });

    return res.json({
      ldap_uid,
      device_id,
      service,
      filter: "last_7_days",
      total_sessions: sessions.length,
      sessions: sessions.map(formatSession),
    });
  } catch (error) {
    console.error("❌ LAST WEEK LOGIN ERROR:", error);
    return res.status(500).json({
      message: "Last week login fetch failed",
    });
  }
};

exports.getLoginHistoryData = async (req, res) => {
  try {

    const { ldap_uid, service_id, device_id, service, filter, from, to } = req.user;

    let whereCondition = {
      username: ldap_uid,
      service_id,
    };

    let limit = null;

    // ============================
    // DEFAULT FILTER (if null)
    // ============================

    const appliedFilter = filter || "7days";

    // ============================
    // FILTER LOGIC
    // ============================

    if (appliedFilter === "recent") {
      const start = new Date();
      start.setHours(0,0,0,0);

      whereCondition.login_time = {
        [Op.gte]: start
      };
    }

    if (appliedFilter === "7days") {
      const start = new Date();
      start.setDate(start.getDate() - 7);

      whereCondition.login_time = {
        [Op.gte]: start,
      };
    }

    if (appliedFilter === "15days") {
      const start = new Date();
      start.setDate(start.getDate() - 15);

      whereCondition.login_time = {
        [Op.gte]: start,
      };
    }

    if (appliedFilter === "30days") {
      const start = new Date();
      start.setDate(start.getDate() - 30);

      whereCondition.login_time = {
        [Op.gte]: start,
      };
    }

    if (appliedFilter === "custom") {

      if (!from || !to) {
        return res.status(400).json({
          message: "from and to required for custom filter"
        });
      }

      const fromDate = new Date(from);
      const toDate = new Date(to);
      toDate.setHours(23,59,59,999);

      whereCondition.login_time = {
        [Op.between]: [fromDate, toDate],
      };
    }

    // ============================
    // QUERY
    // ============================

    const sessions = await LoginToken.findAll({
      where: whereCondition,
      order: [["login_time", "DESC"]],
      limit: limit || undefined,
    });

    return res.json({
      ldap_uid,
      device_id,
      service,
      filter: appliedFilter,
      total_sessions: sessions.length,
      sessions: sessions.map(formatSession),
    });

  } catch (error) {
    console.error("❌ LOGIN HISTORY ERROR:", error);

    return res.status(500).json({
      message: "Login history fetch failed",
    });
  }
};