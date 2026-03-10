require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function debugMoreBrandLeads() {
    const sheetName = 'Brand Leads';
    try {
        console.log(`Fetching 20 rows for: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A2:Z20`);
        if (!data || data.length === 0) {
            console.log('No data found.');
            return;
        }
        data.forEach((row, i) => {
            console.log(`Row ${i + 2}: AdName: [${row[3]}] | Campaign: [${row[7]}] | CityCol: [${row[20] || 'N/A'}]`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugMoreBrandLeads();
