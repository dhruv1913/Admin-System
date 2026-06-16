require('dotenv').config(); 
const crypto = require('crypto');

const { Pool } = require('pg');
const ldap = require('ldapjs');

// ----------------------------------------------------------------------------
// 1. DATABASE CONFIGURATION 
// ----------------------------------------------------------------------------
const CONFIG = {
    dbCAuth: {
        user: 'postgres',
        host: 'localhost',
        database: 'cAuth',     
        password: '1234',
        port: 5432,
    },
    dbCompany: {
        user: 'postgres',
        host: 'localhost',
        database: 'Company',   
        password: '1234',
        port: 5432,
    }
};

const poolCAuth = new Pool(CONFIG.dbCAuth);
const poolCompany = new Pool(CONFIG.dbCompany);

const cleanString = (str) => str ? String(str).trim() : "";

function generateSecurePassword(length = 12) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        password += charset.charAt(crypto.randomInt(0, n));
    }
    return password;
}

// ----------------------------------------------------------------------------
// 2. MAIN AUTOMATION LOGIC
// ----------------------------------------------------------------------------
async function runAutoSync() {
    console.log(`\n⏳ [${new Date().toLocaleTimeString()}] Starting Sync Process...`);
    
    try {
        const res = await poolCAuth.query(`
            SELECT 
                r.*, 
                s.ldap_url, 
                s.base_dn, 
                s.bind_dn, 
                s.password AS ldap_password,
                s.ou AS ldap_ou,                   -- 👈 1. FIXED MISSING COMMA HERE!
                sv.department_name
            FROM admin_add_user_requests r
            LEFT JOIN service_ldap_settings s ON r.service_id = s.service_id
            LEFT JOIN services sv ON r.service_id = sv.id
            WHERE r.cron_status = false 
            AND r.request_status = 'PENDING'
            AND r.is_deleted = false 
            ORDER BY r.created_on ASC
        `);
        
        const requests = res.rows;
        if (requests.length === 0) {
            console.log("✅ No pending requests found.");
            return;
        }

        console.log(`📥 Found ${requests.length} pending request(s). Processing...`);

        for (const req of requests) {
            console.log(`\n⚙️ Processing Request #${req.id} | Action: ${req.action} | UID: ${req.ldap_uid} | Service ID: ${req.service_id}`);

            let requestStatus = 'PENDING';
            let remarksMessage = '';
            let ldapClient = null;

            try {
                if (!req.ldap_url || !req.base_dn) {
                    throw new Error(`Missing LDAP configuration for Service ID ${req.service_id}`);
                }

                ldapClient = ldap.createClient({ url: req.ldap_url });
                await new Promise((resolve, reject) => {
                    ldapClient.bind(req.bind_dn, req.ldap_password, (err) => err ? reject(err) : resolve());
                });

                const fName = cleanString(req.first_name);
                const mName = cleanString(req.middle_name);
                const lName = cleanString(req.last_name);
                const fullName = `${fName} ${mName} ${lName}`.replace(/\s+/g, ' ').trim();
                
                const existingDN = await new Promise((resolve, reject) => {
                    ldapClient.search(req.base_dn, {
                        filter: `(uid=${req.ldap_uid})`,
                        scope: 'sub', 
                        attributes: ['dn']
                    }, (err, res) => {
                        if (err) return reject(err);
                        
                        let foundDN = null;
                        res.on('searchEntry', (entry) => { foundDN = entry.dn.toString(); });
                        res.on('error', (err) => reject(err));
                        res.on('end', () => resolve(foundDN));
                    });
                });

                // ==========================================
                // ACTION: ADD USER
                // ==========================================
                if (req.action === 'ADD') {
                    if (existingDN) {
                        throw new Error(`User ${req.ldap_uid} already exists in LDAP.`);
                    }

                    // 1. Extract variables FIRST so we can check them
                    const email = cleanString(req.primary_email);
                    const mobile = cleanString(req.mobile_number);
                    const secondaryEmail = cleanString(req.secondary_email);

                    // 2. Build the Duplicate Filter dynamically
                    const filterParts = [];
                    if (email) filterParts.push(`(mail=${email})`);
                    if (mobile) filterParts.push(`(mobile=${mobile})`);
                    if (secondaryEmail) filterParts.push(`(description=${secondaryEmail})`);

                    if (filterParts.length > 0) {
                        const dupFilter = `(|${filterParts.join('')})`; // The '|' means OR
                        console.log(`   🔍 Checking for duplicates: ${dupFilter}`);

                        // 3. Search LDAP using the existing client
                        // 3. Search LDAP using the existing client
                        const duplicateFoundMsg = await new Promise((resolve, reject) => {
                            ldapClient.search(req.base_dn, {
                                filter: dupFilter,
                                scope: 'sub', 
                                attributes: ['uid', 'mail', 'mobile', 'description']
                            }, (err, res) => {
                                if (err) return reject(err);
                                
                                let foundError = null;
                                
                                res.on('searchEntry', (entry) => { 
                                    // 🛠️ The Fix: A safe getter that handles all ldapjs versions
                                    const getAttr = (attrName) => {
                                        if (entry.object && entry.object[attrName]) {
                                            return Array.isArray(entry.object[attrName]) ? entry.object[attrName][0] : entry.object[attrName];
                                        }
                                        if (entry.attributes) {
                                            const attr = entry.attributes.find(a => a.type === attrName);
                                            if (attr) {
                                                const vals = attr.values || attr.vals || [];
                                                return vals[0] || null;
                                            }
                                        }
                                        return null;
                                    };

                                    const foundUid = getAttr('uid') || 'Unknown User';
                                    const foundMail = getAttr('mail');
                                    const foundMobile = getAttr('mobile');
                                    const foundSec = getAttr('description');

                                    // Identify exactly WHICH field caused the collision safely
                                    if (email && foundMail && String(foundMail).toLowerCase() === email.toLowerCase()) {
                                        foundError = `Email '${email}' is already used by user '${foundUid}'.`;
                                    } else if (mobile && foundMobile && String(foundMobile) === mobile) {
                                        foundError = `Mobile '${mobile}' is already used by user '${foundUid}'.`;
                                    } else if (secondaryEmail && foundSec && String(foundSec).toLowerCase() === secondaryEmail.toLowerCase()) {
                                        foundError = `Secondary Email '${secondaryEmail}' is already used by user '${foundUid}'.`;
                                    }
                                });
                                
                                res.on('error', (err) => reject(err));
                                res.on('end', () => resolve(foundError));
                            });
                        });

                        // 4. If a duplicate was found, THROW the error so it saves to the DB Remarks!
                        if (duplicateFoundMsg) {
                            throw new Error(duplicateFoundMsg);
                        }
                    }

                    // --- IF WE PASS THE DUPLICATE CHECK, PROCEED WITH ADDING ---
                    const targetOU = req.ldap_ou ? req.ldap_ou : 'ou=Users';
                    const newUserDN = `uid=${req.ldap_uid},${targetOU},${req.base_dn}`;
                    
                    const tempPassword = generateSecurePassword(); 

                    const newUserEntry = {
                        cn: fullName,
                        sn: lName || fName || "Unknown",
                        uid: req.ldap_uid,
                        employeeType: req.user_status ? req.user_status.toUpperCase() : 'ACTIVE',
                        userPassword: tempPassword, 
                        o: cleanString(req.department_name) || 'Unknown',
                        objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson']
                    };

                    if (email) newUserEntry.mail = email;
                    if (secondaryEmail) newUserEntry.description = secondaryEmail;
                    if (mobile) newUserEntry.mobile = mobile;
                    const jobTitle = cleanString(req.designation);
                    if (jobTitle) newUserEntry.title = jobTitle;

                    await new Promise((resolve, reject) => {
                        ldapClient.add(newUserDN, newUserEntry, (err) => err ? reject(err) : resolve());
                    });
                    console.log(`   ➕ User Successfully Added to LDAP: ${newUserDN}`);
                    
                    remarksMessage = `Success. Temp Password: ${tempPassword}`; 
                    requestStatus = 'APPROVED';
                }

                // ==========================================
                // ACTION: EDIT OR STATUS CHANGE
                // ==========================================
                else {
                    if (!existingDN) {
                        throw new Error(`User ${req.ldap_uid} does not exist anywhere in LDAP!`);
                    }
                    console.log(`   🔍 Found existing user at: ${existingDN}`);

                    if (req.action === 'EDIT') {
                        const changes = [];
                        const addChange = (type, value) => {
                            if (value) changes.push(new ldap.Change({ operation: 'replace', modification: { type, values: [value] } }));
                        };

                        addChange('cn', fullName);
                        addChange('sn', lName || fName);
                        addChange('mail', cleanString(req.primary_email));
                        addChange('mobile', cleanString(req.mobile_number));
                        addChange('title', cleanString(req.designation));
                        addChange('o', cleanString(req.department_name)); // 👈 3. Added department to EDIT logic

                        if (changes.length > 0) {
                            await new Promise((resolve, reject) => {
                                ldapClient.modify(existingDN, changes, (err) => err ? reject(err) : resolve());
                            });
                            console.log(`   ✔️ Updated personal details`);
                        }
                    } 

                    let targetStatus = req.user_status ? req.user_status.toUpperCase() : null;
                    if (req.action === 'DEACTIVATED') targetStatus = 'INACTIVE'; 

                    if (targetStatus === 'ACTIVE' || targetStatus === 'INACTIVE') {
                        const isActiveBool = (targetStatus === 'ACTIVE');

                        await poolCompany.query(
                            `UPDATE ldap_user_mapping SET is_active = $1, updated_on = NOW() WHERE ldap_uid = $2`, 
                            [isActiveBool, req.ldap_uid]
                        );

                        const statusChange = new ldap.Change({
                            operation: 'replace',
                            modification: { type: 'employeeType', values: [targetStatus] }
                        });
                        
                        await new Promise((resolve, reject) => {
                            ldapClient.modify(existingDN, statusChange, (err) => err ? reject(err) : resolve());
                        });
                        console.log(`   ✔️ Access status set to [${targetStatus}]`);
                    }

                    remarksMessage = 'Request processed successfully';
                    requestStatus = 'APPROVED';
                }

            } catch (err) {
                console.error(`   ❌ Failed: ${err.message}`);
                remarksMessage = err.message;
                requestStatus = 'REJECTED';
            } finally {
                if (ldapClient) {
                    ldapClient.unbind((err) => { if(err) console.log("Unbind error ignored"); });
                }

                await poolCAuth.query(
                    `UPDATE admin_add_user_requests 
                     SET cron_status = true, request_status = $1, remarks = $2, updated_on = CURRENT_TIMESTAMP 
                     WHERE id = $3`, 
                    [requestStatus, remarksMessage, req.id]
                );
                console.log(`   ✅ DB Updated -> Status: [${requestStatus}] | Remarks: [${remarksMessage}]`);
            }
        }
    } catch (err) {
        console.error("🔥 Fatal Execution Error in Main Loop:", err);
    } finally {
        await poolCAuth.end();
        await poolCompany.end();
        console.log("🛑 Sync finished.\n");
    }
}

runAutoSync();