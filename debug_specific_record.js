require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function debugSpecificSheetRecord() {
    const sheetName = 'Database Brands & Architetcs ';
    const targetId = 'l:1005281895111800';
    try {
        console.log(`Searching for record ${targetId} in: "${sheetName}"`);
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z1000`);
        const headers = data[0];
        const row = data.find(r => r[0] === targetId);

        if (row) {
            console.log('Headers:', JSON.stringify(headers));
            console.log('Found Row:', JSON.stringify(row));
            // Let's also check if there's any email-looking string in any other column
            row.forEach((cell, idx) => {
                if (cell && cell.includes('@')) {
                    console.log(`Potential email found in Column ${idx} (${headers[idx]}): ${cell}`);
                }
            });
        } else {
            console.log('Record not found in the first 1000 rows.');
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

debugSpecificSheetRecord();
