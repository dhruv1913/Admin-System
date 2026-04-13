const ldap = require("ldapjs");
const AppError = require("../utils/appError");

/**
 * Check if a user exists in LDAP
 * @param {string} identifier - username / email / mobile
 * @param {object} settings - { ldap_url, base_dn, bind_dn, password, ou }
 * @returns {Promise<object>} user data
 */
async function checkUserExists(identifier, { ldap_url, base_dn, bind_dn, password, ou }) {
  console.log(`[LDAP] Creating client for URL: ${ldap_url}`);
  const client = ldap.createClient({ url: ldap_url });

  try {
    // 🔹 Admin Bind
    await new Promise((resolve, reject) => {
      client.bind(bind_dn, password, (err) => {
        if (err) return reject(new AppError("LDAP admin bind failed: " + err, 500));
        console.log("[LDAP] Successfully bound to server as", bind_dn);
        resolve();
      });
    });

    // 🔹 Dynamic search filter
    const searchFilter = `(|(uid=${identifier})(mail=${identifier})(mobile=${identifier}))`;
    const searchOptions = {
      scope: "sub",
      filter: searchFilter,
      attributes: ["uid", "cn", "sn", "mobile", "title", "description", "mail"],
    };

    const searchBase = ou ? `ou=${ou},${base_dn}` : base_dn;
    console.log(`[LDAP] Searching under: ${searchBase}`);

    // 🔹 Perform search
    const userData = await new Promise((resolve, reject) => {
      let data = {
        userExists: false,
        mobilenumber: "",
        name: "",
        cn: "",
        sn: "",
        title: "",
        desc: "",
        mail: "",
        message: "",
      };

      client.search(searchBase, searchOptions, (err, res) => {
        if (err) return reject(new AppError("LDAP search error: " + err, 500));

        res.on("searchEntry", (entry) => {
          const getAttr = (type) => {
            const attr = entry.attributes.find((a) => a.type === type);
            return attr ? String(attr.vals[0]) : "";
          };

          data = {
            userExists: true,
            mobilenumber: getAttr("mobile"),
            name: getAttr("uid"),
            cn: getAttr("cn"),
            sn: getAttr("sn"),
            title: getAttr("title"),
            desc: getAttr("description"),
            mail: getAttr("mail"),
            message: `[LDAP] Found user in ${ou || "base DN"}`,
          };
        });
       
        res.on("error", (err) => reject(new AppError("LDAP search stream error: " + err, 500)));

        res.on("end", () => resolve(data));
      });
    });

    return userData;
  } catch (err) {
    throw err; // propagate AppError
  } finally {
    client.unbind();
    console.log("[LDAP] Connection unbound successfully");
  }
}

module.exports = { checkUserExists };
