const { db } = require('./db');
async function checkConstraints() {
    try {
        const { rows } = await db.query(`
            SELECT table_name, column_name, is_nullable 
            FROM information_schema.columns 
            WHERE table_name IN ('crm_leads', 'crm_records')
            ORDER BY table_name, column_name
        `);
        console.table(rows);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkConstraints();
