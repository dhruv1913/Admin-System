require('dotenv').config(); 
const crypto = require('crypto'); // 👈 1. Added built-in crypto module

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

// 👈 2. Added a secure password generator function
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
                s.ou AS ldap_ou
            FROM admin_add_user_requests r
            LEFT JOIN service_ldap_settings s ON r.service_id = s.service_id
            WHERE r.cron_status = false 
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

                    const targetOU = req.ldap_ou ? req.ldap_ou : 'ou=Users';
                    const newUserDN = `uid=${req.ldap_uid},${targetOU},${req.base_dn}`;
                    
                    const tempPassword = generateSecurePassword(); // 👈 3. Generate the password

                    const newUserEntry = {
                        cn: fullName,
                        sn: lName || fName || "Unknown",
                        uid: req.ldap_uid,
                        mail: cleanString(req.primary_email),
                        mobile: cleanString(req.mobile_number),
                        title: cleanString(req.designation),
                        employeeType: req.user_status ? req.user_status.toUpperCase() : 'ACTIVE',
                        userPassword: tempPassword, // 👈 4. Assign it to LDAP
                        objectClass: ['top', 'person', 'organizationalPerson', 'inetOrgPerson']
                    };

                    await new Promise((resolve, reject) => {
                        ldapClient.add(newUserDN, newUserEntry, (err) => err ? reject(err) : resolve());
                    });
                    
                    console.log(`   ➕ User Successfully Added to LDAP: ${newUserDN}`);
                    
                    // 👈 5. Save the password to the database remarks so you don't lose it!
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