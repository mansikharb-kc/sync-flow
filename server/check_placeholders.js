const { db } = require('./db');

async function checkPlaceholders() {
    try {
        const res = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE company = 'Individual') as individual_company,
                COUNT(*) FILTER (WHERE last_name = 'Unknown') as unknown_lastname,
                COUNT(*) FILTER (WHERE city = 'Unknown') as unknown_city,
                COUNT(*) FILTER (WHERE email = 'Unknown') as unknown_email,
                COUNT(*) FILTER (WHERE phone = 'Unknown') as unknown_phone
            FROM crm_leads
        `);
        console.table(res.rows[0]);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkPlaceholders();
