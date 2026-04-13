const Service = require("./Service");
const ServiceLdapSetting = require("./ServiceLdapSetting");
const SmsOtpLog = require("./smsOtpLog");
const LoginToken = require("./loginToken");
const LoginAuditLog = require("./loginAuditLog");
const UserDevices = require("./UserDevices");
const UserTOTP = require("./UserTOTP");


// --------------------
// Service ↔ LDAP Setting
// --------------------
Service.hasOne(ServiceLdapSetting, {
  foreignKey: "service_id",
  as: "ldapSetting",
});

ServiceLdapSetting.belongsTo(Service, {
  foreignKey: "service_id",
  as: "service",
});


// --------------------
// Service ↔ LoginToken (IMPORTANT FOR JOIN)
// --------------------
Service.hasMany(LoginToken, {
  foreignKey: "service_id",
  as: "login_tokens",
});

LoginToken.belongsTo(Service, {
  foreignKey: "service_id",
  as: "service",
});


// --------------------
// LoginToken ↔ Audit Log
// --------------------
LoginToken.hasMany(LoginAuditLog, {
  foreignKey: "token_id",
  as: "audit_logs",
});

LoginAuditLog.belongsTo(LoginToken, {
  foreignKey: "token_id",
  as: "login_token",
});


module.exports = {
  Service,
  ServiceLdapSetting,
  SmsOtpLog,
  LoginToken,
  LoginAuditLog,
  UserDevices,
  UserTOTP,
};