require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function dropSheetRecords() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    const sheetName = 'Are you a Brand '; // Note the trailing space from previous logs

    try {
        console.log(`Starting deletion of records for sheet: "${sheetName}"`);

        // Find the sync log IDs for this sheet
        const findLogsQuery = 'SELECT id FROM sync_logs WHERE sheet_name = $1';
        const { rows: logs } = await pool.query(findLogsQuery, [sheetName]);

        if (logs.length === 0) {
            console.log(`No sync logs found for sheet "${sheetName}". No records to delete.`);
            return;
        }

        const logIds = logs.map(l => l.id);

        // Delete leads associated with these logs
        const deleteLeadsQuery = 'DELETE FROM leads WHERE sync_log_id = ANY($1)';
        const deleteResult = await pool.query(deleteLeadsQuery, [logIds]);

        console.log(`✅ Deleted ${deleteResult.rowCount} lead(s) associated with sheet "${sheetName}".`);

        // Optionally delete the sync logs themselves if you want to be thorough
        // const deleteLogsQuery = 'DELETE FROM sync_logs WHERE sheet_name = $1';
        // await pool.query(deleteLogsQuery, [sheetName]);
        // console.log(`Sync logs for "${sheetName}" removed.`);

    } catch (e) {
        console.error('Error during deletion:', e.message);
    } finally {
        await pool.end();
    }
}

dropSheetRecords();
