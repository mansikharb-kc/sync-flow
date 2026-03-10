
require('dotenv').config({ path: __dirname + '/server/.env' });
const { db } = require('./server/db');
const fs = require('fs');

async function dumpLead() {
    try {
        const { rows } = await db.query("SELECT * FROM leads WHERE sheet_id = '4354251253'");
        if (rows.length === 0) {
            console.log('Lead not found.');
        } else {
            fs.writeFileSync('lead_dump.json', JSON.stringify(rows[0], null, 4));
            console.log('Dumped to lead_dump.json');
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

dumpLead();
