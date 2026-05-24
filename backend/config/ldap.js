module.exports = {
  url: process.env.LDAP_URL || "ldap://localhost:389",
  baseDN: process.env.LDAP_BASE_DN || "dc=adminsystem,dc=com",
  bindDN: process.env.LDAP_BIND_DN || "cn=admin,dc=adminsystem,dc=com",
  bindPassword: process.env.LDAP_BIND_PASSWORD || "admin",
};