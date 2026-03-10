require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function checkDbMissingInfo() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const query = `
            SELECT 
                s.sheet_name, 
                COUNT(*) as total_records,
                COUNT(*) FILTER (WHERE l.phone IS NULL OR l.phone = '') as missing_phone,
                COUNT(*) FILTER (WHERE l.email IS NULL OR l.email = '') as missing_email
            FROM leads l 
            JOIN sync_logs s ON l.sync_log_id = s.id 
            GROUP BY s.sheet_name 
            HAVING COUNT(*) FILTER (WHERE l.phone IS NULL OR l.phone = '') > 0 
               OR COUNT(*) FILTER (WHERE l.email IS NULL OR l.email = '') > 0
            ORDER BY missing_phone DESC
        `;
        const { rows } = await pool.query(query);
        console.table(rows);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkDbMissingInfo();
