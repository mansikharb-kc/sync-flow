require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function listAllHeaders() {
    try {
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        for (const s of meta.sheets) {
            const title = s.properties.title;
            try {
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A1:Z1`);
                console.log(`Sheet: [${title}] | Headers: ${JSON.stringify(data[0])}`);
            } catch (e) { }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

listAllHeaders();
