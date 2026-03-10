const express = require('express');
const router = express.Router();
const { db } = require('../db');

router.get('/db-check', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT 1');
        res.json({ success: true, message: 'Database query successful', result: rows });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack,
            envKeys: Object.keys(process.env).filter(k => k.includes('DB') || k.includes('URL')),
            dbInfo: {
                hasConnectionString: !!(process.env.DATABASE_URL),
                urlPrefix: process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 10) : 'none'
            }
        });
    }
});

module.exports = router;
