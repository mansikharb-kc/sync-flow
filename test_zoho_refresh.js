require('dotenv').config({ path: __dirname + '/server/.env' });
const axios = require('./server/node_modules/axios');
const { Pool } = require('pg');

async function main() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    // 1. Check Zoho token refresh
    console.log('=== ZOHO CRM TOKEN REFRESH TEST ===');
    try {
        const { rows } = await pool.query('SELECT * FROM "zoho_config" LIMIT 1');
        const c = rows[0];
        console.log('Refresh token:', c.refresh_token ? 'Present' : 'Missing');

        const params = new URLSearchParams();
        params.append('refresh_token', c.refresh_token);
        params.append('client_id', process.env.ZOHO_CLIENT_ID);
        params.append('client_secret', process.env.ZOHO_CLIENT_SECRET);
        params.append('grant_type', 'refresh_token');

        const r = await axios.default.post(process.env.ZOHO_AUTH_DOMAIN + '/oauth/v2/token', params);
        if (r.data.access_token) {
            console.log('✅ ZOHO REFRESH: SUCCESS - New access token obtained');
        } else {
            console.log('❌ ZOHO REFRESH: FAILED -', JSON.stringify(r.data));
        }
    } catch (e) {
        console.log('❌ ZOHO REFRESH: ERROR -', e.response?.data || e.message);
    }

    // 2. Check local server
    console.log('\n=== LOCAL SERVER TEST ===');
    try {
        const res = await axios.default.get('http://localhost:5000/health', { timeout: 3000 });
        console.log('✅ SERVER: Running on port 5000 -', JSON.stringify(res.data));
    } catch (e) {
        console.log('⚠️ SERVER: Not running on port 5000 -', e.code || e.message);
    }

    await pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
