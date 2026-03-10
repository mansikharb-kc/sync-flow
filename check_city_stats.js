require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function checkCityStats() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        const query = `
            SELECT 
                s.sheet_name, 
                COUNT(*) as total_records,
                COUNT(l.city) as filled_city,
                COUNT(*) - COUNT(l.city) as missing_city
            FROM leads l 
            JOIN sync_logs s ON l.sync_log_id = s.id 
            GROUP BY s.sheet_name 
            ORDER BY missing_city DESC
        `;
        const { rows } = await pool.query(query);
        console.table(rows);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkCityStats();
