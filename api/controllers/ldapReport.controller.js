// controllers/ldapReport.controller.js
const { searchUsers } = require("../ldap/userService");
const ldap = require("ldapjs");
const client = require("../ldap/ldapClient");

/* ----------------- GET ALL USERS ----------------- */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await searchUsers("(objectClass=inetOrgPerson)");
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("LDAP Search Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
};

/* ----------------- GET DISABLED USERS ----------------- */
exports.getDisabledUsers = async (req, res) => {
  try {
    const users = await searchUsers("(employeeType=disabled)");
    res.json({ success: true, data: users });
  } catch (err) {
    console.error("LDAP Search Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch disabled users" });
  }
};

/* ----------------- ADD USER ----------------- */
exports.addUser = (req, res) => {
  const dn = `uid=${req.body.uid},ou=admin,${process.env.LDAP_BASE_DN}`;
  const entry = {
    objectClass: ["inetOrgPerson", "organizationalPerson"],
    uid: req.body.uid,
    cn: req.body.name,
    sn: req.body.name,
    mail: req.body.email,
    mobile: req.body.mobile,
    title: req.body.title,
    employeeType: req.body.status || "ACTIVE",
    userPassword: req.body.password
  };

  client.add(dn, entry, (err) => {
    if (err) {
      console.error("LDAP Add Error:", err);
      return res.status(400).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: "User added successfully" });
  });
};

/* ----------------- UPDATE USER ----------------- */
exports.updateUser = (req, res) => {
  const dn = `uid=${req.params.uid},ou=admin,${process.env.LDAP_BASE_DN}`;
  const change = new ldap.Change({
    operation: "replace",
    modification: {
      mail: req.body.email,
      mobile: req.body.mobile,
      title: req.body.title,
      employeeType: req.body.status
    }
  });

  client.modify(dn, change, (err) => {
    if (err) {
      console.error("LDAP Modify Error:", err);
      return res.status(400).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: "User updated successfully" });
  });
};

/* ----------------- DISABLE USER ----------------- */
exports.disableUser = (req, res) => {
  const dn = `uid=${req.params.uid},ou=admin,${process.env.LDAP_BASE_DN}`;
  const change = new ldap.Change({
    operation: "replace",
    modification: {
      employeeType: "disabled"
    }
  });

  client.modify(dn, change, (err) => {
    if (err) {
      console.error("LDAP Disable Error:", err);
      return res.status(400).json({ success: false, message: err.message });
    }
    res.json({ success: true, message: "User disabled successfully" });
  });
};
