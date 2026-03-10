require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function checkMissingBoth() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const { rows } = await pool.query("SELECT COUNT(*) FROM leads WHERE (phone IS NULL OR phone = '') AND (email IS NULL OR email = '')");
        console.log(`Records missing BOTH phone and email: ${rows[0].count}`);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkMissingBoth();
