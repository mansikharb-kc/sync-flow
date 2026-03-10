/**
 * ============================================
 *  CHECK ALL CONNECTIONS - Comprehensive Test
 * ============================================
 */

require('dotenv').config({ path: __dirname + '/server/.env' });
const { Pool } = require('pg');
const { google } = require('googleapis');
const path = require('path');

const RESULTS = [];

const log = (label, status, detail) => {
    const icon = status === 'OK' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    RESULTS.push({ label, status, detail });
    console.log(`${icon} [${label}] ${detail}`);
};

// ─── 1. PostgreSQL / Supabase ────────────────────────────────────────
async function checkDatabase() {
    console.log('\n═══════════════════════════════════════');
    console.log('  1. DATABASE (PostgreSQL / Supabase)');
    console.log('═══════════════════════════════════════');

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        log('DB_CONFIG', 'FAIL', 'DATABASE_URL not set in .env');
        return;
    }
    log('DB_CONFIG', 'OK', `DATABASE_URL is set (${dbUrl.length} chars)`);

    const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
        const client = await pool.connect();
        log('DB_CONNECT', 'OK', 'Connected to PostgreSQL successfully');

        // Check version
        const { rows: vRows } = await client.query('SELECT version()');
        log('DB_VERSION', 'OK', vRows[0].version.substring(0, 60) + '...');

        // Check tables
        const { rows: tables } = await client.query(`
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' ORDER BY table_name
        `);
        const tableNames = tables.map(t => t.table_name);
        log('DB_TABLES', 'OK', `Found ${tableNames.length} tables: ${tableNames.join(', ')}`);

        // Check key table record counts
        const keyTables = ['leads', 'users', 'sync_logs', 'zoho_config', 'crm_leads', 'crm_records'];
        for (const t of keyTables) {
            if (tableNames.includes(t)) {
                try {
                    const { rows } = await client.query(`SELECT COUNT(*) as count FROM "${t}"`);
                    log(`TABLE_${t.toUpperCase()}`, 'OK', `${t}: ${rows[0].count} records`);
                } catch (e) {
                    log(`TABLE_${t.toUpperCase()}`, 'FAIL', `Error counting ${t}: ${e.message}`);
                }
            } else {
                log(`TABLE_${t.toUpperCase()}`, 'WARN', `Table "${t}" does not exist`);
            }
        }

        client.release();
    } catch (e) {
        log('DB_CONNECT', 'FAIL', `Connection failed: ${e.message}`);
    } finally {
        await pool.end();
    }
}

// ─── 2. Google Sheets ────────────────────────────────────────────────
async function checkGoogleSheets() {
    console.log('\n═══════════════════════════════════════');
    console.log('  2. GOOGLE SHEETS API');
    console.log('═══════════════════════════════════════');

    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!credPath) {
        log('GSHEET_CRED', 'FAIL', 'GOOGLE_APPLICATION_CREDENTIALS not set');
        return;
    }

    // Resolve path relative to server directory
    const fullPath = path.resolve(__dirname, 'server', credPath);
    try {
        require('fs').accessSync(fullPath);
        log('GSHEET_CRED', 'OK', `Credentials file found: ${fullPath}`);
    } catch {
        log('GSHEET_CRED', 'FAIL', `Credentials file NOT found: ${fullPath}`);
        return;
    }

    if (!spreadsheetId) {
        log('GSHEET_ID', 'FAIL', 'SPREADSHEET_ID not set');
        return;
    }
    log('GSHEET_ID', 'OK', `Spreadsheet ID: ${spreadsheetId}`);

    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: fullPath,
            scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
        });
        const sheets = google.sheets({ version: 'v4', auth });
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetNames = meta.data.sheets.map(s => s.properties.title);
        log('GSHEET_CONNECT', 'OK', `Connected! Spreadsheet: "${meta.data.properties.title}"`);
        log('GSHEET_SHEETS', 'OK', `Sheets: ${sheetNames.join(', ')}`);

        // Check first sheet row count
        const firstSheet = sheetNames[0];
        const values = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${firstSheet}!A:A`,
        });
        const rowCount = values.data.values ? values.data.values.length : 0;
        log('GSHEET_DATA', 'OK', `"${firstSheet}" has ${rowCount} rows (column A)`);
    } catch (e) {
        log('GSHEET_CONNECT', 'FAIL', `Google Sheets error: ${e.message}`);
    }
}

// ─── 3. Zoho CRM ────────────────────────────────────────────────────
async function checkZohoCRM() {
    console.log('\n═══════════════════════════════════════');
    console.log('  3. ZOHO CRM');
    console.log('═══════════════════════════════════════');

    const clientId = process.env.ZOHO_CLIENT_ID;
    const clientSecret = process.env.ZOHO_CLIENT_SECRET;
    const authDomain = process.env.ZOHO_AUTH_DOMAIN;
    const apiDomain = process.env.ZOHO_API_DOMAIN;

    if (!clientId) { log('ZOHO_CONFIG', 'FAIL', 'ZOHO_CLIENT_ID not set'); return; }
    if (!clientSecret) { log('ZOHO_CONFIG', 'FAIL', 'ZOHO_CLIENT_SECRET not set'); return; }

    log('ZOHO_CONFIG', 'OK', `Client ID: ${clientId.substring(0, 15)}... | Auth: ${authDomain} | API: ${apiDomain}`);

    // Check if refresh token exists in DB
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
        const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
        try {
            const client = await pool.connect();
            const { rows } = await client.query('SELECT * FROM "zoho_config" LIMIT 1');
            if (rows.length > 0) {
                const config = rows[0];
                const hasRefresh = !!config.refresh_token;
                const hasAccess = !!config.access_token;
                const expiresAt = config.expires_at ? new Date(config.expires_at) : null;
                const isExpired = expiresAt ? expiresAt < new Date() : true;

                log('ZOHO_TOKENS', hasRefresh ? 'OK' : 'FAIL',
                    `Refresh Token: ${hasRefresh ? 'Present' : 'MISSING'} | ` +
                    `Access Token: ${hasAccess ? 'Present' : 'MISSING'} | ` +
                    `Expires: ${expiresAt ? expiresAt.toISOString() : 'N/A'} | ` +
                    `Status: ${isExpired ? 'EXPIRED (will auto-refresh)' : 'VALID'}`
                );

                // Try to test refresh if we have a refresh token
                if (hasRefresh) {
                    try {
                        const params = new URLSearchParams();
                        params.append('refresh_token', config.refresh_token);
                        params.append('client_id', clientId);
                        params.append('client_secret', clientSecret);
                        params.append('grant_type', 'refresh_token');

                        const response = await fetch(`${authDomain}/oauth/v2/token`, {
                            method: 'POST',
                            body: params
                        });
                        const data = await response.json();
                        if (data.access_token) {
                            log('ZOHO_REFRESH', 'OK', 'Token refresh successful - Zoho connection is ACTIVE');
                        } else {
                            log('ZOHO_REFRESH', 'FAIL', `Refresh failed: ${JSON.stringify(data)}`);
                        }
                    } catch (e) {
                        log('ZOHO_REFRESH', 'FAIL', `Refresh error: ${e.message}`);
                    }
                }
            } else {
                log('ZOHO_TOKENS', 'WARN', 'No Zoho tokens in DB. Need to authenticate first via /api/zoho/auth');
            }
            client.release();
        } catch (e) {
            if (e.message.includes('does not exist')) {
                log('ZOHO_TOKENS', 'WARN', 'zoho_config table does not exist yet. Will be created on first auth.');
            } else {
                log('ZOHO_TOKENS', 'FAIL', `Error checking tokens: ${e.message}`);
            }
        } finally {
            await pool.end();
        }
    }
}

// ─── 4. Email (Resend) ──────────────────────────────────────────────
async function checkEmail() {
    console.log('\n═══════════════════════════════════════');
    console.log('  4. EMAIL SERVICE (Resend)');
    console.log('═══════════════════════════════════════');

    const apiKey = process.env.RESEND_API_KEY;
    const adminEmail = process.env.PRIMARY_ADMIN_EMAIL;

    if (!apiKey || apiKey === 're_xxxxxxxxx') {
        log('EMAIL_CONFIG', 'WARN', 'RESEND_API_KEY is placeholder/missing - Email will use MOCK mode (OTP logged to console)');
    } else {
        log('EMAIL_CONFIG', 'OK', `Resend API Key: ${apiKey.substring(0, 10)}...`);
    }

    log('EMAIL_ADMIN', adminEmail ? 'OK' : 'WARN', `Admin Email: ${adminEmail || 'NOT SET (default: mansikharb.kc@gmail.com)'}`);
}

// ─── 5. Environment Variables ────────────────────────────────────────
function checkEnvVars() {
    console.log('\n═══════════════════════════════════════');
    console.log('  5. ENVIRONMENT VARIABLES');
    console.log('═══════════════════════════════════════');

    const required = [
        'DATABASE_URL', 'PORT',
        'GOOGLE_APPLICATION_CREDENTIALS', 'SPREADSHEET_ID',
        'PRIMARY_ADMIN_EMAIL',
        'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_AUTH_DOMAIN', 'ZOHO_API_DOMAIN'
    ];

    const optional = ['RESEND_API_KEY', 'ZOHO_REFRESH_TOKEN', 'GOOGLE_CREDENTIALS_JSON'];

    for (const key of required) {
        const val = process.env[key];
        if (val) {
            log(`ENV_${key}`, 'OK', `Set (${val.length} chars)`);
        } else {
            log(`ENV_${key}`, 'FAIL', 'NOT SET');
        }
    }

    for (const key of optional) {
        const val = process.env[key];
        log(`ENV_${key}`, val ? 'OK' : 'WARN', val ? `Set (${val.length} chars)` : 'Not set (optional)');
    }
}

// ─── 6. Server Check ────────────────────────────────────────────────
async function checkServer() {
    console.log('\n═══════════════════════════════════════');
    console.log('  6. LOCAL SERVER STATUS');
    console.log('═══════════════════════════════════════');

    try {
        const port = process.env.PORT || 5000;
        const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        log('SERVER_STATUS', 'OK', `Server running on port ${port} - Response: ${JSON.stringify(data)}`);
    } catch (e) {
        log('SERVER_STATUS', 'WARN', `Server not running locally or not responding on port ${process.env.PORT || 5000}: ${e.message}`);
    }
}

// ─── MAIN ────────────────────────────────────────────────────────────
async function main() {
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║   🔍 SYNCFLOW - CONNECTION CHECK REPORT     ║');
    console.log('║   Date: ' + new Date().toISOString() + '    ║');
    console.log('╚══════════════════════════════════════════════╝');

    await checkDatabase();
    await checkGoogleSheets();
    await checkZohoCRM();
    await checkEmail();
    checkEnvVars();
    await checkServer();

    // ─── Summary ─────────────────────────────────────────────────────
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║           📊 SUMMARY                         ║');
    console.log('╚══════════════════════════════════════════════╝');

    const ok = RESULTS.filter(r => r.status === 'OK').length;
    const warn = RESULTS.filter(r => r.status === 'WARN').length;
    const fail = RESULTS.filter(r => r.status === 'FAIL').length;

    console.log(`  ✅ OK:   ${ok}`);
    console.log(`  ⚠️  WARN: ${warn}`);
    console.log(`  ❌ FAIL: ${fail}`);
    console.log(`  Total:  ${RESULTS.length} checks\n`);

    if (fail > 0) {
        console.log('❌ FAILED CHECKS:');
        RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`   - [${r.label}] ${r.detail}`);
        });
    }

    if (warn > 0) {
        console.log('\n⚠️  WARNINGS:');
        RESULTS.filter(r => r.status === 'WARN').forEach(r => {
            console.log(`   - [${r.label}] ${r.detail}`);
        });
    }

    console.log('\n════════════════════════════════════════════════');
}

main().catch(e => {
    console.error('Fatal error:', e);
    process.exit(1);
});
