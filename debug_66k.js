require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function debug66k() {
    const sheetName = '66K Data testing (Jan, Feb)';
    try {
        console.log(`Fetching first 5 rows for: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:ZZ5`);
        if (!data || data.length === 0) {
            console.log('No data found.');
            return;
        }
        console.log('Row 1 (Headers):', JSON.stringify(data[0], null, 2));
        console.log('Row 2:', JSON.stringify(data[1], null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debug66k();
