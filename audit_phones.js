require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSpreadsheetMetadata, getSheetValues } = require('./server/services/sheetService');
const { sanitizeIdentifier } = require('./server/services/dbService');

async function auditPhoneNumbers() {
    const candidates = ['phone', 'mobile', 'phone_number'];

    try {
        console.log('--- Auditing Phone Numbers in Spreadsheet ---');
        const meta = await getSpreadsheetMetadata(process.env.SPREADSHEET_ID);
        const sheets = meta.sheets;

        const summary = [];
        let grandTotalRows = 0;
        let grandTotalMissing = 0;

        for (const sheet of sheets) {
            const title = sheet.properties.title;
            const cleanTitle = title.trim();

            try {
                // Fetch first 1000 rows to check headers and samples
                const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${title}'!A:ZZ`);
                if (!data || data.length < 2) {
                    summary.push({ Sheet: cleanTitle, Total: 0, MissingPhone: 0, Status: 'Empty/No Data' });
                    continue;
                }

                const headers = data[0];
                const rows = data.slice(1);

                // Find phone column index
                const phoneIdx = headers.findIndex(h => {
                    const sh = sanitizeIdentifier(h);
                    return candidates.some(c => sh === sanitizeIdentifier(c));
                });

                if (phoneIdx === -1) {
                    summary.push({
                        Sheet: cleanTitle,
                        Total: rows.length,
                        MissingPhone: rows.length,
                        Status: 'Phone Column Not Found'
                    });
                    grandTotalRows += rows.length;
                    grandTotalMissing += rows.length;
                    continue;
                }

                let missingCount = 0;
                rows.forEach(row => {
                    const val = (row[phoneIdx] || '').toString().trim();
                    if (!val) missingCount++;
                });

                summary.push({
                    Sheet: cleanTitle,
                    Total: rows.length,
                    MissingPhone: missingCount,
                    Status: 'OK'
                });
                grandTotalRows += rows.length;
                grandTotalMissing += missingCount;

            } catch (e) {
                summary.push({ Sheet: cleanTitle, Total: '?', MissingPhone: '?', Status: 'ERROR: ' + e.message });
            }
        }

        console.table(summary);
        console.log(`\nGrand Total Rows: ${grandTotalRows}`);
        console.log(`Grand Total Missing Phone: ${grandTotalMissing}`);
        console.log(`Coverage: ${((grandTotalRows - grandTotalMissing) / grandTotalRows * 100).toFixed(2)}%`);

    } catch (e) {
        console.error('Audit failed:', e.message);
    }
}

auditPhoneNumbers();
