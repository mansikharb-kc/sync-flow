require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function checkHeaders() {
    try {
        const data = await getSheetValues(process.env.SPREADSHEET_ID, "'Database Brands & Architetcs '!A1:Z1");
        console.log('Headers for Database Brands & Architetcs:');
        console.log(JSON.stringify(data[0], null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkHeaders();
