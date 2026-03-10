require('dotenv').config({ path: __dirname + '/server/.env' });
const { Pool } = require('pg');

async function verifyMapping() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('--- Verifying Mapping from LEADS (Source) to CRM_LEADS (Staging) ---');

        // Fetch 5 samples where we can compare
        const { rows: stagingSamples } = await pool.query(`
            SELECT 
                cl.source_id, 
                l.full_name as original_name,
                cl.first_name, 
                cl.last_name, 
                l.lead_type as original_type,
                cl.lead_type as normalized_type,
                cl.city,
                cl.crm_status
            FROM crm_leads cl
            JOIN leads l ON cl.source_id = l.sheet_id
            LIMIT 10
        `);

        if (stagingSamples.length > 0) {
            console.log('\nMapping Samples (crm_leads):');
            console.table(stagingSamples.map(s => ({
                'Original Name': s.original_name,
                'First Name': s.first_name,
                'Last Name': s.last_name,
                'Original Type': s.original_type,
                'Normalized Type': s.normalized_type,
                'City': s.city,
                'Status': s.crm_status
            })));
        } else {
            console.log('No records found in crm_leads for comparison.');
        }

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

verifyMapping();
