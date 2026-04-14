const ldap = require("ldapjs");
const ldapConfig = require("../config/ldap");

// 1. Accept the dynamic database URL
exports.createClient = (dynamicUrl) => {
  const finalUrl = dynamicUrl || ldapConfig.url ;
  const client = ldap.createClient({ url: finalUrl });

  // Catch connection errors so the server doesn't crash!
  client.on("error", (err) => {
    console.error("⚠️ LDAP Client Error Caught:", err.message);
  });

  return client;
};

// 2. Bind to the LDAP server
exports.bind = (client, dn, password) => {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// 3. Perform an LDAP search
exports.search = (client, base, options) => {
  return new Promise((resolve, reject) => {
    client.search(base, options, (err, res) => {
      if (err) return reject(err);
      const entries = [];
      res.on("searchEntry", (entry) => {
        const obj = { dn: entry.dn.toString() };
        entry.attributes.forEach((attr) => {
          obj[attr.type] = attr.values;
        });
        entries.push(obj);
      });
      res.on("error", (err) => reject(err));
      res.on("end", () => resolve(entries));
    });
  });
};

// 4. THE FIX: The missing function that connects your DB to LDAP
// 4. THE FIX: The missing function that connects your DB to LDAP
exports.checkUserExists = async (username, settings) => {
  const client = exports.createClient(settings.ldap_url);

  try {
    await exports.bind(client, settings.bind_dn, settings.password);

    // 🚨 ADDED businessCategory and departmentNumber to attributes
    const searchOptions = {
      scope: "sub",
      filter: `(|(uid=${username})(mail=${username})(mobile=${username}))`,
      attributes: [
        "uid", "mobile", "givenName", "sn", "cn", "mail", "title", "jpegPhoto",
        "businessCategory", "departmentNumber" 
      ],
    };

    const entries = await exports.search(client, settings.base_dn, searchOptions);

    if (entries.length === 0) {
      return { userExists: false };
    }

    const user = entries[0];
    const getVal = (attr) => (Array.isArray(attr) ? attr[0] : attr || "");

    // 🚨 Clean up the permissions array so the dashboard can read it
    let allowedOUs = [];
    if (user.departmentNumber) {
        allowedOUs = Array.isArray(user.departmentNumber) ? user.departmentNumber : [user.departmentNumber];
        // Strip the "ALLOW:" tag so the frontend gets clean department names
        allowedOUs = allowedOUs.map(ou => ou.replace('ALLOW:', '').trim());
    }

    const userRole = getVal(user.businessCategory) || "USER";

    return {
      userExists: true,
      userName: getVal(user.uid),
      mobileNumber: getVal(user.mobile),
      firstName: getVal(user.givenName),
      lastName: getVal(user.sn),
      fullName: getVal(user.cn),
      email: getVal(user.mail),
      title: getVal(user.title),
      picture: user.jpegPhoto ? Buffer.from(getVal(user.jpegPhoto)).toString("base64") : null,
      
      // 🚨 Give the token exactly what it's looking for
      role: userRole, 
      businessCategory: userRole, 
      allowedOUs: allowedOUs,
      departmentNumber: allowedOUs,
      canWrite: userRole === "SUPER_ADMIN" || userRole === "ADMIN" 
    };
  } catch (err) {
    console.error("❌ LDAP checkUserExists Error:", err.message);
    throw err; 
  } finally {
    client.unbind();
  }
};
// Add a new LDAP entry
exports.add = (client, dn, entry) => {
  return new Promise((resolve, reject) => {
    client.add(dn, entry, (err) => (err ? reject(err) : resolve()));
  });
};

// Modify an existing LDAP entry
exports.modify = (client, dn, changes) => {
  return new Promise((resolve, reject) => {
    client.modify(dn, changes, (err) => (err ? reject(err) : resolve()));
  });
};

// Delete an LDAP entry
exports.del = (client, dn) => {
  return new Promise((resolve, reject) => {
    client.del(dn, (err) => (err ? reject(err) : resolve()));
  });
};
