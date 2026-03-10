require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function inspectSheetGaps() {
    const sheetName = 'Database Brands & Architetcs ';
    try {
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z100`);
        const headers = data[0];

        console.log('--- Checking Sheet:', sheetName, '---');
        data.slice(1).forEach((row, rowIndex) => {
            const email = (row[14] || '').trim(); // Index 14 is default Email
            if (!email) {
                // Check every other column for an @ symbol
                row.forEach((cell, colIndex) => {
                    if (cell && cell.toString().includes('@')) {
                        console.log(`Row ${rowIndex + 2}: Email found in Column ${colIndex} (${headers[colIndex]}): ${cell}`);
                    }
                });
            }
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

inspectSheetGaps();
