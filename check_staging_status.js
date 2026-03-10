require('dotenv').config({ path: __dirname + '/server/.env' });
const pg = require('pg');

async function checkStagingStatus() {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
    try {
        // Check crm_leads table
        const { rows: pending } = await pool.query("SELECT COUNT(*) as count FROM crm_leads WHERE crm_status = 'Pending'");
        const { rows: failed } = await pool.query("SELECT COUNT(*) as count FROM crm_leads WHERE crm_status = 'Failed'");
        const { rows: success } = await pool.query("SELECT COUNT(*) as count FROM crm_records");

        console.log('=== CRM Staging Status ===');
        console.log(`Pending leads to push: ${pending[0].count}`);
        console.log(`Failed leads:          ${failed[0].count}`);
        console.log(`Successfully pushed:   ${success[0].count}`);

        // Show batch breakdown (groups of 500)
        const totalPending = parseInt(pending[0].count);
        if (totalPending > 0) {
            const batchSize = 500;
            const batches = Math.ceil(totalPending / batchSize);
            console.log(`\nBatch preview (groups of 500):`);
            for (let i = 0; i < batches; i++) {
                const from = i * batchSize + 1;
                const to = Math.min((i + 1) * batchSize, totalPending);
                console.log(`  Batch ${i + 1}: Records ${from} - ${to}`);
            }
        } else {
            console.log('\nNo pending leads — Click "Stage New Leads" button first!');
        }

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        await pool.end();
    }
}

checkStagingStatus();
