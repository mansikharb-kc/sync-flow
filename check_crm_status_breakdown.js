require('dotenv').config({ path: __dirname + '/server/.env' });
const { Pool } = require('pg');

async function checkStatus() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const res = await pool.query("SELECT crm_status, COUNT(*) FROM crm_leads GROUP BY crm_status");
        console.log('CRM Leads Status Breakdown:');
        console.table(res.rows);
    } catch (err) {
        console.error('DB Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkStatus();
