require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function missingInfoReport() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const query = `
            SELECT 
                l.full_name, 
                l.phone, 
                l.email, 
                s.sheet_name,
                l.sheet_id
            FROM leads l 
            JOIN sync_logs s ON l.sync_log_id = s.id 
            WHERE (l.phone IS NULL OR l.phone = '') 
               OR (l.email IS NULL OR l.email = '')
            ORDER BY s.sheet_name ASC
        `;
        const { rows } = await pool.query(query);

        console.log(`--- Detailed Report: Missing Phone or Email (${rows.length} records found) ---`);
        console.table(rows);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

missingInfoReport();
