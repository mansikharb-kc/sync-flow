require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function checkAllH() {
    try {
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        for (const s of meta.sheets) {
            const title = s.properties.title;
            try {
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A1:Z1`);
                const headers = data[0];
                if (headers && headers.length > 7) {
                    console.log(`Sheet: [${title}] | H: [${headers[7]}]`);
                }
            } catch (e) {
                // console.log(`Error for ${title}: ${e.message}`);
            }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkAllH();
