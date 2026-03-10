require('dotenv').config({ path: __dirname + '/server/.env' });
const { getSheetValues } = require('./server/services/sheetService');

async function checkRemarksForEmails() {
    const sheetName = 'Database Brands & Architetcs ';
    try {
        const data = await getSheetValues(process.env.SPREADSHEET_ID, `'${sheetName}'!A1:Z1000`);
        const headers = data[0];
        const remarksIdx = headers.indexOf('Lead Quality / Remarks');

        console.log(`Checking "${sheetName}" for emails hidden in Remarks column...`);
        data.slice(1).forEach((row, i) => {
            const email = (row[14] || '').trim();
            const remarks = (row[remarksIdx] || '').trim();

            if (!email && remarks.includes('@')) {
                console.log(`Row ${i + 2}: Email found in Remarks!! -> ${remarks}`);
            }
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

checkRemarksForEmails();
