require('dotenv').config({ path: __dirname + '/server/.env' });
const { Pool } = require('pg');

async function checkRecord() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        const email = 'allaboutwindowsandcoverings@gmail.com';
        console.log(`Searching for record with email: ${email}`);

        // Check in leads table first
        const { rows: leads } = await pool.query('SELECT * FROM "leads" WHERE email = $1', [email]);
        console.log('\n--- Leads Table ---');
        if (leads.length > 0) {
            console.table(leads.map(l => ({
                sheet_id: l.sheet_id,
                full_name: l.full_name,
                email: l.email,
                lead_type: l.lead_type
            })));
        } else {
            console.log('Not found in leads table.');
        }

        // Check in crm_leads staging table
        const { rows: staging } = await pool.query('SELECT * FROM crm_leads WHERE email = $1', [email]);
        console.log('\n--- CRM Leads (Staging) ---');
        if (staging.length > 0) {
            console.table(staging.map(s => ({
                id: s.id,
                source_id: s.source_id,
                email: s.email,
                lead_type: s.lead_type,
                crm_status: s.crm_status
            })));
        } else {
            console.log('Not found in crm_leads staging table.');
        }

        // Check in crm_records history table
        const { rows: history } = await pool.query('SELECT * FROM crm_records WHERE email = $1', [email]);
        console.log('\n--- CRM Records (Success History) ---');
        if (history.length > 0) {
            console.table(history.map(h => ({
                id: h.id,
                email: h.email,
                lead_type: h.lead_type,
                zoho_id: h.zoho_id
            })));
        } else {
            console.log('Not found in crm_records history table.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

checkRecord();
