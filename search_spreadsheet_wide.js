require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function searchEntireSpreadsheet() {
    const targetName = 'Sangay Dubo';
    try {
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        for (const s of meta.sheets) {
            const title = s.properties.title;
            try {
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A:Z`);
                const rowIndex = data.findIndex(r => r.some(cell => cell && cell.toString().includes(targetName)));
                if (rowIndex !== -1) {
                    console.log(`Found "${targetName}" in Sheet: [${title}] at Row: ${rowIndex + 1}`);
                    console.log('Row Data:', JSON.stringify(data[rowIndex]));
                }
            } catch (e) { }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

searchEntireSpreadsheet();
