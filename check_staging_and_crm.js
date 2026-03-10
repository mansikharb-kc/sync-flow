
require('dotenv').config({ path: __dirname + '/server/.env' });
const { db } = require('./server/db');

async function checkStatus() {
    try {
        console.log('--- crm_leads ---');
        const crmLeads = await db.query('SELECT id, source_id, first_name, last_name, crm_status, error_message FROM crm_leads');
        console.table(crmLeads.rows);

        console.log('\n--- leads (total) ---');
        const leads = await db.query('SELECT COUNT(*) FROM leads');
        console.log('Total Leads:', leads.rows[0].count);

        console.log('\n--- crm_records (successes) ---');
        const crmRecords = await db.query('SELECT COUNT(*) FROM crm_records');
        console.log('Successful CRM Pushes:', crmRecords.rows[0].count);

    } catch (e) {
        console.error('Check failed:', e);
    } finally {
        process.exit(0);
    }
}

checkStatus();
