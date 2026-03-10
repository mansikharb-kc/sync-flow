require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function checkSpecificSheetHeaders() {
    const sheetName = 'Immersive hub category wise - Brands NCR';
    try {
        console.log(`Fetching headers for: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z1`);
        if (!data || data.length === 0) {
            console.log('No data found.');
            return;
        }
        console.log('Raw Headers:', JSON.stringify(data[0], null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkSpecificSheetHeaders();
