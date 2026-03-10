
require('dotenv').config({ path: __dirname + '/server/.env' });
const { db } = require('./server/db');

async function checkEmail() {
    try {
        const { rows } = await db.query("SELECT email FROM crm_leads WHERE source_id = '4354251253'");
        if (rows.length === 0) {
            console.log('Lead not found.');
        } else {
            console.log('--- EMAIL FIELD ---');
            console.log(JSON.stringify(rows[0].email));
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}

checkEmail();
