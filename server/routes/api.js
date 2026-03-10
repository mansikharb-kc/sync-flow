const express = require('express');
const router = express.Router();
const axios = require('axios');
const { syncSheetToDb } = require('../services/syncService');
const { db } = require('../db');

const formatAxiosError = (err) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const details = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : (err?.message || 'Unknown error');
    return { status, details };
};

// Trigger Sync (Background)
router.post('/sync', (req, res) => {
    const triggerType = 'MANUAL';

    // Start sync in background
    syncSheetToDb(triggerType)
        .then(result => {
            console.log('✅ Background sync finished:', result.batchId);
        })
        .catch(error => {
            if (error.message !== 'SYNC_IN_PROGRESS') {
                console.error('❌ Background sync failed:', error);
            }
        });

    // Respond immediately
    res.json({
        started: true,
        message: 'Sync started in the background. Please refresh in a few minutes.'
    });
});

// External Cron Trigger (Wakes up server if asleep)
router.get('/cron', async (req, res) => {
    console.log('⏰ External cron trigger received');
    try {
        await syncSheetToDb('AUTO');
        res.json({ success: true, message: 'Cron sync completed' });
    } catch (error) {
        if (error.message === 'SYNC_IN_PROGRESS') {
            return res.json({ success: true, message: 'Sync already in progress' });
        }
        console.error('❌ External cron trigger failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Stats
router.get('/stats', async (req, res) => {
    const { getStats } = require('../services/dbService');
    const stats = await getStats();
    res.json(stats);
});

// Get Sync History (with Filters)
router.get('/history', async (req, res) => {
    try {
        const { startDate, endDate, search } = req.query;

        let query = 'SELECT * FROM "sync_logs"';
        const params = [];
        const conditions = [];

        if (startDate) {
            conditions.push(`sync_timestamp >= $${params.length + 1}`);
            params.push(startDate);
        }

        if (endDate) {
            conditions.push(`sync_timestamp <= $${params.length + 1}`);
            params.push(endDate); // Ensure frontend sends end of day or backend handles it
        }

        if (search) {
            conditions.push(`(sheet_name ILIKE $${params.length + 1} OR status ILIKE $${params.length + 1})`);
            params.push(`%${search}%`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY sync_timestamp DESC LIMIT 100';

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        // If table doesn't exist yet, return empty
        if (error.code === '42P01') { // undefined_table
            return res.json([]);
        }
        res.status(500).json({ error: error.message });
    }
});

// Get All Leads (Global List)
router.get('/leads', async (req, res) => {
    let { search, category = 'all', limit = 50, offset = 0 } = req.query;
    try {
        let query = 'SELECT * FROM "leads"';
        let countQuery = 'SELECT COUNT(*) FROM "leads"';
        const params = [];

        search = (search || '').trim();

        if (search) {
            let searchableCols = [];

            // Map frontend categories to database columns
            switch (category) {
                case 'city': searchableCols = ['"city"']; break;
                case 'email': searchableCols = ['"email"']; break;
                case 'phone': searchableCols = ['"phone"']; break;
                case 'campaign': searchableCols = ['"campaign_name"']; break;
                case 'brand': searchableCols = ['"brand_name"']; break;
                case 'name': searchableCols = ['"full_name"']; break;
                default:
                    // 'all' includes core fields and sheet/form identifiers
                    searchableCols = [
                        '"full_name"',
                        '"email"',
                        '"city"',
                        '"phone"',
                        '"sheet_id"',
                        '"brand_name"',
                        '"company_name"',
                        '"campaign_name"',
                        '"form_name"'
                    ];
            }

            const searchClause = searchableCols.map(col => `${col}::text ILIKE $1`).join(' OR ');
            query += ` WHERE ${searchClause}`;
            countQuery += ` WHERE ${searchClause}`;
            params.push(`%${search}%`);
        }

        // Final query for data
        const dataQuery = query + ` ORDER BY _created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        const dataParams = [...params, parseInt(limit), parseInt(offset)];

        const { rows } = await db.query(dataQuery, dataParams);
        const { rows: countRows } = await db.query(countQuery, params);

        res.json({
            leads: rows,
            total: parseInt(countRows[0].count),
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
    } catch (error) {
        console.error('Leads Search Error:', error);
        if (error.code === '42P01') { // undefined_table
            return res.json({ leads: [], total: 0 });
        }
        res.status(500).json({
            error: error.message,
            stack: error.stack
        });
    }
});

// Get Table Data (optional filter by batchId)
router.get('/data/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const { batchId, syncLogId } = req.query;

    try {
        // Validate tableName to prevent SQL injection (basic check)
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
            return res.status(400).json({ error: 'Invalid table name' });
        }

        let query = `SELECT * FROM "${tableName}"`;
        const params = [];

        if (syncLogId) {
            query += ` WHERE sync_log_id = $1`;
            params.push(syncLogId);
        } else if (batchId) {
            query += ` WHERE _batch_id = $1`;
            params.push(batchId);
        }

        query += ` ORDER BY _created_at DESC LIMIT 500`;

        const { rows } = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Record (Standard) with Rewrite Logic
router.delete('/data/:tableName/:id', async (req, res) => {
    const { tableName, id } = req.params;

    if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
        return res.status(400).json({ error: 'Invalid table name' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const pkColumn = 'sheet_id';

        // 1. Delete the specific record
        const resDel = await client.query(`DELETE FROM "${tableName}" WHERE "${pkColumn}" = $1`, [id]);

        if (resDel.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Record not found' });
        }

        // 2. Tombstone: Record deletion to prevent re-sync
        await client.query('INSERT INTO "deleted_leads" (sheet_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);

        // 3. Special Rewrite Logic (User Instruction)
        if (tableName === 'leads') {
            // No additional logic needed for standard deletion.
        }

        await client.query('COMMIT');
        res.json({ success: true, message: 'Record deleted and table rewritten successfully' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete failed:', error);
        res.status(500).json({ error: error.message });
    } finally {
        client.release();
    }
});

// --- AUTHENTICATION FLOW (MANDATORY) ---

// 1. Request OTP (Registration Step 1)
router.post('/request-otp', async (req, res) => {
    let { email, password, confirmPassword } = req.body;
    const { sendAdminOtp } = require('../services/emailService');

    if (!email || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    email = email.toLowerCase().trim();

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' });
    }

    try {
        const { rows: userExists } = await db.query('SELECT * FROM "users" WHERE email = $1', [email]);
        if (userExists.length > 0) {
            return res.status(400).json({ error: 'User already exists. Please log in.' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

        await db.query(
            'INSERT INTO "otps" (email, otp, expires_at, verified) VALUES ($1, $2, $3, $4)',
            [email, otp, expiresAt, false]
        );

        console.log(`📩 OTP for ${email}: ${otp} (Sent to Admin)`);
        await sendAdminOtp(email, otp);

        res.json({
            success: true,
            message: 'Access request sent! Please contact the administrator for the 6-digit verification code.'
        });
    } catch (error) {
        console.error('OTP Request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// 2. Verify OTP (Registration Step 2)
router.post('/verify-otp', async (req, res) => {
    let { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: 'Email and OTP are required' });
    }

    email = email.toLowerCase().trim();

    try {
        const { rows } = await db.query(
            'SELECT * FROM "otps" WHERE email = $1 AND otp = $2 AND expires_at > CURRENT_TIMESTAMP AND verified = false ORDER BY created_at DESC LIMIT 1',
            [email, otp]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        await db.query('UPDATE "otps" SET verified = true WHERE id = $1', [rows[0].id]);

        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        console.error('OTP Verify error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// 3. Complete Registration (User Creation)
router.post('/register', async (req, res) => {
    let { email, password } = req.body;
    const bcrypt = require('bcryptjs');

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    email = email.toLowerCase().trim();

    try {
        const { rows: otpRows } = await db.query(
            'SELECT * FROM "otps" WHERE email = $1 AND verified = true AND created_at > (CURRENT_TIMESTAMP - INTERVAL \'20 minutes\') ORDER BY created_at DESC LIMIT 1',
            [email]
        );

        if (otpRows.length === 0) {
            return res.status(403).json({ error: 'Please verify OTP before registering' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO "users" (email, password_hash, status) VALUES ($1, $2, $3)',
            [email, hashedPassword, 'ACTIVE']
        );

        await db.query('DELETE FROM "otps" WHERE email = $1', [email]);

        res.status(201).json({
            success: true,
            message: 'Account created successfully! You can now log in.'
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'User already exists' });
        }
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3b. One-time Admin Bootstrap (for setup/debug only)
// Creates a default admin user if no users exist.
router.post('/bootstrap-admin', async (req, res) => {
    try {
        const { rows: existing } = await db.query('SELECT COUNT(*)::int AS count FROM "users"');
        if (existing[0].count > 0) {
            return res.status(400).json({ error: 'Users already exist. Bootstrap disabled.' });
        }

        const bcrypt = require('bcryptjs');
        const email = (process.env.PRIMARY_ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim();
        const password = process.env.ADMIN_PASSWORD || 'Admin@123';
        const hash = await bcrypt.hash(password, 10);

        await db.query(
            'INSERT INTO "users" (email, password_hash, status) VALUES ($1, $2, $3)',
            [email, hash, 'ACTIVE']
        );

        res.json({
            success: true,
            email,
            password,
            note: 'Use these credentials on the login screen. Password is case-sensitive.'
        });
    } catch (error) {
        console.error('Bootstrap admin error:', error);
        res.status(500).json({ error: 'Failed to bootstrap admin user' });
    }
});

// 4. Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const bcrypt = require('bcryptjs');

        // Debugging for Render
        console.log("LOGIN BODY:", { email, password: password ? '********' : 'MISSING' });

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const { rows } = await db.query('SELECT * FROM "users" WHERE email = $1', [normalizedEmail]);

        // FIX 3: Handle missing user safely
        if (rows.length === 0) {
            console.log(`[Login Info] User not found: ${normalizedEmail}`);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = rows[0];

        // FIX 2: Ensure correct bcryptjs usage
        const isMatch = await bcrypt.compare(password, user.password_hash);

        console.log(`[Login Info] Match result for ${normalizedEmail}: ${isMatch}`);

        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.status !== 'ACTIVE') {
            console.log(`[Login Info] Account not active: ${normalizedEmail}`);
            return res.status(403).json({ error: 'Your account is not active' });
        }

        console.log(`[Login Success] User: ${normalizedEmail}`);
        const { password_hash: _, ...userInfo } = user;
        res.json({ success: true, user: userInfo });

    } catch (error) {
        // Render logs will now show exact reason
        console.error("LOGIN ERROR:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- ZOHO CRM INTEGRATION ---
const { generateTokens, getAccessToken, deleteLeadFromZoho, getAuthUrl, mapToZohoLeadType, getCurrentZohoUser } = require('../services/zohoService');

// 0. Get Auth URL for Connection
router.get('/zoho/auth-url', (req, res) => {
    res.json({ url: getAuthUrl() });
});

// 1. Generate Tokens (One-time Setup)
router.post('/zoho/auth', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Authorization code is required' });

    try {
        await generateTokens(code);
        res.json({ success: true, message: 'Zoho CRM Connected Successfully!' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Callback handler for OAuth Redirect
router.get('/zoho/callback', async (req, res) => {
    console.log('📥 Zoho Callback Received:', req.query);
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('<h1>Auth Error</h1><p>No code received from Zoho.</p>');
    }

    try {
        // Exchange code for tokens immediately
        await generateTokens(code);

        res.send(`
            <div style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #4f46e5;">✅ Zoho CRM Connected!</h1>
                <p>The authorization was successful. Your tokens have been stored safely.</p>
                <p>You can now close this window and go back to the SyncFlow dashboard.</p>
                <button onclick="window.close()" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer;">Close Window</button>
            </div>
        `);
    } catch (error) {
        console.error('Callback Error:', error.message);
        res.status(500).send(`<h1>Connection Failed</h1><p>${error.message}</p>`);
    }
});

// 2. Check Connection Status
router.get('/zoho/status', async (req, res) => {
    try {
        await getAccessToken(); // Will throw if not configured
        // Also validate API permission by calling CurrentUser endpoint
        try {
            const me = await getCurrentZohoUser();
            res.json({ connected: true, apiAccess: true, user: me.user || null });
        } catch (e) {
            res.json({
                connected: true,
                apiAccess: false,
                error: e.details || e.message,
                status: e.status || null
            });
        }
    } catch (error) {
        res.json({ connected: false, error: error.message });
    }
});

// 2b. Debug: show connected Zoho user
router.get('/zoho/me', async (req, res) => {
    try {
        const me = await getCurrentZohoUser();
        res.json(me);
    } catch (e) {
        res.status(e.status || 500).json({ error: e.details || e.message });
    }
});

// 3. Get Leads for Zoho Export View (UPDATED to use crm_leads & crm_records)
router.get('/zoho/leads', async (req, res) => {
    const { status = 'Pending' } = req.query;
    const limit = parseInt(req.query.limit) || 1000;
    try {
        let leads = [];
        console.log(`[zoho/leads] status=${status}, limit=${limit}`);
        if (status === 'Success') {
            const { rows } = await db.query(`SELECT id, source_id, first_name, last_name, company, email, phone, lead_type, city, crm_status, zoho_id, insert_time, crm_insert_time FROM crm_records ORDER BY crm_insert_time DESC LIMIT $1`, [limit]);
            leads = rows;
        } else if (status === 'Active') {
            const { rows } = await db.query(
                `SELECT * FROM crm_leads WHERE crm_status = ANY($1::text[]) ORDER BY insert_time DESC LIMIT $2`,
                [['Pending', 'Failed'], limit]
            );
            leads = rows;
        } else {
            const { rows } = await db.query(`SELECT * FROM crm_leads WHERE crm_status = $1 ORDER BY insert_time DESC LIMIT $2`, [status, limit]);
            leads = rows;
        }
        console.log(`[zoho/leads] Returning ${leads.length} results`);

        // Aggregate stats from both tables
        const { rows: stagedStats } = await db.query(`SELECT crm_status as status, COUNT(*) as count FROM crm_leads GROUP BY crm_status`);
        const { rows: successCount } = await db.query(`SELECT COUNT(*) as count FROM crm_records`);

        const totalStats = [
            ...stagedStats.filter(s => s.status !== 'Success'),
            { status: 'Success', count: parseInt(successCount[0].count) }
        ];

        res.json({ leads, stats: totalStats });
    } catch (error) {
        console.error('[zoho/leads] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// 4. Trigger Sync (Manual Push for Staged Leads) - handles large batches via 100-record Zoho API chunks
router.post('/zoho/sync', async (req, res) => {
    const { leadIds } = req.body; // Array of IDs from crm_leads

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
        return res.status(400).json({ error: 'No leads selected for sync' });
    }

    try {
        let accessToken, apiDomain;
        try {
            const tokenData = await getAccessToken();
            accessToken = tokenData.accessToken;
            apiDomain = tokenData.apiDomain;
        } catch (authErr) {
            console.error('Zoho auth error:', authErr.message);
            return res.status(403).json({ error: 'ZOHO_NOT_CONFIGURED: ' + authErr.message });
        }

        // Fetch full details for these specific staged leads
        const { rows: stagedLeads } = await db.query(
            "SELECT * FROM crm_leads WHERE id = ANY($1) ORDER BY id ASC",
            [leadIds]
        );

        if (stagedLeads.length === 0) return res.json({ success: true, results: [] });

        const results = [];
        const ZOHO_API_CHUNK = 100; // Zoho API max records per request

        // Process in chunks of 100 to respect Zoho API limits
        for (let chunkStart = 0; chunkStart < stagedLeads.length; chunkStart += ZOHO_API_CHUNK) {
            const chunk = stagedLeads.slice(chunkStart, chunkStart + ZOHO_API_CHUNK);

            const payloadData = chunk.map(lead => {
                const data = {
                    Last_Name: lead.last_name || '',
                    First_Name: lead.first_name || '',
                    Company: lead.company || '',
                    Email: lead.email || null,
                    Phone: lead.phone || null,
                    Mobile: lead.phone || null
                };
                if (lead.city) data.City = lead.city;
                // Only send Lead_Source when lead_type is a known non-default value
                if (lead.lead_type) {
                    const finalType = mapToZohoLeadType(lead.lead_type);
                    data.Lead_Source = finalType;
                    data.Lead_Type = finalType; // Explicitly map to Lead_Type as well
                }
                return data;
            });

            let zohoResponses = [];
            try {
                const response = await axios.post(
                    `${apiDomain}/crm/v2/Leads`,
                    { data: payloadData },
                    {
                        headers: {
                            'Authorization': `Zoho-oauthtoken ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );
                zohoResponses = response.data.data || [];
            } catch (chunkError) {
                const formatted = formatAxiosError(chunkError);
                console.error(
                    `Chunk ${chunkStart / ZOHO_API_CHUNK + 1} failed (status=${formatted.status || 'n/a'}):`,
                    formatted.details
                );
                for (const lead of chunk) {
                    const errDetails = formatted.details?.slice(0, 1500);
                    await db.query(
                        `UPDATE crm_leads SET crm_status = 'Failed', error_message = $1 WHERE id = $2`,
                        [errDetails || chunkError.message, lead.id]
                    );
                    results.push({ id: lead.source_id, status: 'FAILED', error: errDetails || chunkError.message });
                }
                continue;
            }

            // Process each response
            for (let j = 0; j < zohoResponses.length; j++) {
                const zohoRes = zohoResponses[j];
                const lead = chunk[j];

                try {
                    if (zohoRes.status === 'success') {
                        // Insert into crm_records (success history panel)
                        await db.query(`
                            INSERT INTO crm_records (source_id, first_name, last_name, company, email, phone, lead_type, city, crm_status, insert_time, crm_insert_time, zoho_id)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Success', $9, NOW(), $10)
                            ON CONFLICT (source_id) DO UPDATE SET
                                first_name = EXCLUDED.first_name,
                                last_name = EXCLUDED.last_name,
                                company = EXCLUDED.company,
                                email = EXCLUDED.email,
                                phone = EXCLUDED.phone,
                                lead_type = EXCLUDED.lead_type,
                                city = EXCLUDED.city,
                                crm_status = EXCLUDED.crm_status,
                                crm_insert_time = NOW(),
                                zoho_id = EXCLUDED.zoho_id
                        `, [lead.source_id, lead.first_name, lead.last_name, lead.company, lead.email, lead.phone, lead.lead_type, lead.city, lead.insert_time, zohoRes.details.id]);

                        // Remove from pending staging
                        await db.query('DELETE FROM crm_leads WHERE id = $1', [lead.id]);
                        results.push({ id: lead.source_id, status: 'SUCCESS', zoho_id: zohoRes.details.id });
                    } else {
                        await db.query(`
                            UPDATE crm_leads SET crm_status = 'Failed', error_message = $1 WHERE id = $2
                        `, [zohoRes.message, lead.id]);
                        results.push({ id: lead.source_id, status: 'FAILED', error: zohoRes.message });
                    }
                } catch (procError) {
                    console.error(`Error processing Zoho response for lead ${lead.source_id}:`, procError.message);
                    results.push({ id: lead.source_id, status: 'FAILED', error: `Internal processing error: ${procError.message}` });
                }
            }

            // 500ms delay between chunks to avoid Zoho rate limits
            if (chunkStart + ZOHO_API_CHUNK < stagedLeads.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        const successCount = results.filter(r => r.status === 'SUCCESS').length;
        console.log(`Zoho Sync Complete: ${successCount}/${results.length} records pushed`);
        res.json({ success: true, results });
    } catch (error) {
        console.error('CRITICAL Zoho Sync Error:', error);
        res.status(500).json({
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// --- CRM STAGING PERSPECTIVE (NEW) ---

// 5. Get Staged Leads
router.get('/crm-leads', async (req, res) => {
    const { status = 'Pending', limit = 50, offset = 0 } = req.query;
    try {
        const query = `
            SELECT * FROM crm_leads 
            WHERE crm_status = $1
            ORDER BY insert_time DESC 
            LIMIT $2 OFFSET $3
            `;
        const { rows: leads } = await db.query(query, [status, limit, offset]);

        const { rows: counts } = await db.query(`
            SELECT crm_status, COUNT(*) as count 
            FROM crm_leads 
            GROUP BY crm_status
            `);

        res.json({ leads, stats: counts });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 6. Push to Staging (Manual)
router.post('/crm-sync/stage', async (req, res) => {
    try {
        // We can require the script logic or just execute it
        // For simplicity, let's just trigger the sync logic
        const { syncToCrmStaging } = require('../services/stagingService');
        await syncToCrmStaging();
        res.json({ success: true, message: 'Leads staged successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. Process Staging to Zoho
router.post('/crm-sync/process', async (req, res) => {
    try {
        const { syncToZoho } = require('../services/stagingService');
        const results = await syncToZoho();
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. Undo All Zoho Pushes (Move everything from crm_records to crm_leads)
router.post('/zoho/undo-all', async (req, res) => {
    console.log('🔄 Undo All Request Received');
    try {
        await db.query('BEGIN');

        // Move all from crm_records to crm_leads
        await db.query(`
            INSERT INTO crm_leads (source_id, first_name, last_name, company, email, phone, lead_type, city, crm_status, insert_time)
            SELECT source_id, first_name, last_name, company, email, phone, lead_type, city, 'Pending', insert_time
            FROM crm_records
            ON CONFLICT (source_id) DO UPDATE 
            SET crm_status = 'Pending', 
                error_message = NULL,
                insert_time = EXCLUDED.insert_time,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                company = EXCLUDED.company,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                lead_type = EXCLUDED.lead_type,
                city = EXCLUDED.city
        `);

        // Clear crm_records
        await db.query('TRUNCATE TABLE crm_records');

        await db.query('COMMIT');

        res.json({
            success: true,
            message: 'All records have been moved back to staging. Zoho CRM records were NOT deleted автоматически.'
        });
    } catch (error) {
        await db.query('ROLLBACK');
        console.error('❌ Undo All Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// 9. Undo Zoho Push (Move back from crm_records to crm_leads + Delete from CRM)
router.post('/zoho/undo', async (req, res) => {
    const { leadId } = req.body;
    console.log(`🔄 Undo Request Received for Record ID: ${leadId}`);

    if (!leadId) return res.status(400).json({ error: 'Lead ID is required' });

    try {
        // 1. Get current record from crm_records
        const { rows } = await db.query('SELECT * FROM crm_records WHERE id = $1', [leadId]);

        if (rows.length === 0) {
            // Check if it's still in crm_leads (might be a failed record reset)
            const { rows: stagedRows } = await db.query('SELECT * FROM crm_leads WHERE id = $1', [leadId]);
            if (stagedRows.length > 0) {
                await db.query("UPDATE crm_leads SET crm_status = 'Pending', error_message = NULL WHERE id = $1", [leadId]);
                return res.json({ success: true, message: 'Lead status reset to Pending successfully.' });
            }
            return res.status(404).json({ error: 'Record not found in database.' });
        }

        const lead = rows[0];
        const zohoId = lead.zoho_id;

        // 2. Move back to crm_leads (Use ON CONFLICT to handle existing records)
        // Including lead_type and city which were added recently
        await db.query(`
            INSERT INTO crm_leads (source_id, first_name, last_name, company, email, phone, lead_type, city, crm_status, insert_time)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending', $9)
            ON CONFLICT (source_id) DO UPDATE 
            SET crm_status = 'Pending', 
                error_message = NULL,
                insert_time = EXCLUDED.insert_time,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                company = EXCLUDED.company,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                lead_type = EXCLUDED.lead_type,
                city = EXCLUDED.city
        `, [lead.source_id, lead.first_name, lead.last_name, lead.company, lead.email, lead.phone, lead.lead_type, lead.city, lead.insert_time]);

        // 3. Delete from crm_records
        await db.query('DELETE FROM crm_records WHERE id = $1', [leadId]);

        // 4. Attempt Zoho Deletion
        let zohoDeleted = false;
        if (zohoId && zohoId.trim() !== '') {
            try {
                await deleteLeadFromZoho(zohoId);
                zohoDeleted = true;
            } catch (zohoError) {
                console.error('⚠️ Zoho CRM Deletion Failed during Undo:', zohoError.message);
            }
        }

        res.json({
            success: true,
            message: zohoId
                ? (zohoDeleted ? 'Successfully Reverted & Deleted from CRM!' : 'Moved back to staged, but Zoho deletion failed (might have been manually deleted).')
                : 'Moved back to staged leads.'
        });
    } catch (error) {
        console.error(`❌ Undo Error for ${leadId}:`, error);
        res.status(500).json({ error: error.message });
    }
});



module.exports = router;
