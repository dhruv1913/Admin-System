require('dotenv').config(); 

const { Pool } = require('pg');
const ldap = require('ldapjs');

// ----------------------------------------------------------------------------
// 1. CONFIGURATION (Now with TWO databases)
// ----------------------------------------------------------------------------
const CONFIG = {
    dbCAuth: {
        user: 'postgres',
        host: 'localhost',
        database: 'cAuth',     // 👈 Handles the requests table
        password: '1234',
        port: 5432,
    },
    dbCompany: {
        user: 'postgres',
        host: 'localhost',
        database: 'Company',   // 👈 Handles the user mapping table
        password: '1234',
        port: 5432,
    },
    ldap: {
        url: process.env.LDAP_URL || 'MISSING_URL',
        bindDN: process.env.LDAP_BIND_DN || 'MISSING_BIND_DN',
        bindPassword: process.env.LDAP_BIND_PASSWORD || 'MISSING_PASSWORD',
        baseDN: process.env.LDAP_BASE_DN || 'MISSING_BASE_DN'
    }
};

// Create TWO separate connections
const poolCAuth = new Pool(CONFIG.dbCAuth);
const poolCompany = new Pool(CONFIG.dbCompany);

const cleanString = (str) => str ? String(str).trim() : "";

// ----------------------------------------------------------------------------
// 2. MAIN AUTOMATION LOGIC
// ----------------------------------------------------------------------------
async function runAutoSync() {
    console.log(`\n⏳ [${new Date().toLocaleTimeString()}] Starting Sync Process...`);
    
    if (CONFIG.ldap.baseDN === 'MISSING_BASE_DN') {
        console.log("🛑 ERROR: Cannot read .env file. Check your paths!");
        return;
    }

    let ldapClient = null;

    try {
        // 1. Read requests from cAuth
        const res = await poolCAuth.query(`
            SELECT * FROM admin_add_user_requests 
            WHERE cron_status = false 
            AND is_deleted = false 
            AND action != 'ADD' 
            ORDER BY created_on ASC
        `);
        
        const requests = res.rows;
        if (requests.length === 0) {
            console.log("✅ No pending Edit or Status requests found.");
            return;
        }

        console.log(`📥 Found ${requests.length} pending request(s). Connecting to LDAP...`);

        ldapClient = ldap.createClient({ url: CONFIG.ldap.url });
        await new Promise((resolve, reject) => {
            ldapClient.bind(CONFIG.ldap.bindDN, CONFIG.ldap.bindPassword, (err) => {
                if (err) reject(err); else resolve();
            });
        });
        console.log("✅ LDAP Bound successfully.");

        for (const req of requests) {
            console.log(`\n⚙️ Processing Request #${req.id} | Action: ${req.action} | UID: ${req.ldap_uid}`);

            try {
                const fName = cleanString(req.first_name);
                const mName = cleanString(req.middle_name);
                const lName = cleanString(req.last_name);
                const fullName = `${fName} ${mName} ${lName}`.replace(/\s+/g, ' ').trim();
                
                // Smart Search in LDAP
                const userDN = await new Promise((resolve, reject) => {
                    ldapClient.search(CONFIG.ldap.baseDN, {
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

                if (!userDN) throw new Error(`User ${req.ldap_uid} does not exist anywhere in LDAP!`);
                console.log(`   🔍 Found user at: ${userDN}`);

                // --- EDIT LOGIC ---
                if (req.action === 'EDIT') {
                    const changes = [];
                    const addChange = (type, value) => {
                        if (value) {
                            changes.push(new ldap.Change({
                                operation: 'replace',
                                modification: { type, values: [value] }
                            }));
                        }
                    };

                    addChange('cn', fullName);
                    addChange('sn', lName || fName);
                    addChange('mail', cleanString(req.primary_email));
                    addChange('mobile', cleanString(req.mobile_number));
                    addChange('title', cleanString(req.designation));

                    if (changes.length > 0) {
                        await new Promise((resolve, reject) => {
                            ldapClient.modify(userDN, changes, (err) => err ? reject(err) : resolve());
                        });
                        console.log(`   ✔️ Updated personal details in LDAP`);
                    }
                } 

                // --- STATUS LOGIC ---
                let targetStatus = req.user_status ? req.user_status.toUpperCase() : null;
                if (req.action === 'DEACTIVATED') targetStatus = 'INACTIVE'; 

                if (targetStatus === 'ACTIVE' || targetStatus === 'INACTIVE') {
                    const isActiveBool = (targetStatus === 'ACTIVE');

                    // 🚨 IMPORTANT: This updates the COMPANY database!
                    await poolCompany.query(
                        `UPDATE ldap_user_mapping SET is_active = $1, updated_on = NOW() WHERE ldap_uid = $2`, 
                        [isActiveBool, req.ldap_uid]
                    );

                    const statusChange = new ldap.Change({
                        operation: 'replace',
                        modification: { type: 'employeeType', values: [targetStatus] }
                    });
                    
                    await new Promise((resolve, reject) => {
                        ldapClient.modify(userDN, statusChange, (err) => err ? reject(err) : resolve());
                    });
                    
                    console.log(`   ✔️ Access status set to [${targetStatus}]`);
                }

                // 🚨 IMPORTANT: This updates the cAuth database to mark it complete!
               await poolCAuth.query(`UPDATE admin_add_user_requests SET cron_status = true, request_status = 'APPROVED', updated_on = CURRENT_TIMESTAMP WHERE id = $1`, [req.id]);
                console.log(`   ✅ Request #${req.id} marked as completed.`);

            } catch (err) {
                console.error(`   ❌ Failed Request #${req.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error("🔥 Fatal Execution Error:", err);
    } finally {
        if (ldapClient) ldapClient.unbind();
        // Close BOTH connections safely
        await poolCAuth.end();
        await poolCompany.end();
        console.log("🛑 Sync finished.\n");
    }
}

runAutoSync();