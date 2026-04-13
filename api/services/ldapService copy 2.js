const ldap = require("ldapjs");
const AppError = require("../utils/appError");

/**
 * Check if a user exists in LDAP
 */
async function checkUserExists(
  identifier,
  { ldap_url, base_dn, bind_dn, password, ou },
  fetchPhoto = false
) {
  const client = ldap.createClient({ url: ldap_url });

  /* ===============================
     Helper: jpegPhoto → base64
  ============================== */
  const getPhotoBase64 = (entry) => {
    const photoAttr = entry.attributes.find(
      (a) => a.type === "jpegPhoto"
    );
    if (!photoAttr || !photoAttr.vals || !photoAttr.vals.length) {
      return null;
    }

    const raw = photoAttr.vals[0];
    if (Buffer.isBuffer(raw)) {
      return raw.toString("base64");
    }
    return Buffer.from(raw, "binary").toString("base64");
  };

  try {
    /* ===============================
       ADMIN BIND
    ============================== */
    await new Promise((resolve, reject) => {
      client.bind(bind_dn, password, (err) => {
        if (err) {
          return reject(
            new AppError("LDAP admin bind failed", 500)
          );
        }
        resolve();
      });
    });

    const safeIdentifier = identifier.toLowerCase().trim();

    /* ===============================
       LDAP FILTER
    ============================== */
    const searchFilter = `(&(|(mail=${safeIdentifier})(mobile=${safeIdentifier})(description=*secondaryMail=${safeIdentifier}*))(employeeType=ACTIVE))`;

    const searchAttributes = [
      "uid",
      "givenName",
      "cn",
      "sn",
      "mobile",
      "title",
      "description",
      "mail",
    ];

    if (fetchPhoto) searchAttributes.push("jpegPhoto");

    const searchBase = ou
      ? `ou=${ou},${base_dn}`
      : base_dn;

    /* ===============================
       LDAP SEARCH
    ============================== */
    const userData = await new Promise((resolve, reject) => {
      let data = { userExists: false };

      client.search(
        searchBase,
        {
          scope: "sub",
          filter: searchFilter,
          attributes: searchAttributes,
          sizeLimit: 1, // ✅ first match only
        },
        (err, res) => {
          if (err) {
            return reject(
              new AppError("LDAP search error", 500)
            );
          }

          res.on("searchEntry", (entry) => {
            if (data.userExists) return;

            const getAttr = (type) => {
              const attr = entry.attributes.find(
                (a) => a.type === type
              );
              return attr?.vals?.length
                ? String(attr.vals[0]).trim()
                : "";
            };

            const descriptions = entry.attributes
              .filter((a) => a.type === "description")
              .flatMap((a) => a.vals)
              .map((v) => v.trim());

            const secondaryEmails = descriptions
              .filter((v) =>
                v.startsWith("secondaryMail=")
              )
              .map((v) =>
                v.replace("secondaryMail=", "")
              );

            const department =
              descriptions.find(
                (d) => !d.startsWith("secondaryMail=")
              ) || "";

            const cn = getAttr("cn");
            const firstName =
              getAttr("givenName") ||
              cn.split(" ")[0] ||
              "";
            const lastName =
              getAttr("sn") ||
              cn.split(" ").slice(1).join(" ");
            const fullName = [firstName, lastName]
              .filter(Boolean)
              .join(" ");

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
              picture: fetchPhoto
                ? getPhotoBase64(entry)
                : null,
            };
          });

          res.on("error", () =>
            reject(
              new AppError("LDAP stream error", 500)
            )
          );

          res.on("end", () => {
            console.log(
              "LDAP search completed:",
              data
            );
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
