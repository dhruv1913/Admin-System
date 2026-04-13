// ldap/userService.js
const ldap = require("ldapjs");
const client = require("./ldapClient");

/* ----------------- SEARCH USERS ----------------- */
exports.searchUsers = (filter = "(objectClass=inetOrgPerson)") => {
  return new Promise((resolve, reject) => {
    // ✅ correct baseDN for your LDAP users
    const baseDN = `ou=admin,${process.env.LDAP_BASE_DN}`;

    const opts = {
      scope: "sub",
      filter,
      attributes: ["uid", "cn", "sn", "mail", "mobile", "title", "employeeType"]
    };

    const users = [];

    client.search(baseDN, opts, (err, res) => {
      if (err) return reject(err);
console.log(res);
      res.on("searchEntry", (entry) => {
        const obj = entry.object || {};

        // 🔥 debug log to see what LDAP actually returns
        console.log("LDAP entry:", obj);

        users.push({
          uid: obj.uid || "",
          name: obj.cn || "",
          email: obj.mail || "",
          mobile: obj.mobile || "",
          title: obj.title || "",
          status: obj.employeeType || ""
        });
      });

      res.on("error", (err) => {
        console.error("LDAP search error:", err);
        reject(err);
      });

      res.on("end", (result) => {
        console.log("LDAP search done. Entries found:", users.length);
        resolve(users);
      });
    });
  });
};
