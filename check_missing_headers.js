require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function checkMultipleSheetHeaders() {
    const sheets = [
        'All  Stakeholders',
        '66K Data testing (Nov, Dec) ',
        'All Stakeholders 2',
        'AceTech Lead',
        'Brand & Architects - INDIA (Immersive Hub)',
        'Database Brands & Architetcs '
    ];

    for (const sheetName of sheets) {
        try {
            console.log(`\n--- Headers for: "${sheetName}" ---`);
            const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z1`);
            if (!data || data.length === 0) {
                console.log('No data found.');
                continue;
            }
            console.log(JSON.stringify(data[0], null, 2));
        } catch (e) {
            console.error(`Error for ${sheetName}:`, e.message);
        }
    }
}

checkMultipleSheetHeaders();
