module.exports = {
  url: process.env.LDAP_URL || "ldap://127.0.0.1:3891",
  baseDN: process.env.LDAP_BASE_DN || "dc=mycompany,dc=com",
  bindDN: process.env.LDAP_BIND_DN || "uid=admin,ou=system", // Update this line!
  bindPassword: process.env.LDAP_BIND_PASSWORD || "admin123",
};
