const { db } = require('./server/db');

async function debugTables() {
    try {
        const tables = ['leads', 'crm_leads', 'crm_records'];
        for (const table of tables) {
            console.log(`--- ${table} ---`);
            const { rows } = await db.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table}'
                ORDER BY ordinal_position
            `);
            rows.forEach(r => console.log(`- ${r.column_name} (${r.data_type})`));
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

debugTables();
