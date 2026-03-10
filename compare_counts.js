require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function compareCounts() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    try {
        console.log('--- Database Count ---');
        const { rows: dbCount } = await pool.query('SELECT COUNT(*) FROM leads');
        const totalDb = parseInt(dbCount[0].count);
        console.log(`Total Leads in Database: ${totalDb}`);

        console.log('\n--- Spreadsheet Sheet-wise Count ---');
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        const sheets = meta.sheets;

        let totalSheetRows = 0;
        const results = [];

        for (const sheet of sheets) {
            const title = sheet.properties.title;
            try {
                // Fetching only A:A to save bandwidth/time while counting rows
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A:A`);
                if (data && data.length > 1) {
                    const rowCount = data.length - 1; // Exclude header
                    totalSheetRows += rowCount;
                    results.push({ Sheet: title, 'Row Count (excl. header)': rowCount });
                } else {
                    results.push({ Sheet: title, 'Row Count (excl. header)': 0 });
                }
            } catch (e) {
                results.push({ Sheet: title, 'Row Count (excl. header)': 'ERROR: ' + e.message });
            }
        }

        console.table(results);
        console.log(`Total Rows across all Sheets: ${totalSheetRows}`);

        console.log('\n--- Summary ---');
        console.log(`Database:    ${totalDb}`);
        console.log(`Spreadsheet: ${totalSheetRows}`);
        console.log(`Difference:  ${totalDb - totalSheetRows}`);

    } catch (e) {
        console.error('Execution Error:', e.message);
    } finally {
        await pool.end();
    }
}

compareCounts();
