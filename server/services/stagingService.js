const { db } = require('../db');
const { getAccessToken, mapToZohoLeadType } = require('./zohoService');
const axios = require('axios');

const formatAxiosError = (err) => {
    const status = err?.response?.status;
    const data = err?.response?.data;
    const details = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : (err?.message || 'Unknown error');
    return { status, details };
};

/**
 * Cleans raw category value from sheet into Zoho multi-select format.
 * e.g. "architect_/_interior_designer" -> "Architect;Interior Designer"
 * e.g. "architect" -> "Architect"
 */
const cleanCategoryForZoho = (rawCategory) => {
    if (!rawCategory || String(rawCategory).trim() === '') return null;

    const raw = String(rawCategory).trim();

    // Split by common multi-select delimiters: "_/_", "/", ",", ";"
    const parts = raw.split(/[,;]|_\/_|\//)
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => {
            // Convert underscores to spaces, then Title Case each word
            return part.replace(/_/g, ' ').trim()
                .split(/\s+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        });

    // Remove duplicates
    const unique = [...new Set(parts)];

    // Join with semicolon for Zoho multi-select picklist format
    return unique.length > 0 ? unique.join(';') : null;
};

/**
 * Normalizes raw lead_type value into a clean Zoho-compatible category.
 * Ported from Python normalization logic.
 *
 * Rules (priority order):
 *   "architect_/_interior_designer"  -> "Architect"
 *   "architect"                      -> "Architect"
 *   "manufacturer / brand"           -> "Brand"
 *   "manufacturer"                   -> "Brand"
 *   "brand"                          -> "Brand"
 *   "interior_designer"              -> "Interior Designers"
 *   anything else / null / empty     -> "Other"
 */
const normalizeLeadType = (rawValue) => {
    if (!rawValue || String(rawValue).trim() === '') return 'Other';

    const v = String(rawValue).toLowerCase().trim().replace(/_/g, ' ');

    // Architect – must come before interior designer check
    if (v.includes('architect / interior designer') ||
        v.includes('architect_/_interior_designer') ||
        v.includes('architect/interior') ||
        v.includes('architect')) {
        return 'Architect';
    }

    // Brand / Manufacturer
    if (v.includes('manufacturer / brand') ||
        v.includes('manufacturer/brand') ||
        v.includes('manufacturer') ||
        v.includes('brand')) {
        return 'Brand';
    }

    // Interior Designer (standalone, after architect check)
    if (v.includes('interior designer') ||
        v.includes('interior_designer')) {
        return 'Interior Designers';
    }

    // Default
    return 'Other';
};

/**
 * Splits a full name into first and last parts.
 * First word = first_name, remaining = last_name.
 */
const splitFullName = (fullName) => {
    if (!fullName || String(fullName).trim() === '') return { firstName: '', lastName: '' };
    const parts = String(fullName).trim().split(/\s+/);
    if (parts.length === 1) return { firstName: '', lastName: parts[0] };
    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

const ensureStagingTables = async () => {
    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_leads (
            id SERIAL PRIMARY KEY,
            source_id VARCHAR(255) UNIQUE NOT NULL,
            first_name TEXT,
            last_name TEXT,
            company TEXT,
            email TEXT,
            phone TEXT,
            lead_type TEXT,
            city TEXT,
            crm_status VARCHAR(50) DEFAULT 'Pending',
            error_message TEXT,
            insert_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Auto-migration: add new columns if table already exists without them
    const crmLeadsCols = ['lead_type', 'city'];
    for (const col of crmLeadsCols) {
        try {
            await db.query(`ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS ${col} TEXT`);
        } catch (e) { /* ignore */ }
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS crm_records (
            id SERIAL PRIMARY KEY,
            source_id VARCHAR(255) UNIQUE NOT NULL,
            first_name TEXT,
            last_name TEXT,
            company TEXT,
            email TEXT,
            phone TEXT,
            lead_type TEXT,
            city TEXT,
            crm_status VARCHAR(50),
            zoho_id VARCHAR(100),
            insert_time TIMESTAMP,
            crm_insert_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Auto-migration: add new columns if table already exists without them
    const crmRecordsCols = ['lead_type', 'city'];
    for (const col of crmRecordsCols) {
        try {
            await db.query(`ALTER TABLE crm_records ADD COLUMN IF NOT EXISTS ${col} TEXT`);
        } catch (e) { /* ignore */ }
    }
};

/**
 * Syncs leads from main 'leads' table to crm_leads staging table.
 * Applies lead_type normalization and full_name splitting.
 */
const syncToCrmStaging = async () => {
    await ensureStagingTables();
    console.log('--- Syncing Leads to CRM Staging (Full Refresh) ---');
    const results = { staged: 0, errors: 0 };

    // 1. Clear existing staging table
    await db.query('TRUNCATE TABLE crm_leads');

    // 2. Fetch records from leads that are NOT already in crm_records
    const { rows: allLeads } = await db.query(`
        SELECT * FROM leads 
        WHERE sheet_id NOT IN (SELECT source_id FROM crm_records)
        ORDER BY _created_at DESC
    `);

    console.log(`Processing ${allLeads.length} leads for staging...`);

    // Process in batches to avoid overwhelming the DB connection
    const BATCH_SIZE = 200;

    for (let i = 0; i < allLeads.length; i += BATCH_SIZE) {
        const batch = allLeads.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (lead) => {
            const findValue = (keywords) => {
                const key = Object.keys(lead).find(k =>
                    keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
                );
                return key ? lead[key] : null;
            };

            // ── Name: Use processed fields if available, otherwise fallback ──────────
            let firstName = lead.first_name;
            let lastName = lead.last_name;

            if (!firstName && !lastName) {
                const rawFirstName = lead.first_name || findValue(['first_name', 'fname']);
                const rawLastName = lead.last_name || findValue(['last_name', 'lname', 'surname']);

                if (rawFirstName || rawLastName) {
                    firstName = rawFirstName || '';
                    lastName = rawLastName || '';
                } else {
                    const split = splitFullName(lead.full_name);
                    firstName = split.firstName;
                    lastName = split.lastName;
                }
            }

            // ── Company ───────────────────────────────────────────────────────
            const company = lead.company_name
                || lead.brand_name
                || findValue(['company', 'brand', 'firm'])
                || null;

            // ── Email ─────────────────────────────────────────────────────────
            const rawEmail = lead.email || findValue(['email', 'mail']) || null;
            const email = (typeof rawEmail === 'string' && rawEmail.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/))
                ? rawEmail.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)[0]
                : (typeof rawEmail === 'string' ? rawEmail.trim() : null);

            // ── City ──────────────────────────────────────────────────────────
            const city = lead.city || findValue(['city', 'location']) || null;

            // ── Lead Type  (normalize) ─────────────────────────────────────────
            const rawLeadType = lead.lead_type
                || findValue(['lead_type', 'type_of_lead', 'enquiry_type'])
                || null;
            const lead_type = normalizeLeadType(rawLeadType);

            // ── Phone ─────────────────────────────────────────────────────────
            const phoneRaw = (() => {
                const keywords = ['phone', 'mobile'];
                const matchingKeys = Object.keys(lead).filter(k =>
                    keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
                );
                for (const k of matchingKeys) {
                    if (lead[k] && String(lead[k]).trim() !== '') return lead[k];
                }
                return null;
            })();

            const cleanPhone = phoneRaw
                ? String(phoneRaw).replace(/^p:/i, '').replace(/[^\d+]/g, '')
                : null;

            try {
                await db.query(`
                    INSERT INTO crm_leads
                        (source_id, first_name, last_name, company, email, phone,
                         lead_type, city, insert_time)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (source_id) DO UPDATE SET
                        first_name = EXCLUDED.first_name,
                        last_name = EXCLUDED.last_name,
                        company = EXCLUDED.company,
                        email = EXCLUDED.email,
                        phone = EXCLUDED.phone,
                        lead_type = EXCLUDED.lead_type,
                        city = EXCLUDED.city,
                        insert_time = EXCLUDED.insert_time
                `, [
                    lead.sheet_id, firstName, lastName, company, email, cleanPhone,
                    lead_type, city, lead._created_at || new Date()
                ]);
                results.staged++;
            } catch (insertError) {
                console.error(`❌ Error staging lead ${lead.sheet_id}:`, insertError.message);
                results.errors++;
            }
        }));
    }

    console.log(`✅ Staging complete: ${results.staged} staged, ${results.errors} errors`);
    return results;
};

/**
 * Pushes pending staged leads to Zoho CRM
 */
const syncToZoho = async () => {
    console.log('--- Starting CRM Sync from Staging (Bulk Process) ---');
    const results = [];

    try {
        const { accessToken, apiDomain } = await getAccessToken();

        // Fetch up to 500 leads for processing. Include both 'Pending' and 'Failed' 
        // to allow for automated retries of intermittent API issues.
        const { rows: pendingLeads } = await db.query(
            "SELECT * FROM crm_leads WHERE crm_status IN ('Pending', 'Failed') LIMIT 500"
        );

        if (pendingLeads.length === 0) {
            console.log('No pending leads found in staging.');
            return [];
        }

        console.log(`Pusing ${pendingLeads.length} leads to Zoho in chunks of 100...`);

        const CHUNK_SIZE = 100;
        for (let i = 0; i < pendingLeads.length; i += CHUNK_SIZE) {
            const chunk = pendingLeads.slice(i, i + CHUNK_SIZE);

            const payloadData = chunk.map(lead => {
                const data = {
                    Last_Name: lead.last_name || '',
                    First_Name: lead.first_name || '',
                    Company: lead.company || '',
                    Email: lead.email || null,
                    Phone: lead.phone || null,
                    Mobile: lead.phone || null
                };
                if (lead.city) data.City = lead.city;
                if (lead.lead_type) {
                    const finalType = mapToZohoLeadType(lead.lead_type);
                    data.Lead_Source = finalType;
                    data.Lead_Type = finalType; // Explicitly map to Lead_Type as well
                }
                return data;
            });

            console.log('Sending payload to Zoho:', JSON.stringify(payloadData, null, 2));
            try {
                const response = await axios.post(
                    `${apiDomain}/crm/v2/Leads`,
                    { data: payloadData },
                    {
                        headers: {
                            'Authorization': `Zoho-oauthtoken ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 30000
                    }
                );

                const zohoResponses = response.data.data;

                for (let j = 0; j < zohoResponses.length; j++) {
                    const zohoRes = zohoResponses[j];
                    const lead = chunk[j];

                    try {
                        if (zohoRes.status === 'success') {
                            await db.query(`
                                INSERT INTO crm_records
                                    (source_id, first_name, last_name, company, email, phone,
                                     lead_type, city, crm_status, insert_time, crm_insert_time, zoho_id)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Success', $9, NOW(), $10)
                                ON CONFLICT (source_id) DO UPDATE SET
                                    first_name = EXCLUDED.first_name,
                                    last_name = EXCLUDED.last_name,
                                    company = EXCLUDED.company,
                                    email = EXCLUDED.email,
                                    phone = EXCLUDED.phone,
                                    lead_type = EXCLUDED.lead_type,
                                    city = EXCLUDED.city,
                                    crm_status = EXCLUDED.crm_status,
                                    crm_insert_time = NOW(),
                                    zoho_id = EXCLUDED.zoho_id
                            `, [
                                lead.source_id, lead.first_name, lead.last_name, lead.company,
                                lead.email, lead.phone, lead.lead_type, lead.city,
                                lead.insert_time, zohoRes.details.id
                            ]);

                            await db.query('DELETE FROM crm_leads WHERE id = $1', [lead.id]);

                            // Also update the master leads table
                            await db.query(
                                'UPDATE "leads" SET zoho_status = $1, zoho_id = $2, zoho_error = NULL, zoho_insert_time = NOW() WHERE sheet_id = $3',
                                ['SUCCESS', zohoRes.details.id, lead.source_id]
                            );

                            results.push({ id: lead.source_id, status: 'SUCCESS', zoho_id: zohoRes.details.id });
                        } else {
                            const detailStr = zohoRes.details ? JSON.stringify(zohoRes.details) : '';
                            const fullError = `${zohoRes.message} ${detailStr}`.trim();
                            await db.query(`
                                UPDATE crm_leads 
                                SET crm_status = 'Failed', error_message = $1
                                WHERE id = $2
                            `, [fullError, lead.id]);

                            // Also update the master leads table
                            await db.query(
                                'UPDATE "leads" SET zoho_status = $1, zoho_error = $2 WHERE sheet_id = $3',
                                ['FAILED', fullError, lead.source_id]
                            );

                            results.push({ id: lead.source_id, status: 'FAILED', error: fullError });
                        }
                    } catch (dbError) {
                        console.error(`DB Error during Zoho response processing for ${lead.source_id}:`, dbError.message);
                        results.push({ id: lead.source_id, status: 'FAILED', error: `Internal DB Error: ${dbError.message}` });
                    }
                }
            } catch (chunkError) {
                const formatted = formatAxiosError(chunkError);
                console.error(
                    `Zoho Chunk Error (Batch starting at ${i}, status=${formatted.status || 'n/a'}):`,
                    formatted.details
                );
                // Mark these leads as failed in staging so we don't loop endlessly
                for (const lead of chunk) {
                    const errDetails = formatted.details?.slice(0, 1500);
                    await db.query(
                        "UPDATE crm_leads SET crm_status = 'Failed', error_message = $1 WHERE id = $2",
                        [errDetails || chunkError.message, lead.id]
                    );
                    results.push({ id: lead.source_id, status: 'FAILED', error: errDetails || chunkError.message });
                }
            }

            // Small delay between chunks to avoid rate issues
            if (i + CHUNK_SIZE < pendingLeads.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } catch (error) {
        console.error('--- CRM Sync Failed ---', error.message);
        throw error;
    }
    return results;
};

module.exports = { syncToCrmStaging, syncToZoho, normalizeLeadType };
