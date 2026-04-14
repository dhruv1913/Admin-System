require("dotenv").config(); // 🚨 ADD THIS LINE AT THE VERY TOP
const ldap = require("ldapjs");

const client = ldap.createClient({
  url: process.env.LDAP_URL
});

client.bind(
  process.env.LDAP_BIND_DN,
  process.env.LDAP_BIND_PASSWORD,
  (err) => {
    if (err) {
      console.error("LDAP Bind Failed:", err.message);
    } else {
      console.log("LDAP Bind Success");
    }
  }
);

module.exports = client;