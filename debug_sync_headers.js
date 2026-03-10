require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');
const { sanitizeIdentifier } = require('./server/services/dbService');

async function debugHeaders() {
    try {
        console.log('Fetching spreadsheet metadata...');
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        // Let's check a few sheets
        const sheetIndices = [0, 5, 20]; // Checking diverse sheets

        for (const idx of sheetIndices) {
            if (!meta.sheets[idx]) continue;
            const title = meta.sheets[idx].properties.title;
            console.log(`\n--- Sheet: "${title}" ---`);
            const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A1:Z5`);
            if (!data || data.length === 0) {
                console.log('No data found.');
                continue;
            }
            const headers = data[0];
            console.log('Raw Headers:', headers);
            console.log('Sanitized Headers:', headers.map(h => sanitizeIdentifier(h)));
            console.log('First row has ID?:', headers.some(h => sanitizeIdentifier(h) === 'id' || sanitizeIdentifier(h) === 'sheet_id'));
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugHeaders();
