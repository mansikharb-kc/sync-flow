const { db } = require('./db');

(async () => {
    try {
        // Get all user tables in the public schema
        const { rows: tables } = await db.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
        `);

        let nonEmpty = [];

        for (const { table_name } of tables) {
            const { rows } = await db.query(
                `SELECT COUNT(*)::int AS count FROM "${table_name}"`
            );
            const count = rows[0].count;
            if (count > 0) {
                nonEmpty.push({ table: table_name, count });
            }
        }

        if (nonEmpty.length === 0) {
            console.log('✅ All public tables are empty.');
            process.exit(0);
        } else {
            console.error('❌ Some tables contain data:');
            nonEmpty.forEach(t =>
                console.error(`- ${t.table}: ${t.count} rows`)
            );
            process.exit(1);
        }
    } catch (err) {
        console.error('Error while checking tables:', err.message);
        process.exit(1);
    }
})();

