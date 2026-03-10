require('dotenv').config({ path: __dirname + '/server/.env' });
const { Pool } = require('pg');
const { syncSheetToDb } = require('./server/services/syncService');

async function cleanAndSync() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

    console.log('🗑️ Dropping and cleaning tables: leads, crm_leads, crm_records, deleted_leads...');
    try {
        const tables = ['leads', 'crm_leads', 'crm_records', 'deleted_leads'];
        for (const table of tables) {
            try {
                await pool.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
                console.log(`✅ Table "${table}" dropped.`);
            } catch (e) {
                console.error(`❌ Error dropping "${table}":`, e.message);
            }
        }

        console.log('\n🚀 Starting fresh synchronization into "leads" table...');
        const result = await syncSheetToDb('CLEAN_START');

        console.log('\n📊 Sync Complete!');
        console.table(result.results.map(r => ({
            Sheet: r.sheet,
            Status: r.status,
            Inserted: r.inserted || 0,
            Found: r.found || 0
        })));

    } catch (err) {
        console.error('Fatal operation error:', err);
    } finally {
        await pool.end();
    }
}

cleanAndSync();
