const { db } = require('../db');
const crypto = require('crypto');

/**
 * Sanitizes string to be a valid PostgreSQL identifier
 */
const sanitizeIdentifier = (name) => {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
};

/**
 * Maps headers to safe column names
 */
const getSafeColumnName = (header) => {
    let safeName = sanitizeIdentifier(header);
    if (safeName === 'id') return 'sheet_id';
    return safeName;
};

/**
 * Creates table with the standardized schema
 */
const ensureTableExists = async (tableName, headers) => {
    const sanitizedTableName = sanitizeIdentifier(tableName);

    if (sanitizedTableName === 'leads') {
        // "leads" is a hybrid table:
        // - Core standardized columns (used by app/CRM staging)
        // - Plus any additional columns derived from sheet headers
        // This allows the DB schema to match the sheet columns without breaking the app.

        const coreCols = [
            'sheet_id',
            'full_name',
            'first_name',
            'last_name',
            'phone',
            'email',
            'city',
            'lead_type',
            'company_name'
        ];

        const requested = Array.isArray(headers) ? headers : [];
        const safeRequested = requested
            .map(h => getSafeColumnName(String(h)))
            .filter(Boolean);

        const allDataCols = Array.from(new Set([...coreCols, ...safeRequested]));

        // Ensure sheet_id is first and primary key
        const leadColumnsSql = allDataCols
            .filter(c => c !== 'sheet_id')
            .map(c => `"${c}" TEXT`)
            .join(',\n                ');

        const createQuery = `
            CREATE TABLE IF NOT EXISTS "leads" (
                "sheet_id" VARCHAR(255) PRIMARY KEY,
                ${leadColumnsSql ? leadColumnsSql + ',' : ''}
                "zoho_status" VARCHAR(20) DEFAULT 'PENDING',
                "zoho_id" VARCHAR(100),
                "zoho_insert_time" TIMESTAMP,
                "zoho_error" TEXT,
                "_row_hash" VARCHAR(64),
                "_batch_id" VARCHAR(64),
                "sync_log_id" INT,
                "_created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        const client = await db.connect();
        try {
            await client.query(createQuery);

            // Auto-add any requested columns (when table already exists)
            for (const col of allDataCols) {
                if (col === 'sheet_id') continue;
                try {
                    await client.query(`ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "${col}" TEXT`);
                } catch (e) { /* ignore */ }
            }

            await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_batch_id ON "leads" ("_batch_id")`);
        } finally {
            client.release();
        }
        return 'leads';
    }

    // Dynamic schema for temp tables
    // Ensure the first column (sheet_id) is a PRIMARY KEY to support ON CONFLICT
    const safeColumns = headers.map((h, i) => {
        const colName = getSafeColumnName(h);
        if (i === 0) return `"${colName}" VARCHAR(255) PRIMARY KEY`;
        return `"${colName}" TEXT`;
    });
    const createQuery = `
        CREATE TABLE IF NOT EXISTS "${sanitizedTableName}" (
            ${safeColumns.join(', ')},
            "_row_hash" VARCHAR(64),
            "_batch_id" VARCHAR(64),
            "sync_log_id" INT,
            "_created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    const client = await db.connect();
    try {
        await client.query(createQuery);
    } finally {
        client.release();
    }
    return sanitizedTableName;
};

/**
 * Generates specific hash for a row to identify uniqueness
 */
const generateRowHash = (rowValues) => {
    const str = JSON.stringify(rowValues);
    return crypto.createHash('sha256').update(str).digest('hex');
};

/**
 * Inserts new records into the table
 */
const insertNewRecords = async (tableName, headers, rows, batchId, syncLogId = null) => {
    if (!rows || rows.length === 0) return 0;
    const sanitizedTableName = sanitizeIdentifier(tableName);

    // For standardized 'leads' table, headers is already standardized
    const fields = [...headers, '_row_hash', '_batch_id', 'sync_log_id'];
    const columnsStr = fields.map(f => `"${f}"`).join(',');

    const BATCH_SIZE = 500;
    let totalInserted = 0;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const flatValues = [];
        const rowPlaceholders = [];
        let validRowsInBatch = 0;

        batch.forEach((row) => {
            // row is expected to be an object or array matching headers
            const rowData = Array.isArray(row) ? row : headers.map(h => row[h]);

            // Check if ID (first column usually sheet_id) exists
            if (!rowData[0]) return;

            const hash = generateRowHash(rowData);
            flatValues.push(...rowData, hash, batchId, syncLogId);

            const startIdx = validRowsInBatch * fields.length + 1;
            const placeholders = Array.from({ length: fields.length }, (_, pi) => `$${startIdx + pi}`).join(',');
            rowPlaceholders.push(`(${placeholders})`);
            validRowsInBatch++;
        });

        if (validRowsInBatch > 0) {
            const sql = `INSERT INTO "${sanitizedTableName}" (${columnsStr}) VALUES ${rowPlaceholders.join(',')} ON CONFLICT (sheet_id) DO NOTHING`;
            const result = await db.query(sql, flatValues);
            totalInserted += result.rowCount;
        }
    }
    return totalInserted;
};

const logSync = async (sheetName, tableName, details, batchId, status = 'SUCCESS', triggerType = 'MANUAL') => {
    const { tempInserted = 0, leadsDeleted = 0, leadsInserted = 0 } = details;
    const result = await db.query(
        `INSERT INTO "sync_logs" 
        (sheet_name, table_name, inserted_count, temp_inserted_count, leads_deleted_count, leads_inserted_count, batch_id, status, trigger_type, start_time) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING id`,
        [sheetName, tableName, leadsInserted, tempInserted, leadsDeleted, leadsInserted, batchId, status, triggerType]
    );
    return result.rows[0].id;
};

const updateSyncLog = async (logId, details, status = 'SUCCESS') => {
    const { tempInserted = 0, leadsDeleted = 0, leadsInserted = 0 } = details;
    await db.query(
        `UPDATE "sync_logs" SET inserted_count = $1, temp_inserted_count = $2, leads_deleted_count = $3, leads_inserted_count = $4, status = $5 WHERE id = $6`,
        [leadsInserted, tempInserted, leadsDeleted, leadsInserted, status, logId]
    );
};

const getStats = async () => {
    try {
        const { rows: leadsCount } = await db.query('SELECT COUNT(*) as count FROM "leads"');
        const { rows: lastSync } = await db.query('SELECT * FROM "sync_logs" ORDER BY id DESC LIMIT 1');

        // Intake Stats (Sheets to Database)
        const { rows: intakeToday } = await db.query(`
            SELECT COALESCE(SUM(leads_inserted_count), 0) as count 
            FROM sync_logs 
            WHERE sync_timestamp >= CURRENT_DATE
        `);
        const { rows: intakeMonth } = await db.query(`
            SELECT COALESCE(SUM(leads_inserted_count), 0) as count 
            FROM sync_logs 
            WHERE sync_timestamp >= date_trunc('month', CURRENT_DATE)
        `);

        // Export Stats (Database to CRM)
        const { rows: pushedToday } = await db.query(`
            SELECT COUNT(*) as count 
            FROM crm_records 
            WHERE crm_insert_time >= CURRENT_DATE
        `);
        const { rows: pushedMonth } = await db.query(`
            SELECT COUNT(*) as count 
            FROM crm_records 
            WHERE crm_insert_time >= date_trunc('month', CURRENT_DATE)
        `);

        // Staging Stats (Waiting for CRM)
        const { rows: pendingStats } = await db.query(`
            SELECT 
                COUNT(*) FILTER (WHERE crm_status = 'Pending') as pending,
                COUNT(*) FILTER (WHERE crm_status = 'Failed') as failed
            FROM crm_leads
        `);

        return {
            total_leads: leadsCount[0].count,
            last_sync: lastSync[0] || null,
            movement: {
                intake_today: parseInt(intakeToday[0].count),
                intake_month: parseInt(intakeMonth[0].count),
                pushed_today: parseInt(pushedToday[0].count),
                pushed_month: parseInt(pushedMonth[0].count),
                pending_automation: parseInt(pendingStats[0].pending),
                failed_automation: parseInt(pendingStats[0].failed)
            }
        };
    } catch (e) {
        console.error("Stats Error:", e);
        return { total_leads: 0, last_sync: null, movement: { intake_today: 0, intake_month: 0, pushed_today: 0, pushed_month: 0 } };
    }
};

const truncateTable = async (tableName) => {
    await db.query(`TRUNCATE TABLE "${sanitizeIdentifier(tableName)}" RESTART IDENTITY CASCADE`);
};

const mergeTempToLeads = async (tempTable, targetTable, headers = null) => {
    const cleanTemp = sanitizeIdentifier(tempTable);
    const cleanTarget = sanitizeIdentifier(targetTable);
    // Columns we want to upsert from temp into leads (do NOT overwrite Zoho status fields)
    const requested = Array.isArray(headers) ? headers : null;
    const safeRequested = requested
        ? requested.map(h => getSafeColumnName(String(h))).filter(Boolean)
        : null;

    const defaultCore = ['sheet_id', 'full_name', 'first_name', 'last_name', 'phone', 'email', 'city', 'lead_type', 'company_name'];
    const baseCols = safeRequested && safeRequested.length > 0 ? safeRequested : defaultCore;

    const cols = Array.from(new Set([
        ...baseCols,
        '_row_hash',
        '_batch_id',
        'sync_log_id'
    ]));

    const colsStr = cols.map(c => `"${c}"`).join(', ');
    const updateSet = cols
        .filter(c => c !== 'sheet_id')
        .map(c => `"${c}" = EXCLUDED."${c}"`)
        .join(', ');

    const mergeQuery = `
        INSERT INTO "${cleanTarget}" (${colsStr}) 
        SELECT ${colsStr} FROM "${cleanTemp}"
        ON CONFLICT (sheet_id) DO UPDATE SET ${updateSet}, _created_at = NOW()
    `;
    const res = await db.query(mergeQuery);
    return { success: true, insertedCount: res.rowCount };
};

module.exports = {
    ensureTableExists,
    insertNewRecords,
    logSync,
    updateSyncLog,
    truncateTable,
    mergeTempToLeads,
    getStats,
    sanitizeIdentifier,
    getSafeColumnName
};
