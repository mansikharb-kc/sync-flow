require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function searchByName() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const name = 'Sangay Dubo';
    try {
        const query = `
            SELECT l.sheet_id, l.email, l.full_name, s.sheet_name 
            FROM leads l 
            JOIN sync_logs s ON l.sync_log_id = s.id 
            WHERE l.full_name ILIKE $1
        `;
        const { rows } = await pool.query(query, [`%${name}%`]);
        console.log(`Searching for name: "${name}"`);
        console.table(rows);
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

searchByName();
