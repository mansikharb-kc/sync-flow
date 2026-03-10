require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function debugSheet() {
    const sheetName = 'Architects & Designer INDIA';
    try {
        console.log(`Fetching data for: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z5`);
        if (!data || data.length === 0) {
            console.log('No data found.');
            return;
        }
        console.log('Headers:', JSON.stringify(data[0], null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugSheet();
