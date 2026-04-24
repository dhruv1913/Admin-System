const { createClient, bind, search, modify } = require("../services/ldapService");
const { getAuditLogs, getSessionLogs, logAction } = require("../services/logService");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const ldapConfig = require("../config/ldap");
const pool = require('../config/db');
const dbService = require('../services/dbService');
const xlsx = require("xlsx");
const crypto = require('crypto');
const ldap = require('ldapjs');
const fs = require('fs');
const path = require('path');
// ==========================================
// HELPER FUNCTIONS
// ==========================================
const getOrgBase = () => ldapConfig.baseDN || process.env.LDAP_ORG_BASE;

const generateSSHA = (password) => {
    const salt = crypto.randomBytes(4);
    const hash = crypto.createHash('sha1');
    hash.update(password);
    hash.update(salt);
    const digest = hash.digest();
    const ssha = Buffer.concat([digest, salt]).toString('base64');
    return '{SSHA}' + ssha;
};

const cleanEntry = (entry) => {
    const clean = {};
    for (const key in entry) {
        const val = entry[key];
        // 🚨 Strict Validation: Remove nulls, undefined, empty strings, AND empty arrays
        if (val !== undefined && val !== null && val !== "") {
            if (Array.isArray(val) && val.length === 0) {
                continue; // Skip the empty array!
            }
            // LDAP strictly requires strings, so we convert numbers just in case
            clean[key] = typeof val === 'number' ? val.toString() : val;
        }
    }
    return clean;
};

const isAllowedOU = (allowedOUs, targetOU) => {

    if (!allowedOUs || !Array.isArray(allowedOUs) || !targetOU) return false;
    const isMatch = allowedOUs.map(ou => ou.trim().toLowerCase()).includes(targetOU.trim().toLowerCase());
    return isMatch;
};

const buildDuplicateFilter = (email, mobile, secondaryEmail) => {
    let filters = [];
    if (email) filters.push(`(mail=${email})`);
    if (mobile) filters.push(`(mobile=${mobile})`);
    if (secondaryEmail) filters.push(`(description=${secondaryEmail})`);
    if (filters.length === 0) return null;
    if (filters.length === 1) return filters[0];
    return `(|${filters.join('')})`;
};

// 
exports.getUsers = async (req, res) => {
    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const filter = req.params.ou === "all" ? "(objectClass=inetOrgPerson)" : `(&(objectClass=inetOrgPerson)(ou=${req.params.ou}))`;

        const users = await search(client, getOrgBase(), {
            scope: "sub",
            filter: filter,
            attributes: ["uid", "cn", "sn", "mail", "description", "mobile", "businessCategory", "employeeType", "departmentNumber", "createTimestamp"]
        });

        let processedUsers = users.map(u => {
            const ouMatch = u.dn ? u.dn.match(/ou=([^,]+)/i) : null;

            const rawCn = Array.isArray(u.cn) ? u.cn[0] : (u.cn || "Unknown");
            const rawSn = Array.isArray(u.sn) ? u.sn[0] : (u.sn || "");

            // 🚨 SMART SPLITTER: Extracts First & Last Name cleanly without duplicating
            let fName = rawCn;
            let lName = rawSn;

            if (rawCn.includes(" ")) {
                fName = rawCn.split(" ")[0];
                lName = rawSn || rawCn.substring(rawCn.indexOf(" ") + 1);
            } else if (!rawSn || rawSn.toLowerCase() === rawCn.toLowerCase()) {
                lName = ""; // Prevent "au au" or "Dhruv Dhruv" duplication
            }

            return {
                ...u,
                department: ouMatch ? ouMatch[1] : 'General',
                firstName: fName,
                lastName: lName
            };
        });

        // 🚨 CRITICAL FIX: Filter out users not in the Admin's allowedOUs
        console.log("Token User Request:", JSON.stringify(req.user));
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "super_admin") {
            processedUsers = processedUsers.filter(u => isAllowedOU(req.user.allowedOUs, u.department));
        }

        return successResponse(res, processedUsers, "Users retrieved");
    } catch (err) {
        return errorResponse(res, "Failed to fetch users", 500);
    } finally {
        client.unbind();
    }
};

exports.exportUsers = async (req, res) => {
    if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "ADMIN") {
        return errorResponse(res, "Unauthorized", 403);
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const users = await search(client, getOrgBase(), {
            scope: "sub", filter: "(objectClass=inetOrgPerson)",
            attributes: ["uid", "cn", "sn", "mail", "mobile", "businessCategory", "createTimestamp"]
        });

        let data = users.map(u => {
            const ouMatch = u.dn ? u.dn.match(/ou=([^,]+)/i) : null;
            return {
                "User ID": Array.isArray(u.uid) ? u.uid[0] : u.uid,
                "Name": Array.isArray(u.cn) ? u.cn[0] : u.cn,
                "Email": Array.isArray(u.mail) ? u.mail[0] : (u.mail || ""),
                "Mobile": Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || ""),
                "Role": Array.isArray(u.businessCategory) ? u.businessCategory[0] : (u.businessCategory || "USER"),
                "department": ouMatch ? ouMatch[1] : 'General'
            };
        });

        // 🚨 Filter the export list for Admins too!
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "super_admin") {
            data = data.filter(u => isAllowedOU(req.user.allowedOUs, u.department));
        }

        // Clean off the internal 'department' tag before converting to Excel
        data = data.map(({ department, ...rest }) => rest);

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, "Users");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Disposition", "attachment; filename=Directory_Users.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    } catch (err) {
        return errorResponse(res, "Export failed", 500);
    } finally {
        client.unbind();
    }
};

exports.addUser = async (req, res) => { 
    const { uid, firstName, lastName, email, secondaryEmail, password, mobile, title, permissions, department, role } = req.body;

    if (!uid || !department || !password) return res.status(400).json({ message: "Missing fields" });

    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
        if (!req.user.canWrite || !isAllowedOU(req.user.allowedOUs, department)) {
            return res.status(403).json({ message: "Unauthorized" });
        }
    }

    const client = createClient();
    try {
        const exists = await dbService.checkUserExists(uid);
        if (exists) return res.status(400).json({ message: "UID already exists in database." });

        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        const existingUid = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})` });
        if (existingUid.length > 0) return res.status(400).json({ message: "UID already exists in directory." });

        const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
        if (dupFilter) {
            const duplicates = await search(client, `ou=${department},${getOrgBase()}`, { scope: "sub", filter: dupFilter, attributes: ['uid'] });
            if (duplicates.length > 0) return res.status(400).json({ message: "Email or Mobile already exists in this department." });
        }

        const newUserDN = `uid=${uid},ou=${department},${getOrgBase()}`;
        const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

        // 🚨 IMPORTANT: Make sure your PG database actually has the 'ldap_user_dn' column!
        await dbService.insertUserMapping(uid, password, userIP, newUserDN); 

        const ldapPassword = generateSSHA(password);
        
        let formattedPermissions = undefined;
        if (Array.isArray(permissions)) {
            formattedPermissions = permissions.map(s => "ALLOW:" + String(s).trim());
        } else if (typeof permissions === 'string') {
            formattedPermissions = permissions.split(',').map(s => "ALLOW:" + s.trim());
        }

        const entry = cleanEntry({
            objectClass: ["top", "person", "organizationalPerson", "inetOrgPerson"],
            cn: `${firstName} ${lastName}`, sn: lastName, uid: uid,
            userPassword: ldapPassword, employeeType: "active",
            businessCategory: role || "USER", mail: email, description: secondaryEmail,
            mobile: mobile, title: title || "Employee", 
            departmentNumber: formattedPermissions, 
            labeledURI: `uploads/${uid}.jpg`
        });

        if (req.file) {
            const oldPath = req.file.path;
            const newPath = path.join(req.file.destination, `${uid}.jpg`);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }

        await new Promise((resolve, reject) => {
            client.add(newUserDN, entry, (err) => err ? reject(err) : resolve());
        });

        await logAction(req, "CREATE", uid, role, "ACTIVE", `Created user ${firstName} ${lastName}`);
        return successResponse(res, null, "User created successfully");

    } catch (err) {
        // 🚨 FIXED: The backend console will now tell you exactly what failed
        console.error("🔥 Add User Error:", err);
        
        // 🚨 FIXED: Added the missing 'return' keyword
        return res.status(500).json({ message: "Server Error" });
    } finally {
        // 🚨 FIXED: Moved unbind here so it ALWAYS executes, stopping connection leaks
        try { client.unbind(); } catch(e) {}
    }
};

exports.editUser = async (req, res) => {
    const { uid, firstName, lastName, email, secondaryEmail, title, mobile, employeeType, permissions, role, password } = req.body;
    if (!uid) return res.status(400).json({ message: "UID required" });

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        // 1. Get the user's current DN
        const users = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ["dn"] });
        if (users.length === 0) return res.status(404).json({ message: "User not found" });
        const userDN = users[0].dn;

        // 2. Extract the user's current Department (OU) BEFORE checking for duplicates
        const ouMatch = userDN.match(/ou=([^,]+)/i);
        const currentOU = ouMatch ? ouMatch[1] : null;

        if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
            if (!currentOU || !isAllowedOU(req.user.allowedOUs, currentOU)) {
                return res.status(403).json({ message: "Unauthorized" });
            }
        }

        // 3. ✅ FIXED: Search for duplicates ONLY within the user's current department!
        const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
        if (dupFilter && currentOU) {
            const searchBase = `ou=${currentOU},${getOrgBase()}`; // Only look in this OU
            const duplicates = await search(client, searchBase, { scope: "sub", filter: dupFilter, attributes: ['uid'] });
            
            const conflict = duplicates.find(u => {
                const uID = Array.isArray(u.uid) ? u.uid[0] : u.uid;
                return uID !== uid;
            });
            
            if (conflict) {
                return res.status(400).json({ 
                    message: `Conflict: Email or Mobile already used by ${conflict.uid} in the ${currentOU} department.` 
                });
            }
        }

        if (req.file) {
            const oldPath = req.file.path;
            const newPath = path.join(req.file.destination, `${uid}.jpg`);
            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
            }
        }
        
        // 🚨 1. FIXED PASSWORD UPDATE FORMAT
       if (password && typeof password === 'string' && password.trim() !== "") {
            await dbService.updateUserPassword(uid, password);


            const ldapPassword = generateSSHA(password);
            await new Promise((resolve, reject) => {
                const change = new ldap.Change({
                    operation: 'replace',
                    modification: { type: 'userPassword', values: [ldapPassword] }
                });
                client.modify(userDN, change, (err) => err ? reject(err) : resolve());
            });
        }

        // Update Postgres DB Status
        if (employeeType) {
    // Safely extract string whether it's an Array or a String
    const typeStr = Array.isArray(employeeType) ? employeeType[0] : employeeType;
    const isActive = (String(typeStr).toLowerCase() === "active");
    await dbService.updateUserStatus(uid, isActive);
}

        const changes = cleanEntry({
     cn: (firstName && lastName) ? `${firstName} ${lastName}` : undefined,
    sn: lastName, mail: email, description: secondaryEmail,
            title: title, mobile: mobile, employeeType: employeeType,
            businessCategory: role, departmentNumber: permissions,
            labeledURI: req.file ? `uploads/${uid}.jpg` : undefined
        });

        // 🚨 2. FIXED LDAP PROFILE & STATUS UPDATE LOOP
        for (const [key, value] of Object.entries(changes)) {
            try {
                await new Promise((resolve, reject) => {
                    const change = new ldap.Change({
                        operation: 'replace',
                        modification: { type: key, values: [String(value)] }
                    });
                    client.modify(userDN, change, (err) => err ? reject(err) : resolve());
                });
            } catch (e) {
                if (e.code === 16 || e.code === 32 || (e.message && e.message.includes("NoSuchAttribute"))) {
                    try {
                        await new Promise((resolve, reject) => {
                            const change = new ldap.Change({
                                operation: 'add',
                                modification: { type: key, values: [String(value)] }
                            });
                            client.modify(userDN, change, (err) => err ? reject(err) : resolve());
                        });
                    } catch (addErr) {
                        console.error(`LDAP Add Error for ${key}:`, addErr);
                    }
                } else {
                    console.error(`LDAP Modify Error for ${key}:`, e);
                }
            }
        }

     const displayName = (firstName && lastName) 
            ? `${firstName} ${lastName} (${uid})` 
            : `user ${uid}`;

        // 2. Determine the exact action taken
        let actionMsg = "";
        if (employeeType) {
            actionMsg = `Changed account status to ${employeeType.toUpperCase()} for ${displayName}`;
        } else if (password) {
             actionMsg = `Reset password for ${displayName}`;
        } else {
            actionMsg = `Updated profile details (name, email, etc.) for ${displayName}`;
        }

        const finalStatus = employeeType ? employeeType.toUpperCase() : "ACTIVE";

        await logAction(req, "UPDATE_USER", req.user?.uid || "Admin", finalStatus, actionMsg);

        return successResponse(res, { uid }, actionMsg);
        
    } catch (err) {
        console.error("Edit Error:", err);
        return res.status(500).json({ message: "Update failed" });
    }
    try { client.unbind(); } catch(e) {}
};

exports.deleteUser = async (req, res) => {
    const { uid } = req.params;

    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN" && !req.user.canWrite) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const searchRes = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ['dn'] });

        if (searchRes.length > 0) {
            const userDN = searchRes[0].dn;
            await new Promise((resolve, reject) => {
                client.del(userDN, (err) => err ? reject(err) : resolve());
            });
        }

        await dbService.deleteUserMapping(uid);
        await logAction(req, "DELETE", uid, "ACTIVE", "User deleted permanently");
        return successResponse(res, null, "User deleted successfully");

    } catch (err) {
        console.error("Delete failed:", err);
        return res.status(500).json({ message: "Delete failed" });
   } finally {
        try { 
            client.unbind(); 
        } catch(e) {
            console.error("Unbind error:", e);
        }
    }
};

exports.bulkImport = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (rawData.length === 0) return res.status(400).json({ message: "Excel file is empty" });

    const client = createClient();
    const summary = { success: 0, failed: 0, errors: [] };

    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        for (const [index, row] of rawData.entries()) {
            const rowNum = index + 2;
            const user = {};
            Object.keys(row).forEach(k => {
                const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (cleanKey === 'mobile' || cleanKey === 'mobileno' || cleanKey === 'phone') user.mobile = row[k];
                else if (cleanKey === 'secondaryemail' || cleanKey === 'altemail' || cleanKey === 'description') user.secondaryemail = row[k];
                else if (cleanKey === 'firstname') user.firstname = row[k];
                else if (cleanKey === 'lastname') user.lastname = row[k];
                else user[cleanKey] = row[k];
            });

            if (!user.uid || !user.department || !user.password || !user.firstname || !user.lastname) {
                summary.failed++;
                summary.errors.push(`Row ${rowNum}: Missing required fields`);
                continue;
            }

            if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
                if (!isAllowedOU(req.user.allowedOUs, user.department)) {
                    summary.failed++;
                    summary.errors.push(`Row ${rowNum} (${user.uid}): Unauthorized.`);
                    continue;
                }
            }

            try {
                const exists = await dbService.checkUserExists(user.uid);
                if (exists) throw new Error(`UID '${user.uid}' already exists in Database`);

                const newUserDN = `uid=${user.uid},ou=${user.department},${getOrgBase()}`;
                const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

               await dbService.insertUserMapping(user.uid, user.password, userIP, newUserDN);

                const ldapPassword = generateSSHA(user.password);
                const entry = cleanEntry({
                    objectClass: ["top", "person", "organizationalPerson", "inetOrgPerson"],
                    cn: `${user.firstname} ${user.lastname}`, sn: user.lastname, uid: user.uid,
                    userPassword: ldapPassword, employeeType: "active",
                    businessCategory: (user.role || "USER").toUpperCase(),
                    mail: user.email, description: user.secondaryemail,
                    mobile: user.mobile ? user.mobile.toString() : undefined,
                    title: user.title || "Employee",
                    departmentNumber: user.permissions ? user.permissions.split(',').map(s => "ALLOW:" + s.trim()) : undefined,
                    labeledURI: `uploads/${user.uid}.jpg`
                });

                await new Promise((resolve, reject) => {
                    client.add(newUserDN, entry, (err) => err ? reject(err) : resolve());
                });

                summary.success++;
            } catch (err) {
                summary.failed++;
                summary.errors.push(`Row ${rowNum} (${user.uid}): ${err.message}`);
            }
        }
        await logAction(req, "BULK_IMPORT", "Batch", "N/A", "ACTIVE", `Imported ${summary.success} users, Failed: ${summary.failed}`);
        return successResponse(res, { summary }, "Bulk import complete");

    } catch (err) {
        console.error("Bulk upload fatal error:", err);
        res.status(500).json({ message: "Server Error during bulk upload" });
    } finally {
        client.unbind();
    }
};

exports.getOUs = async (req, res) => {
    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        const entries = await search(client, getOrgBase(), { scope: "one", filter: "(objectClass=organizationalUnit)", attributes: ["ou"] });

        let departments = entries.map(e => Array.isArray(e.ou) ? e.ou[0] : e.ou)
            .filter(name => name && !['users', 'admins', 'system'].includes(name.toLowerCase()));

        if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
            departments = departments.filter(dept => isAllowedOU(req.user.allowedOUs, dept));
        }

        return successResponse(res, departments);
    } catch (err) {
        res.status(500).json({ message: "Failed to fetch departments" });
    } finally {
        try { client.unbind(); } catch (e) { }
    }
};

exports.getDepartmentsStats = async (req, res) => {
    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") return res.status(403).json({ message: "Unauthorized" });

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const entries = await search(client, getOrgBase(), { scope: "one", filter: "(objectClass=organizationalUnit)", attributes: ["ou"] });
        const depts = entries.map(e => Array.isArray(e.ou) ? e.ou[0] : e.ou)
            .filter(name => name && !['users', 'admins', 'system'].includes(name.toLowerCase()));

        const stats = [];
        for (const dept of depts) {
            const users = await search(client, `ou=${dept},${getOrgBase()}`, {
                scope: "sub", filter: "(objectClass=inetOrgPerson)", attributes: ["employeeType"]
            });

            let activeCount = 0; let inactiveCount = 0;
            users.forEach(u => {
                const status = Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType;
                if (status && status.toString().toUpperCase() === 'ACTIVE') activeCount++; else inactiveCount++;
            });
            stats.push({ name: dept, total: users.length, active: activeCount, inactive: inactiveCount });
        }
        return successResponse(res, stats);
    } catch (err) {
        res.status(500).json({ message: "Error fetching stats" });
    } finally { client.unbind(); }
};

exports.createDepartment = async (req, res) => {
    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Unauthorized. Only Super Admins can add departments." });
    }

    // 🚨 SMART CATCH: Grab the name no matter what the frontend called it
    const ouName = req.body.ouName || req.body.name || req.body.department;
    
    if (!ouName) {
        console.error("🚨 Create Dept failed: Missing Name! Received Body:", req.body);
        return res.status(400).json({ message: "Department Name is required" });
    }

    const cleanName = String(ouName).trim().replace(/[^a-zA-Z0-9 _-]/g, "");

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const newDN = `ou=${cleanName},${getOrgBase()}`;
        const entry = { objectClass: ["top", "organizationalUnit"], ou: cleanName };

        await new Promise((resolve, reject) => {
            client.add(newDN, entry, (err) => err ? reject(err) : resolve());
        });

       await logAction(req, "CREATE_OU", req.user?.uid || "Admin", "ACTIVE", `Created Department: ${cleanName}`);
        return successResponse(res, null, "Department created successfully");

    } catch (err) {
        console.error("🚨 LDAP Create OU Error:", err);
        // 🚨 CLEARER ERROR: Tells you exactly if it's a duplicate
        if (err.code === 68) return res.status(400).json({ message: `Department '${cleanName}' already exists!` });
        return res.status(500).json({ message: "Failed to create department: " + err.message });
    } finally {
        try { client.unbind(); } catch (e) { }
    }
};

exports.deleteDepartment = async (req, res) => {
    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
        return res.status(403).json({ message: "Unauthorized" });
    }

    // 🚨 SMART CATCH: Looks in the body AND the URL parameters for the name
    const name = req.body.name || req.body.ouName || req.params.name || req.query.name || req.query.ouName;
    
    if (!name) {
        console.error("🚨 Delete Dept failed: Missing Name! Received:", req.body, req.query);
        return res.status(400).json({ message: "Department name is required" });
    }
    
    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        const dn = `ou=${name},${getOrgBase()}`;

        const users = await search(client, dn, { scope: "one", filter: "(objectClass=*)" });
        if (users.length > 0) return res.status(400).json({ message: "Cannot delete: Department is not empty (contains users)" });

        await new Promise((resolve, reject) => {
            client.del(dn, (err) => err ? reject(err) : resolve());
        });

       await logAction(req, "DELETE_OU", req.user?.uid || "Admin", "INACTIVE", `Deleted Department: ${name}`);
        return successResponse(res, null, "Department deleted");

    } catch (err) {
        console.error("🚨 LDAP Delete OU Error:", err);
        return res.status(500).json({ message: "Delete failed: " + err.message });
    } finally {
        try { client.unbind(); } catch (e) {}
    }
};

exports.getSessionLogs = async (req, res) => {
    try { const logs = await getSessionLogs(); return successResponse(res, logs); }
    catch (err) { return errorResponse(res, "Error fetching session logs"); }
};

exports.getAuditLogs = async (req, res) => {
    try { const logs = await getAuditLogs(); return successResponse(res, logs); }
    catch (err) { return errorResponse(res, "Error fetching audit logs"); }
};