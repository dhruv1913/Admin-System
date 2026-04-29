const { createClient, bind, search, modify } = require("../services/ldapService");
const { getAuditLogs, getSessionLogs, logAction } = require("../services/logService");
const { successResponse, errorResponse } = require("../utils/responseHandler");
const ldapConfig = require("../config/ldap");
const pool = require('../config/db');
const dbService = require('../services/dbService');
const xlsx = require("xlsx");
const crypto = require('crypto');
const ldap = require('ldapjs');

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
    // 🚨 THE FIX: Alias 'search' to 'searchQuery' so it doesn't overwrite your LDAP function!
    const { page = 1, limit = 10, search: searchQuery = "", dept = "", role = "", status = "" } = req.query;
    
    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        
        // 2. Build a highly efficient LDAP Filter using 'searchQuery'
        let baseFilter = "(objectClass=inetOrgPerson)";
        if (searchQuery) {
            const q = searchQuery.trim();
            baseFilter = `(&(objectClass=inetOrgPerson)(|(cn=*${q}*)(uid=*${q}*)(mail=*${q}*)(mobile=*${q}*)(description=*${q}*)))`;
        }

        // 3. Now the imported 'search' function works perfectly again!
        const users = await search(client, getOrgBase(), {
            scope: "sub",
            filter: baseFilter,
            attributes: ["uid", "cn", "sn", "mail", "description", "mobile", "businessCategory", "employeeType", "departmentNumber", "createTimestamp", "labeledURI"]
        });

        // 4. Format the data 
        let processedUsers = users.map(u => {
            const ouMatch = u.dn ? u.dn.match(/ou=([^,]+)/i) : null;
            const rawCn = Array.isArray(u.cn) ? u.cn[0] : (u.cn || "Unknown");
            const rawSn = Array.isArray(u.sn) ? u.sn[0] : (u.sn || "");

            let fName = rawCn;
            let lName = rawSn;
            if (rawCn.includes(" ")) {
                fName = rawCn.split(" ")[0];
                lName = rawSn || rawCn.substring(rawCn.indexOf(" ") + 1);
            } else if (!rawSn || rawSn.toLowerCase() === rawCn.toLowerCase()) {
                lName = ""; 
            }

            return {
                ...u,
                department: ouMatch ? ouMatch[1] : 'General',
                firstName: fName,
                lastName: lName,
                status: String(Array.isArray(u.employeeType) ? u.employeeType[0] : u.employeeType || "ACTIVE").toUpperCase(),
                role: String(Array.isArray(u.businessCategory) ? u.businessCategory[0] : u.businessCategory || "USER").toUpperCase(),
                uid: Array.isArray(u.uid) ? u.uid[0] : u.uid,
                email: Array.isArray(u.mail) ? u.mail[0] : u.mail,
                mobile: Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || ""),
                secondaryEmail: Array.isArray(u.description) ? u.description[0] : (u.description || ""),
                labeledURI: Array.isArray(u.labeledURI) ? u.labeledURI[0] : (u.labeledURI || ""),
                createTimestamp: u.createTimestamp || "00000000000000Z"
            };
        });

        // Apply strict Backend filters
        if (dept) {
            const deptArray = dept.split(',').map(d => d.trim().toLowerCase());
            processedUsers = processedUsers.filter(u => deptArray.includes(String(u.department).toLowerCase()));
        }
        if (role) processedUsers = processedUsers.filter(u => u.role === role);
        if (status) processedUsers = processedUsers.filter(u => u.status === status);

        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "super_admin") {
            processedUsers = processedUsers.filter(u => isAllowedOU(req.user.allowedOUs, u.department));
        }

        // Sort by newest
        processedUsers.sort((a, b) => (a.createTimestamp < b.createTimestamp ? 1 : -1));

        // Slice exactly the records the frontend needs
        const totalRecords = processedUsers.length;
        const totalPages = Math.ceil(totalRecords / limit) || 1;
        const startIndex = (page - 1) * limit;
        const paginatedData = processedUsers.slice(startIndex, startIndex + Number(limit));

        // Return the new structured payload
        return successResponse(res, {
            users: paginatedData,
            totalRecords,
            totalPages
        }, "Users retrieved");
        
    } catch (err) {
        console.error("Get Users Error:", err);
        return errorResponse(res, "Failed to fetch users", 500);
    } finally {
        try { client.unbind(); } catch(e) {}
    }
};


exports.addUser = async (req, res) => {
    const { uid, firstName, lastName, email, secondaryEmail, password, mobile, title, permissions, department, role } = req.body;

    if (!uid || !department || !password) return res.status(400).json({ message: "Missing fields" });

    // 🚨 1. STRICT MOBILE VALIDATION (Cleaned and Cast to String)
    if (mobile && String(mobile).trim() !== "") {
        const cleanMobile = String(mobile).trim();
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
            return res.status(400).json({ message: "Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9." });
        }
    }

    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
        if (!req.user.canWrite || !isAllowedOU(req.user.allowedOUs, department)) {
            return res.status(403).json({ message: "Unauthorized" });
        }
    }

    const client = createClient();
    try {
        const exists = await dbService.checkUserExists(uid);
        if (exists) return res.status(400).json({ message: `UID '${uid}' already exists in database.` });

        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        const existingUid = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})` });
        if (existingUid.length > 0) return res.status(400).json({ message: `UID '${uid}' already exists in directory.` });

        // 🚨 2. GRANULAR DUPLICATE CHECK (Checks ONLY in the same Department)
        const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
        if (dupFilter) {
            const duplicates = await search(client, `ou=${department},${getOrgBase()}`, { 
                scope: "sub", filter: dupFilter, attributes: ['uid', 'mail', 'mobile', 'description'] 
            });

            if (duplicates.length > 0) {
                for (let dup of duplicates) {
                    const dupUid = String(Array.isArray(dup.uid) ? dup.uid[0] : dup.uid || "").trim();
                    const dupMail = String(Array.isArray(dup.mail) ? dup.mail[0] : dup.mail || "").trim().toLowerCase();
                    const dupMobile = String(Array.isArray(dup.mobile) ? dup.mobile[0] : dup.mobile || "").trim();
                    const dupSec = String(Array.isArray(dup.description) ? dup.description[0] : dup.description || "").trim().toLowerCase();

                    const reqEmail = String(email || "").trim().toLowerCase();
                    const reqMobile = String(mobile || "").trim();
                    const reqSec = String(secondaryEmail || "").trim().toLowerCase();

                    if (reqEmail && dupMail && dupMail === reqEmail) {
                        return res.status(400).json({ message: `Email '${email}' is already used by user '${dupUid}' in this department.` });
                    }
                    if (reqMobile && dupMobile && dupMobile === reqMobile) {
                        return res.status(400).json({ message: `Mobile '${mobile}' is already used by user '${dupUid}' in this department.` });
                    }
                    if (reqSec && dupSec && dupSec === reqSec) {
                        return res.status(400).json({ message: `Secondary Email '${secondaryEmail}' is already used by user '${dupUid}' in this department.` });
                    }
                }
            }
        }

        // 🚨 3. NAME DUPLICATE CHECK
        const cn = `${firstName} ${lastName}`.trim();
        const nameDuplicates = await search(client, `ou=${department},${getOrgBase()}`, { scope: "sub", filter: `(cn=${cn})`, attributes: ['uid'] });
        if (nameDuplicates.length > 0) {
            const dupUid = Array.isArray(nameDuplicates[0].uid) ? nameDuplicates[0].uid[0] : nameDuplicates[0].uid;
            return res.status(400).json({ message: `The name '${cn}' is already used by user '${dupUid}' in this department.` });
        }

        // If all validations pass, Create User
        const newUserDN = `uid=${uid},ou=${department},${getOrgBase()}`;
        const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

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
            cn: cn, sn: lastName, uid: uid,
            userPassword: ldapPassword, employeeType: "active",
            businessCategory: role || "USER", mail: email, description: secondaryEmail,
            mobile: mobile, title: title || "Employee",
            departmentNumber: formattedPermissions,
            labeledURI: `uploads/${uid}.jpg`
        });

        await new Promise((resolve, reject) => {
            client.add(newUserDN, entry, (err) => err ? reject(err) : resolve());
        });

        await logAction(req, "CREATE", uid, role, "ACTIVE", `Created user ${cn}`);
        return successResponse(res, null, "User created successfully");

    } catch (err) {
        console.error("🔥 Add User Error:", err);
        return res.status(500).json({ message: "Server Error" });
    } finally {
        try { client.unbind(); } catch (e) { }
    }
};

exports.editUser = async (req, res) => {
    const { uid, firstName, lastName, email, secondaryEmail, title, mobile, employeeType, permissions, role, password } = req.body;
    if (!uid) return res.status(400).json({ message: "UID required" });

    // 🚨 1. STRICT MOBILE VALIDATION FOR EDITING
    if (mobile && String(mobile).trim() !== "") {
        const cleanMobile = String(mobile).trim();
        if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
            return res.status(400).json({ message: "Mobile number must be exactly 10 digits and start with 6, 7, 8, or 9." });
        }
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);

        const users = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ["dn"] });
        if (users.length === 0) return res.status(404).json({ message: "User not found" });
        const userDN = users[0].dn;

        const ouMatch = userDN.match(/ou=([^,]+)/i);
        const currentOU = ouMatch ? ouMatch[1] : null;

        if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
            if (!currentOU || !isAllowedOU(req.user.allowedOUs, currentOU)) {
                return res.status(403).json({ message: "Unauthorized" });
            }
        }

        // 🚨 2. GRANULAR DUPLICATE CHECK FOR EDITING
        const dupFilter = buildDuplicateFilter(email, mobile, secondaryEmail);
        if (dupFilter && currentOU) {
            const duplicates = await search(client, `ou=${currentOU},${getOrgBase()}`, { 
                scope: "sub", filter: dupFilter, attributes: ['uid', 'mail', 'mobile', 'description'] 
            });

            // Filter out the user we are currently editing
            const conflicts = duplicates.filter(u => {
                const uID = Array.isArray(u.uid) ? u.uid[0] : u.uid;
                return String(uID).trim() !== String(uid).trim();
            });

            if (conflicts.length > 0) {
                for (let dup of conflicts) {
                    const dupUid = String(Array.isArray(dup.uid) ? dup.uid[0] : dup.uid || "").trim();
                    const dupMail = String(Array.isArray(dup.mail) ? dup.mail[0] : dup.mail || "").trim().toLowerCase();
                    const dupMobile = String(Array.isArray(dup.mobile) ? dup.mobile[0] : dup.mobile || "").trim();
                    const dupSec = String(Array.isArray(dup.description) ? dup.description[0] : dup.description || "").trim().toLowerCase();

                    const reqEmail = String(email || "").trim().toLowerCase();
                    const reqMobile = String(mobile || "").trim();
                    const reqSec = String(secondaryEmail || "").trim().toLowerCase();

                    if (reqEmail && dupMail && dupMail === reqEmail) {
                        return res.status(400).json({ message: `Conflict: Email '${email}' is already used by '${dupUid}' in this department.` });
                    }
                    if (reqMobile && dupMobile && dupMobile === reqMobile) {
                        return res.status(400).json({ message: `Conflict: Mobile '${mobile}' is already used by '${dupUid}' in this department.` });
                    }
                    if (reqSec && dupSec && dupSec === reqSec) {
                        return res.status(400).json({ message: `Conflict: Secondary Email '${secondaryEmail}' is already used by '${dupUid}' in this department.` });
                    }
                }
            }
        }

        // 🚨 3. NAME DUPLICATE CHECK FOR EDITING
        if (firstName && lastName) {
            const cn = `${firstName} ${lastName}`.trim();
            const nameDuplicates = await search(client, `ou=${currentOU},${getOrgBase()}`, { scope: "sub", filter: `(&(cn=${cn})(!(uid=${uid})))`, attributes: ['uid'] });
            if (nameDuplicates.length > 0) {
                const dupUid = Array.isArray(nameDuplicates[0].uid) ? nameDuplicates[0].uid[0] : nameDuplicates[0].uid;
                return res.status(400).json({ message: `Conflict: The name '${cn}' is already used by '${dupUid}' in this department.` });
            }
        }

        if (password && typeof password === 'string' && password.trim() !== "") {
            await dbService.updateUserPassword(uid, password);
            const ldapPassword = generateSSHA(password);
            await new Promise((resolve, reject) => {
                const change = new ldap.Change({ operation: 'replace', modification: { type: 'userPassword', values: [ldapPassword] }});
                client.modify(userDN, change, (err) => err ? reject(err) : resolve());
            });
        }

        if (employeeType) {
            const typeStr = Array.isArray(employeeType) ? employeeType[0] : employeeType;
            await dbService.updateUserStatus(uid, (String(typeStr).toLowerCase() === "active"));
        }

        const changes = cleanEntry({
            cn: (firstName && lastName) ? `${firstName} ${lastName}` : undefined,
            sn: lastName, mail: email, description: secondaryEmail,
            title: title, mobile: mobile, employeeType: employeeType,
            businessCategory: role, departmentNumber: permissions,
            labeledURI: req.file ? `uploads/${uid}.jpg` : undefined
        });

        for (const [key, value] of Object.entries(changes)) {
            try {
                await new Promise((resolve, reject) => {
                    const change = new ldap.Change({ operation: 'replace', modification: { type: key, values: [String(value)] } });
                    client.modify(userDN, change, (err) => err ? reject(err) : resolve());
                });
            } catch (e) {
                if (e.code === 16 || e.code === 32 || (e.message && e.message.includes("NoSuchAttribute"))) {
                    try {
                        await new Promise((resolve, reject) => {
                            const change = new ldap.Change({ operation: 'add', modification: { type: key, values: [String(value)] } });
                            client.modify(userDN, change, (err) => err ? reject(err) : resolve());
                        });
                    } catch (addErr) { console.error(`LDAP Add Error for ${key}:`, addErr); }
                }
            }
        }

        let actionMsg = employeeType ? `Changed status for ${uid}` : password ? `Reset password for ${uid}` : `Updated details for ${uid}`;
        await logAction(req, "UPDATE_USER", req.user?.uid || "Admin", employeeType ? employeeType.toUpperCase() : "ACTIVE", actionMsg);
        return successResponse(res, { uid }, actionMsg);

    } catch (err) {
        console.error("Edit Error:", err);
        return res.status(500).json({ message: "Update failed" });
    } finally {
        try { client.unbind(); } catch (e) { }
    }
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
        } catch (e) {
            console.error("Unbind error:", e);
        }
    }
};

exports.bulkImport = async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        
        // 1. Read Excel
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        const summary = { success: 0, failed: 0, errors: [] };

        // 2. Fetch all existing users to check for duplicates inside the same OU
        const existingUsers = await search(client, getOrgBase(), { 
            scope: "sub", 
            filter: "(objectClass=inetOrgPerson)", 
            attributes: ["uid", "mail", "mobile", "cn", "description", "dn"] 
        });

        // Group existing users by their OU (Department)
        const usersByOu = {};
        existingUsers.forEach(u => {
            const match = u.dn ? u.dn.match(/ou=([^,]+)/i) : null;
            const ou = match ? match[1].toLowerCase() : 'general';
            if (!usersByOu[ou]) usersByOu[ou] = [];
            usersByOu[ou].push({
                uid: String(Array.isArray(u.uid) ? u.uid[0] : u.uid || "").trim().toLowerCase(),
                email: String(Array.isArray(u.mail) ? u.mail[0] : u.mail || "").trim().toLowerCase(),
                mobile: String(Array.isArray(u.mobile) ? u.mobile[0] : u.mobile || "").trim(),
                cn: String(Array.isArray(u.cn) ? u.cn[0] : u.cn || "").trim().toLowerCase(),
                secondaryEmail: String(Array.isArray(u.description) ? u.description[0] : u.description || "").trim().toLowerCase()
            });
        });

        // Track rows processed in THIS Excel file to prevent duplicate rows from passing
        const excelProcessedByOu = {};

        // 3. Process each row
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 2; // Excel row number (accounting for 0-index and header)
            
            // Normalize column headers so spaces/capitalization don't break the import
            const user = {};
            Object.keys(row).forEach(k => {
                const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (['mobile', 'mobileno', 'phone'].includes(cleanKey)) user.mobile = row[k];
                else if (['secondaryemail', 'altemail', 'description'].includes(cleanKey)) user.secondaryEmail = row[k];
                else if (cleanKey === 'firstname') user.firstname = row[k];
                else if (cleanKey === 'lastname') user.lastname = row[k];
                else user[cleanKey] = row[k];
            });

            // Extract Variables
            const uid = user.uid ? String(user.uid).trim() : null;
            const fName = user.firstname ? String(user.firstname).trim() : "";
            const lName = user.lastname ? String(user.lastname).trim() : "";
            const email = user.email ? String(user.email).trim() : "";
            const department = user.department ? String(user.department).trim() : "General";
            const secondaryEmail = user.secondaryEmail ? String(user.secondaryEmail).trim() : "";
            const password = user.password ? String(user.password) : "Password@123";
            const role = user.role ? String(user.role).trim().toUpperCase() : "USER";
            
            const cn = `${fName} ${lName}`.trim();
            const ouKey = department.toLowerCase();

            // 🚨 BASIC VALIDATION
            if (!uid || !fName) { 
                summary.failed++; 
                summary.errors.push(`Row ${rowNum}: Missing required fields (uid or firstname).`); 
                continue; 
            }

            // 🚨 PERMISSIONS CHECK
            if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN") {
                if (!isAllowedOU(req.user.allowedOUs, department)) {
                    summary.failed++;
                    summary.errors.push(`Row ${rowNum} (${uid}): Unauthorized to add users to department '${department}'.`);
                    continue;
                }
            }

            // 🚨 STRICT EXCEL MOBILE VALIDATION (Fixes formatting issues)
            let cleanMobile = "";
            if (user.mobile !== undefined && user.mobile !== null && String(user.mobile).trim() !== "") {
                // Strips spaces, dashes, +91, and grabs EXACTLY the last 10 digits
                cleanMobile = String(user.mobile).replace(/\D/g, '').slice(-10);
                
                if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
                    summary.failed++; 
                    summary.errors.push(`Row ${rowNum} (${uid}): Invalid mobile '${user.mobile}'. Must be exactly 10 digits starting with 6, 7, 8, or 9.`); 
                    continue;
                }
            } else {
                summary.failed++; 
                summary.errors.push(`Row ${rowNum} (${uid}): Mobile number is strictly required.`); 
                continue;
            }

            // 🚨 SAME-DEPARTMENT DUPLICATE VALIDATION
            if (!usersByOu[ouKey]) usersByOu[ouKey] = [];
            if (!excelProcessedByOu[ouKey]) excelProcessedByOu[ouKey] = [];

            const ouExisting = usersByOu[ouKey];
            const ouExcel = excelProcessedByOu[ouKey];

            // Helper to check for matches
            const isDuplicate = (field, value) => {
                if (!value || value === "") return false;
                const valLower = String(value).toLowerCase();
                return ouExisting.some(u => u[field] && String(u[field]).toLowerCase() === valLower) || 
                       ouExcel.some(u => u[field] && String(u[field]).toLowerCase() === valLower);
            };

            if (isDuplicate('uid', uid)) { summary.failed++; summary.errors.push(`Row ${rowNum} (${uid}): UID already exists.`); continue; }
            if (isDuplicate('mobile', cleanMobile)) { summary.failed++; summary.errors.push(`Row ${rowNum} (${uid}): Mobile '${cleanMobile}' already exists in dept '${department}'.`); continue; }
            if (isDuplicate('email', email)) { summary.failed++; summary.errors.push(`Row ${rowNum} (${uid}): Email already exists in dept '${department}'.`); continue; }
            if (isDuplicate('secondaryEmail', secondaryEmail)) { summary.failed++; summary.errors.push(`Row ${rowNum} (${uid}): Secondary Email exists in dept '${department}'.`); continue; }
            if (isDuplicate('cn', cn)) { summary.failed++; summary.errors.push(`Row ${rowNum} (${uid}): Name '${cn}' already exists in dept '${department}'.`); continue; }

            // Add to processed list so we don't allow identical rows in the same Excel file
            excelProcessedByOu[ouKey].push({ uid, email, mobile: cleanMobile, cn, secondaryEmail });

            // 🚨 INSERT TO DB & LDAP
            const dn = `uid=${uid},ou=${department},${getOrgBase()}`;
            const entry = {
                cn, 
                sn: lName || fName, 
                uid: uid, 
                mail: email || undefined, 
                mobile: cleanMobile, 
                description: secondaryEmail || undefined,
                businessCategory: role, 
                employeeType: "ACTIVE",
                userPassword: generateSSHA(password), 
                objectClass: ["inetOrgPerson", "top"]
            };

            try {
                // Pre-check DB Mapping
                const dbExists = await dbService.checkUserExists(uid);
                if (dbExists) {
                    summary.failed++; 
                    summary.errors.push(`Row ${rowNum} (${uid}): UID already exists in PostgreSQL Database.`); 
                    continue;
                }

                const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
                await dbService.insertUserMapping(uid, password, userIP, dn);

                // Add to LDAP
                await new Promise((resolve, reject) => {
                    client.add(dn, cleanEntry(entry), (err) => err ? reject(err) : resolve());
                });
                
                summary.success++;
            } catch (err) {
                summary.failed++; 
                summary.errors.push(`Row ${rowNum} (${uid}): LDAP Error - ${err.message}`);
            }
        }

        await logAction(req, "BULK_IMPORT", req.user?.uid || "Admin", req.user?.role, "ACTIVE", `Imported ${summary.success} users`);
        return res.status(200).json({ summary });

    } catch (err) {
        console.error("Bulk Import Error:", err);
        return res.status(500).json({ message: "Bulk import failed: " + err.message });
    } finally {
        try { client.unbind(); } catch (e) {}
    }
};

exports.exportUsers = async (req, res) => {
    if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "ADMIN" && req.user.role !== "super_admin") {
        return errorResponse(res, "Unauthorized", 403);
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        
        // 🚨 UPDATE: Added "description" (secondary email) to attributes to fetch
        const users = await search(client, getOrgBase(), {
            scope: "sub", filter: "(objectClass=inetOrgPerson)",
            attributes: ["uid", "cn", "sn", "mail", "mobile", "businessCategory", "description", "createTimestamp"]
        });

        let data = users.map(u => {
            const ouMatch = u.dn ? u.dn.match(/ou=([^,]+)/i) : null;
            
            const rawCn = Array.isArray(u.cn) ? u.cn[0] : (u.cn || "");
            const rawSn = Array.isArray(u.sn) ? u.sn[0] : (u.sn || "");

            // Cleanly split first and last name
            let fName = rawCn;
            let lName = rawSn;

            if (rawCn.includes(" ")) {
                fName = rawCn.split(" ")[0];
                lName = rawSn || rawCn.substring(rawCn.indexOf(" ") + 1);
            } else if (!rawSn || rawSn.toLowerCase() === rawCn.toLowerCase()) {
                lName = ""; 
            }

            // 🚨 EXACT MATCH TO YOUR IMPORT TEMPLATE HEADERS
            return {
                "uid": Array.isArray(u.uid) ? u.uid[0] : u.uid,
                "firstname": fName,
                "lastname": lName,
                "email": Array.isArray(u.mail) ? u.mail[0] : (u.mail || ""),
                "department": ouMatch ? ouMatch[1] : 'General',
                "password": "", // Blank for security, ready for template reuse
                "role": Array.isArray(u.businessCategory) ? u.businessCategory[0] : (u.businessCategory || "USER"),
                "secondary email": Array.isArray(u.description) ? u.description[0] : (u.description || ""),
                "Mobile": Array.isArray(u.mobile) ? u.mobile[0] : (u.mobile || "")
            };
        });

        // Filter the export list for Admins so they only see their allowed OUs
        if (req.user.role !== "SUPER_ADMIN" && req.user.role !== "super_admin") {
            data = data.filter(u => isAllowedOU(req.user.allowedOUs, u.department));
        }

        // 🚨 REMOVED: We no longer strip the "department" field out, so it stays in the Excel file!

        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(wb, ws, "Users");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

        res.setHeader("Content-Disposition", "attachment; filename=Directory_Users.xlsx");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.send(buffer);
    } catch (err) {
        console.error("Export Error:", err);
        return errorResponse(res, "Export failed", 500);
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

    // 🚨 AGGRESSIVE CATCH: Look everywhere for the variables
    const name = req.body.name || req.body.ouName || req.params.name || req.query.name || req.query.ouName;
    
    // Sometimes FormData stringifies boolean/null values, so we carefully extract the DN
    let providedDn = req.body.dn || req.query.dn;
    if (providedDn === "undefined" || providedDn === "null") providedDn = null;

    if (!name && !providedDn) {
        return res.status(400).json({ message: "Department name or DN is required" });
    }

    const client = createClient();
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        
        // 🚨 THE FIX: Use the exact provided DN. If it's missing, rebuild it using the root base.
        const targetDn = providedDn ? providedDn : `ou=${name},${getOrgBase()}`;

        console.log(`🗑️ Attempting to delete exact DN: ${targetDn}`);

        // Ensure OU is empty before deleting
        const users = await search(client, targetDn, { scope: "one", filter: "(objectClass=*)" });
        if (users.length > 0) {
            return res.status(400).json({ message: "Cannot delete: Department contains users or nested OUs" });
        }

        // Delete the OU
        await new Promise((resolve, reject) => {
            client.del(targetDn, (err) => err ? reject(err) : resolve());
        });

        await logAction(req, "DELETE_OU", req.user?.uid || "Admin", "INACTIVE", `Deleted Department: ${targetDn}`);
        return successResponse(res, null, "Department deleted");

    } catch (err) {
        console.error("🚨 LDAP Delete OU Error:", err.message);
        return res.status(500).json({ message: "Delete failed: " + err.message });
    } finally {
        try { client.unbind(); } catch (e) { }
    }
};

exports.bulkDelete = async (req, res) => {
    const { uids } = req.body;
    if (!uids || !Array.isArray(uids) || uids.length === 0) return res.status(400).json({ message: "No UIDs provided" });

    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN" && !req.user.canWrite) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const client = createClient();
    let deleted = 0;
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        for (const uid of uids) {
            try {
                const searchRes = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ['dn'] });
                if (searchRes.length > 0) {
                    await new Promise((resolve, reject) => client.del(searchRes[0].dn, (err) => err ? reject(err) : resolve()));
                    await dbService.deleteUserMapping(uid);
                    deleted++;
                }
            } catch(e) { console.error(`Failed to delete ${uid}`, e); }
        }
        await logAction(req, "BULK_DELETE", req.user?.uid || "Admin", "ACTIVE", `Bulk deleted ${deleted} users`);
        return successResponse(res, null, `Successfully deleted ${deleted} users`);
    } catch (err) {
        return res.status(500).json({ message: "Bulk delete failed" });
    } finally { try { client.unbind(); } catch (e) {} }
};

exports.bulkSuspend = async (req, res) => {
    const { uids } = req.body;
    if (!uids || !Array.isArray(uids) || uids.length === 0) return res.status(400).json({ message: "No UIDs provided" });

    if (req.user.role !== "super_admin" && req.user.role !== "SUPER_ADMIN" && !req.user.canWrite) {
        return res.status(403).json({ message: "Unauthorized" });
    }

    const client = createClient();
    let suspended = 0;
    try {
        await bind(client, process.env.LDAP_BIND_DN, process.env.LDAP_BIND_PASSWORD);
        for (const uid of uids) {
            try {
                const searchRes = await search(client, getOrgBase(), { scope: "sub", filter: `(uid=${uid})`, attributes: ['dn'] });
                if (searchRes.length > 0) {
                    const userDN = searchRes[0].dn;
                    await dbService.updateUserStatus(uid, false); 
                    
                    await new Promise((resolve, reject) => {
                        const change = new ldap.Change({ operation: 'replace', modification: { type: 'employeeType', values: ['INACTIVE'] } });
                        client.modify(userDN, change, (err) => err ? reject(err) : resolve());
                    });
                    suspended++;
                }
            } catch(e) { console.error(`Failed to suspend ${uid}`, e); }
        }
        await logAction(req, "BULK_SUSPEND", req.user?.uid || "Admin", "INACTIVE", `Bulk suspended ${suspended} users`);
        return successResponse(res, null, `Successfully suspended ${suspended} users`);
    } catch (err) {
        return res.status(500).json({ message: "Bulk suspend failed" });
    } finally { try { client.unbind(); } catch (e) {} }
};

exports.getSessionLogs = async (req, res) => {
    try { const logs = await getSessionLogs(); return successResponse(res, logs); }
    catch (err) { return errorResponse(res, "Error fetching session logs"); }
};

exports.getAuditLogs = async (req, res) => {
    try { const logs = await getAuditLogs(); return successResponse(res, logs); }
    catch (err) { return errorResponse(res, "Error fetching audit logs"); }
};