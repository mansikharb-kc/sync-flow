
require('dotenv').config({ path: __dirname + '/server/.env' });
const { db } = require('./server/db');

async function checkLead() {
    try {
        const { rows } = await db.query("SELECT * FROM crm_leads WHERE source_id = '4354251253'");
        if (rows.length === 0) {
            console.log('Lead not found.');
        } else {
            console.log('--- LEAD DATA ---');
            console.log(JSON.stringify(rows[0], null, 4));
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkLead();
