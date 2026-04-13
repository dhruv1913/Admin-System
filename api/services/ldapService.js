const ldap = require("ldapjs");
const AppError = require("../utils/appError");

/**
 * Check if a user exists in LDAP
 */
async function checkUserExists(
  identifier,
  { ldap_url, base_dn, bind_dn, password, ou },
  { fetchPhoto = false, allowUidSearch = false }={}
) {
  const client = ldap.createClient({ url: ldap_url });


  try {
    /* ==============================
       🔐 ADMIN BIND
    ============================== */
    await new Promise((resolve, reject) => {
      client.bind(bind_dn, password, (err) => {
        if (err) {
          return reject(new AppError("LDAP admin bind failed", 500));
        }
        resolve();
      });
    });


const safeIdentifier = identifier.toLowerCase().trim();

let searchFilter;

const isEmail = safeIdentifier.includes("@");
const isMobile = /^[0-9]{10}$/.test(safeIdentifier);

/* ==============================
   🎯 SEARCH PRIORITY LOGIC
============================== */

if (isMobile) {
  // 📱 Mobile search
  searchFilter = `(&(mobile=${safeIdentifier})(employeeType=ACTIVE))`;
}
else if (isEmail) {
  // 📧 Email OR Secondary Mail search
  searchFilter = `(&(|(mail=${safeIdentifier})(description=secondaryMail=${safeIdentifier}))(employeeType=ACTIVE))`;
}
else if (allowUidSearch) {
  // 👤 UID search only if explicitly allowed
  searchFilter = `(&(uid=${safeIdentifier})(employeeType=ACTIVE))`;
}
else {
  throw new AppError("UID search not allowed", 400);
}

console.log("LDAP Filter:", searchFilter);


    const searchAttributes = [
      "uid",
      "givenName",
      "cn",
      "sn",
      "mobile",
      "title",
      "description",
      "mail",
      "businessCategory",
    ];

    

    const searchBase = ou ? `ou=${ou},${base_dn}` : base_dn;

    const userData = await new Promise((resolve, reject) => {
      let data = { userExists: false };

      client.search(
        searchBase,
        { scope: "sub", filter: searchFilter, attributes: searchAttributes },
        (err, res) => {
          if (err) {
            return reject(new AppError("LDAP search error", 500));
          }

          res.on("searchEntry", (entry) => {
            const getAttr = (type) => {
              const attr = entry.attributes.find(a => a.type === type);
              return attr?.vals?.length ? String(attr.vals[0]).trim() : "";
            };

            /* ==============================
               🧾 DESCRIPTION HANDLING
            ============================== */
            const descriptions = entry.attributes
              .filter(a => a.type === "description")
              .flatMap(a => a.vals || [])
              .map(v => v.trim());

            const secondaryEmails = descriptions
              .filter(v => v.startsWith("secondaryMail="))
              .map(v => v.replace("secondaryMail=", ""));

            const department =
              descriptions.find(d => !d.startsWith("secondaryMail=")) || "";

            /* ==============================
               👤 NAME LOGIC
            ============================== */
            const cn = getAttr("cn");
            const firstName = getAttr("givenName") || cn.split(" ")[0] || "";
            const lastName =
              getAttr("sn") || cn.split(" ").slice(1).join(" ");
            const fullName = [firstName, lastName].filter(Boolean).join(" ");
            

            data = {
              userExists: true,
              userName: getAttr("uid"),
              mobileNumber: getAttr("mobile"),
              firstName,
              lastName,
              fullName,
              title: getAttr("title"),
              description: department,
              email: getAttr("mail"),
              secondaryEmails,
              picture: null,
              role:getAttr("businessCategory"),
            };

            console.log("✅ LDAP user found:", data);
          });

          res.on("error", () =>
            reject(new AppError("LDAP stream error", 500))
          );

          res.on("end", () => {
            console.log("✅ LDAP search completed final:", data);
            resolve(data);
          });
        }
      );
    });

    return userData;
  } catch (err) {
    throw err;
  } finally {
    try {
      client.unbind();
    } catch (e) {}
  }
}

module.exports = { checkUserExists };
