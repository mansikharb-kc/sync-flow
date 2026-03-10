const { Pool } = require('pg');
require('dotenv').config();

// FOOLPROOF CONFIG
const config = {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
};

console.log('📡 Initializing Pool with connectionString length:', (process.env.DATABASE_URL || '').length);

const pool = new Pool(config);

module.exports = {
    db: pool,
    initDB: async () => {
        try {
            const client = await pool.connect();
            console.log('✅ DB Connected');
            client.release();
        } catch (e) {
            console.error('❌ DB Error:', e.message);
        }
    },
    getDebugInfo: () => ({ status: 'minimal' })
};
