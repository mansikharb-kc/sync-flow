
require('dotenv').config({ path: __dirname + '/server/.env' });
const { db } = require('./server/db');

async function wipeAll() {
    const tables = ['leads', 'crm_leads', 'crm_records', 'deleted_leads', 'sync_logs', 'otps'];

    console.log('🧹 Starting data wipe for tables: ' + tables.join(', '));

    for (const table of tables) {
        try {
            await db.query(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`);
            console.log(`✅ Table "${table}" is now empty.`);
        } catch (e) {
            if (e.message.includes('does not exist')) {
                console.log(`ℹ️ Table "${table}" does not exist, skipping.`);
            } else {
                console.error(`❌ Error wiping "${table}":`, e.message);
            }
        }
    }

    console.log('\n✨ All data tables have been cleared.');
    process.exit(0);
}

wipeAll();
