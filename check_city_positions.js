require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');

async function checkCityHeaders() {
    try {
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        for (const s of meta.sheets) {
            const title = s.properties.title;
            try {
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A1:Z1`);
                const headers = data[0];
                if (headers) {
                    headers.forEach((h, i) => {
                        if (h.toLowerCase().includes('city') || h.toLowerCase().includes('location')) {
                            console.log(`Sheet: [${title}] | Index ${i}: ${h}`);
                        }
                    });
                }
            } catch (e) { }
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkCityHeaders();
