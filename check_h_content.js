require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function checkHContent() {
    try {
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        for (const s of meta.sheets) {
            const title = s.properties.title;
            try {
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A2:ZZ5`);
                if (data && data[0] && data[0].length > 7) {
                    console.log(`Sheet: [${title}] | H Sample: [${data[0][7]}]`);
                }
            } catch (e) { }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkHContent();
