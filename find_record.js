require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function findSpecificRecord() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const sheetId = 'l:1005281895111800';
    try {
        const query = `
            SELECT l.sheet_id, l.email, l.full_name, s.sheet_name 
            FROM leads l 
            JOIN sync_logs s ON l.sync_log_id = s.id 
            WHERE l.sheet_id = $1
        `;
        const { rows } = await pool.query(query, [sheetId]);
        if (rows.length > 0) {
            console.log('Record Found:');
            console.table(rows);
        } else {
            console.log('Record not found in database.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

findSpecificRecord();
