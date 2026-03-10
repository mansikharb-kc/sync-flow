require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function debugDatabaseSheet() {
    const sheetName = 'Database Brands & Architetcs ';
    try {
        console.log(`Checking rows for: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z50`);
        const headers = data[0];
        console.log('Headers:', JSON.stringify(headers));

        const emailIdx = 14; // 'email' is usually at 14 in this sheet's format (A=0, O=14)

        data.slice(1).forEach((row, i) => {
            const email = (row[emailIdx] || '').trim();
            if (!email) {
                console.log(`Row ${i + 2} has no email. Full Row:`, JSON.stringify(row));
            }
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugDatabaseSheet();
