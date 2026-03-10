const { getSpreadsheetMetadata, getSheetValues } = require('./sheetService');
const { ensureTableExists, insertNewRecords, logSync, updateSyncLog, mergeTempToLeads, getStats, sanitizeIdentifier, getSafeColumnName } = require('./dbService');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { syncToCrmStaging, syncToZoho } = require('./stagingService');

let isSyncing = false;
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Maps raw sheet row to standard lead structure with fallback logic
 */
/**
 * Maps raw sheet row to standard lead structure with fallback logic
 */
const mapRowToLead = (headers, row, sheetTitle = '') => {
    const getValue = (candidates) => {
        const idx = headers.findIndex(h => {
            const sh = sanitizeIdentifier(h);
            return candidates.some(c => sh === sanitizeIdentifier(c));
        });
        return idx !== -1 ? (row[idx] || '').toString().trim() : null;
    };

    const lead = {
        sheet_id: getValue(['id', 'sheet_id', 'mobile', 'email', 'phone']),
        full_name: getValue(['name', 'full_name', 'first_name', 'full_name']),
        phone: getValue(['phone', 'mobile', 'phone_number', 'mobile_number', 'contact_number', 'contact']),
        email: getValue(['email', 'email_address', 'e_mail', 'email_id']),
        city: getValue(['city', 'location']),
        lead_type: getValue([
            'select_your_category',
            'select_your_category_',
            'what_best_describes_you?',
            'are_you_currently_a_student_or_graduate?',
            'your_brand_category?',
            'what_best_describes_you',
            'category',
            'lead_type',
            'category_l1'
        ]),
        company_name: getValue([
            'brand_name',
            'company_name',
            'firm_name',
            'brand_/_company_name_',
            'brand_/_company_name_......',
            'please_specify__brand_name_',
            'please_specify_brand_name',
            'company_/_brand_name',
            'company'
        ])
    };

    // --- Name Splitting Logic ---
    const rawFirstName = getValue(['first_name', 'fname']);
    const rawLastName = getValue(['last_name', 'lname', 'surname']);

    if (rawFirstName || rawLastName) {
        lead.first_name = rawFirstName || '';
        lead.last_name = rawLastName || 'Unknown';
    } else if (lead.full_name) {
        const parts = lead.full_name.trim().split(/\s+/);
        if (parts.length === 1) {
            lead.first_name = '';
            lead.last_name = parts[0];
        } else {
            lead.first_name = parts[0];
            lead.last_name = parts.slice(1).join(' ');
        }
    } else {
        lead.first_name = '';
        lead.last_name = 'Unknown';
    }

    // Override for specific sheets as requested
    const cleanTitle = sheetTitle.trim();

    // -- Mandatory Brand Labels --
    const hardcodedBrands = [
        'Immersive hub category wise - Brands NCR',
        'Brand Generic INDIA',
        'IH - Tiles Brands (Morbi, GJ)',
        'Immersive Hub - Brands (NCR)',
        'Catalogue Library - Brands (NCR)',
        'Are you a Brand',
        'Old brand leads',
        'Brand Lead New',
        'Brand Leads'
    ];

    if (hardcodedBrands.includes(cleanTitle)) {
        lead.lead_type = 'brand';
    }
    // -- Hardcoded Architect Labels --
    else if (cleanTitle === '11 Event Architects & Designers') {
        lead.lead_type = 'architect';
    }
    // -- Specific Column Mappings --
    else if (cleanTitle === 'Co-working Space NCR - Architects & Designers' ||
        cleanTitle === 'Immersive hub NCR - Architects & Designers' ||
        cleanTitle === 'Catelogue Library NCR - Architects & Designers' ||
        cleanTitle === 'Students & Architects') {
        lead.lead_type = getValue(['you_are_joining_as_a:']);
    }
    else if (cleanTitle === 'Brand & Architects - INDIA (Immersive Hub)') {
        // Actual header found is often truncated or has specific dots
        lead.lead_type = getValue(['are_you_...', 'are_you_currently_a_student_or_graduate?']);
    }
    else if (cleanTitle === 'AceTech Lead') {
        // Header has "job_title" and "company_/_brand_name"
        lead.lead_type = getValue(['job_title', 'other']);
        lead.company_name = getValue(['company_/_brand_name']);
    }
    else if (cleanTitle === 'Database Brands & Architetcs') {
        lead.lead_type = getValue(['ad_name']);
    }
    else if (cleanTitle === '66K Data testing (Nov, Dec)') {
        lead.lead_type = 'other';
    }
    else if (cleanTitle === '66K Data testing (Jan, Feb)') {
        lead.lead_type = getValue(['what_best_describes_you?']);
    }

    if (cleanTitle === 'Immersive hub category wise - Brands NCR') {
        lead.city = 'NCR';
    }

    return lead;
};

const mapRowToRawColumns = (headers, row) => {
    const raw = {};
    for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (!h) continue;
        const col = getSafeColumnName(String(h));
        if (!col) continue;
        raw[col] = (row[i] ?? '').toString().trim();
    }
    return raw;
};

const processSheetSync = async (sheet, batchId, triggerType) => {
    const sheetTitle = sheet.properties.title;
    const batchSuffix = batchId.replace(/-/g, '').substring(0, 8);
    const tempTableName = `temp_${sanitizeIdentifier(sheetTitle).substring(0, 30)}_${batchSuffix}`;

    let logId = null;
    try {
        logId = await logSync(sheetTitle, 'leads', {}, batchId, 'PENDING', triggerType);
        const data = await getSheetValues(SPREADSHEET_ID, `'${sheetTitle}'!A:ZZ`);

        if (!data || data.length < 2) {
            await updateSyncLog(logId, {}, 'EMPTY');
            return { sheet: sheetTitle, status: 'EMPTY' };
        }

        const headers = data[0];
        const rows = data.slice(1);

        // Map and filter rows
        const safeSheetHeaders = Array.from(new Set(headers.map(h => getSafeColumnName(String(h))).filter(Boolean)));
        const standardHeaders = ['sheet_id', 'full_name', 'first_name', 'last_name', 'phone', 'email', 'city', 'lead_type', 'company_name'];
        const combinedHeaders = Array.from(new Set([...standardHeaders, ...safeSheetHeaders]));

        const mappedLeads = rows
            .map(r => {
                const std = mapRowToLead(headers, r, sheetTitle);
                const raw = mapRowToRawColumns(headers, r);
                return { ...raw, ...std };
            })
            .filter(l => l.sheet_id);
        console.log(`[Sync] Sheet "${sheetTitle}": Found ${rows.length} raw rows, ${mappedLeads.length} mapped leads.`);

        if (mappedLeads.length === 0) {
            await updateSyncLog(logId, {}, 'EMPTY');
            return { sheet: sheetTitle, status: 'EMPTY' };
        }

        // 1. Prepare Temp Table
        await db.query(`DROP TABLE IF EXISTS "${tempTableName}"`);
        await ensureTableExists(tempTableName, combinedHeaders);

        // 2. Insert into temp
        const insertedTempCount = await insertNewRecords(tempTableName, combinedHeaders, mappedLeads, batchId, logId);

        // 3. Merge to Leads
        await ensureTableExists('leads', combinedHeaders);
        const mergeResult = await mergeTempToLeads(tempTableName, 'leads', combinedHeaders);

        // 4. Update Log
        await updateSyncLog(logId, { tempInserted: insertedTempCount, leadsInserted: mergeResult.insertedCount }, 'SUCCESS');

        console.log(`✅ Synced ${sheetTitle}: ${mergeResult.insertedCount} new/updated records.`);
        return { sheet: sheetTitle, found: mappedLeads.length, inserted: mergeResult.insertedCount, status: 'SUCCESS' };

    } catch (error) {
        console.error(`❌ Error in sheet ${sheetTitle}:`, error.message);
        if (logId) await updateSyncLog(logId, {}, 'FAILED');
        return { sheet: sheetTitle, status: 'FAILED', error: error.message };
    } finally {
        await db.query(`DROP TABLE IF EXISTS "${tempTableName}"`).catch(() => { });
    }
};

const syncSheetToDb = async (triggerType = 'MANUAL') => {
    if (isSyncing) throw new Error('SYNC_IN_PROGRESS');
    isSyncing = true;
    try {
        console.log(`🔒 Starting Sync. Trigger: ${triggerType}`);
        const meta = await getSpreadsheetMetadata(SPREADSHEET_ID);
        const sheets = meta.sheets;
        const batchId = uuidv4();
        const results = [];

        try {
            for (let i = 0; i < sheets.length; i += 2) {
                const batch = sheets.slice(i, i + 2);
                const batchResults = await Promise.all(batch.map(s => processSheetSync(s, batchId, triggerType)));
                results.push(...batchResults);
                if (i + 2 < sheets.length) await sleep(1000);
            }
        } catch (loopError) {
            console.error('❌ Sheet Processing Loop Error:', loopError.message);
        }

        // --- Auto-Push to CRM ---
        // We run this even if some sheets failed, to push anything that DID get staged 
        // or was already pending in the crm_leads table.
        try {
            console.log('🔄 Auto-staging leads to CRM...');
            await syncToCrmStaging();
            console.log('🚀 Auto-pushing leads to Zoho...');
            await syncToZoho();
        } catch (crmError) {
            console.error('❌ Auto-CRM push failed:', crmError.message);
        }

        return { batchId, results };
    } finally {
        isSyncing = false;
        console.log('🔓 Sync Finished.');
    }
};

module.exports = { syncSheetToDb };
