const axios = require('axios');
const { db } = require('../db');
const FormData = require('form-data');

// Domain Config (Allow Override, default to .com)
const ACCOUNTS_URL = process.env.ZOHO_AUTH_DOMAIN || 'https://accounts.zoho.com';
const API_URL = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';

const CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI = process.env.ZOHO_REDIRECT_URI || 'http://localhost:5000/api/zoho/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('⚠️ CRITICAL: ZOHO_CLIENT_ID or ZOHO_CLIENT_SECRET is missing from environment variables.');
}

/**
 * Ensures database table for storing Zoho Tokens exists
 */
const ensureZohoConfigTable = async () => {
    const query = `
        CREATE TABLE IF NOT EXISTS "zoho_config" (
            "id" SERIAL PRIMARY KEY,
            "access_token" TEXT,
            "refresh_token" TEXT,
            "expires_at" TIMESTAMP,
            "api_domain" VARCHAR(255) DEFAULT '${API_URL}'
        );
    `;
    await db.query(query);
};

/**
 * Gets valid access token, refreshing if necessary
 */
const getAccessToken = async () => {
    await ensureZohoConfigTable();

    // 1. Try to get from DB
    const { rows } = await db.query('SELECT * FROM "zoho_config" LIMIT 1');
    let config = rows[0];

    // 2. If no config in DB, check if we have a hardcoded refresh token in ENV to bootstrap
    if (!config && process.env.ZOHO_REFRESH_TOKEN) {
        console.log('🌱 Bootstrapping Zoho Config from Environment Variables...');
        // Insert a placeholder record with the refresh token so we can start the refresh flow
        const { rows: newRows } = await db.query(
            'INSERT INTO "zoho_config" (refresh_token, api_domain) VALUES ($1, $2) RETURNING *',
            [process.env.ZOHO_REFRESH_TOKEN, API_URL]
        );
        config = newRows[0];
    }

    if (!config) {
        throw new Error('ZOHO_NOT_CONFIGURED: Missing Refresh Token in DB or ENV');
    }

    const now = new Date();

    // 3. Check if access token is valid (and not expiring in next 5 mins)
    if (config.access_token && config.expires_at && new Date(config.expires_at) > new Date(now.getTime() + 5 * 60000)) {
        return { accessToken: config.access_token, apiDomain: config.api_domain || API_URL };
    }

    // 4. Refresh Token Logic
    console.log(`🔄 Refreshing Zoho Access Token using domain: ${ACCOUNTS_URL}...`);
    try {
        const params = new URLSearchParams();
        params.append('refresh_token', config.refresh_token);
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'refresh_token');

        const response = await axios.post(`${ACCOUNTS_URL}/oauth/v2/token`, params);

        const { access_token, expires_in, api_domain } = response.data;

        if (!access_token) {
            // Handle error (e.g., refresh token invalid)
            if (response.data.error === 'invalid_token') {
                // Maybe delete the config row so we can re-auth?
                // await db.query('DELETE FROM "zoho_config" WHERE id = $1', [config.id]);
                throw new Error('Invalid Refresh Token. Please Re-Authenticate.');
            }
            throw new Error('Failed to refresh token: ' + JSON.stringify(response.data));
        }

        const newExpiresAt = new Date(now.getTime() + (expires_in * 1000));
        // Use the API domain returned by Zoho, or fallback to current config/defaults
        const newApiDomain = api_domain || config.api_domain || API_URL;

        await db.query(
            'UPDATE "zoho_config" SET access_token = $1, expires_at = $2, api_domain = $3 WHERE id = $4',
            [access_token, newExpiresAt, newApiDomain, config.id]
        );

        return { accessToken: access_token, apiDomain: newApiDomain };

    } catch (error) {
        console.error('❌ Zoho Token Refresh Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Initial Setup: Exchange Authorization Code for Refresh Token
 */
const generateTokens = async (grantToken) => {
    await ensureZohoConfigTable();

    try {
        const params = new URLSearchParams();
        params.append('code', grantToken);
        params.append('redirect_uri', REDIRECT_URI);
        if (!CLIENT_ID || !CLIENT_SECRET) {
            throw new Error('MISSING_ZOHO_CREDENTIALS: ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set in environment.');
        }
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        params.append('grant_type', 'authorization_code');

        const response = await axios.post(`${ACCOUNTS_URL}/oauth/v2/token`, params);

        console.log('📦 FULL ZOHO RESPONSE:', response.data);

        const { access_token, refresh_token, expires_in, api_domain } = response.data;

        if (!refresh_token) {
            console.warn('⚠️ No refresh token received. Zoho only sends this on the first consent.');
            // We allow proceeding if we at least got an access token, but refresh won't work later
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + (expires_in * 1000));

        // Use returned api_domain or fallback to configured one
        const finalApiDomain = api_domain || API_URL;

        // Clear old config and insert new
        await db.query('TRUNCATE TABLE "zoho_config"');
        await db.query(
            'INSERT INTO "zoho_config" (access_token, refresh_token, expires_at, api_domain) VALUES ($1, $2, $3, $4)',
            [access_token, refresh_token, expiresAt, finalApiDomain]
        );

        return { success: true };

    } catch (error) {
        console.error('❌ Generate Tokens Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Generate Authorization URL
 */
const getAuthUrl = () => {
    const scopes = [
        'ZohoCRM.modules.leads.ALL',
        'ZohoCRM.settings.ALL',
        'ZohoCRM.users.ALL'
    ].join(',');

    return `${ACCOUNTS_URL}/oauth/v2/auth?scope=${scopes}&client_id=${CLIENT_ID}&response_type=code&access_type=offline&redirect_uri=${REDIRECT_URI}&prompt=consent`;
};

/**
 * Cleans raw category value from sheet into Zoho multi-select format.
 * e.g. "architect_/_interior_designer" -> "Architect;Interior Designer"
 */
const cleanCategory = (rawCategory) => {
    if (!rawCategory || String(rawCategory).trim() === '') return null;

    const raw = String(rawCategory).trim();
    const parts = raw.split(/[,;]|_\/_|\//)
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => {
            return part.replace(/_/g, ' ').trim()
                .split(/\s+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
        });

    const unique = [...new Set(parts)];
    return unique.length > 0 ? unique.join(';') : null;
};

/**
 * Standardizes Lead Type to match Zoho Picklist Options
 * Expected: Brand, Architect, Interior Designers, Other
 */
const mapToZohoLeadType = (rawType) => {
    if (!rawType) return 'Other';
    const type = String(rawType).toLowerCase().trim();

    if (type.includes('brand')) return 'Brand';
    if (type.includes('architect')) return 'Architect';
    if (type.includes('interior')) return 'Interior Designers';

    return 'Other';
};

/**
 * Validate and Map Lead Data
 */
const mapLeadData = (lead) => {
    const findValue = (keywords) => {
        const key = Object.keys(lead).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
        return key ? lead[key] : null;
    };

    // Use processed fields if available
    let firstName = lead.first_name;
    let lastName = lead.last_name;

    if (!firstName && !lastName) {
        firstName = findValue(['first_name', 'fname']) || '';
        lastName = findValue(['last_name', 'lname', 'surname']) || lead.full_name || '';
    }

    const company = lead.company_name || findValue(['company', 'brand', 'firm']) || ''; // Note: Zoho typically requires this, will be caught by validation or Zoho API
    const email = lead.email || findValue(['email', 'mail']);
    const phone = lead.phone || findValue(['phone', 'mobile']);

    // Validation
    const errors = [];
    const cleanPhone = phone ? String(phone).replace(/\D/g, '') : null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
        errors.push(`Invalid email format: ${email}`);
    }

    if (!lastName) errors.push("Last Name is mandatory");

    // Lead Type & City
    const finalType = mapToZohoLeadType(lead.lead_type || findValue(['lead_type', 'type']));
    const city = lead.city || findValue(['city', 'location', 'distt']);

    const data = {
        Last_Name: lastName,
        First_Name: firstName,
        Company: company,
        Email: email,
        Mobile: cleanPhone,
        Description: `Imported from SyncFlow. Source ID: ${lead.sheet_id}`
    };

    data.Lead_Source = finalType;
    data.Lead_Type = finalType;
    if (city) data.City = city;

    return {
        data,
        isValid: errors.length === 0,
        errors
    };
};

/**
 * Push Leads to Zoho CRM (Bulk Optimized)
 */
const pushLeadsToZoho = async (leadIds) => {
    // 1. Get Token
    const { accessToken, apiDomain } = await getAccessToken();

    // 2. Fetch Leads from DB
    const { rows: leads } = await db.query('SELECT * FROM "leads" WHERE sheet_id = ANY($1)', [leadIds]);

    // 3. Prepare Batches (limit 100 per request per Zoho API limits)
    const BATCH_SIZE = 100;
    const results = [];

    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batchLeads = leads.slice(i, i + BATCH_SIZE);
        const recordsToPush = [];
        const mappingResults = []; // To keep track of valid/invalid within batch

        // Validate and Map Data for the Batch
        for (const lead of batchLeads) {
            const { data, isValid, errors } = mapLeadData(lead);

            if (!isValid) {
                // Invalid: Handle immediately
                await db.query('UPDATE "leads" SET zoho_status = $1, zoho_error = $2 WHERE sheet_id = $3', ['FAILED', errors.join(', '), lead.sheet_id]);
                results.push({ id: lead.sheet_id, status: 'FAILED', error: errors.join(', ') });
                mappingResults.push(null); // Placeholder to maintain index sync if needed, though we filter invalid out of recordsToPush
            } else {
                // Valid: Add to push list
                recordsToPush.push({ ...data, _sheet_id: lead.sheet_id, _created_at: lead._created_at }); // Store metadata for later use
                mappingResults.push({ valid: true });
            }
        }

        if (recordsToPush.length === 0) continue;

        try {
            // Clean payload (remove metadata fields before sending to Zoho)
            const payloadData = recordsToPush.map(({ _sheet_id, _created_at, ...rest }) => rest);

            const response = await axios.post(
                `${apiDomain}/crm/v2/Leads`,
                { data: payloadData },
                {
                    headers: {
                        'Authorization': `Zoho-oauthtoken ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Process Responses (Zoho returns array matching input order)
            const zohoResponses = response.data.data;

            // Loop through responses and update DB
            for (let j = 0; j < zohoResponses.length; j++) {
                const zohoRes = zohoResponses[j];
                const originalLead = recordsToPush[j];
                const sheetId = originalLead._sheet_id;
                const dbInsertTime = new Date(originalLead._created_at);

                if (zohoRes.status === 'success') {
                    const zohoId = zohoRes.details.id;
                    const successTime = new Date();

                    await db.query(
                        'UPDATE "leads" SET zoho_status = $1, zoho_id = $2, zoho_insert_time = $3, zoho_error = NULL WHERE sheet_id = $4',
                        ['SUCCESS', zohoId, successTime, sheetId]
                    );

                    results.push({
                        id: sheetId,
                        status: 'SUCCESS',
                        zoho_id: zohoId,
                        times: {
                            db_insert: dbInsertTime,
                            crm_insert: successTime
                        }
                    });
                } else {
                    const errorMsg = zohoRes.message;
                    await db.query('UPDATE "leads" SET zoho_status = $1, zoho_error = $2 WHERE sheet_id = $3', ['FAILED', errorMsg, sheetId]);
                    results.push({ id: sheetId, status: 'FAILED', error: errorMsg });
                }
            }

        } catch (apiError) {
            // Batch Failure (e.g. Network error or Auth failure)
            const msg = apiError.response?.data?.message || apiError.message;
            console.error("Batch Sync Error:", msg);

            // Mark all in this batch as failed
            for (const l of recordsToPush) {
                await db.query('UPDATE "leads" SET zoho_status = $1, zoho_error = $2 WHERE sheet_id = $3', ['FAILED', msg, l._sheet_id]);
                results.push({ id: l._sheet_id, status: 'FAILED', error: msg });
            }
        }
    }

    return results;
};

/**
 * Delete a Lead from Zoho CRM
 */
const deleteLeadFromZoho = async (zohoId) => {
    try {
        const { accessToken, apiDomain } = await getAccessToken();
        const response = await axios.delete(
            `${apiDomain}/crm/v2/Leads/${zohoId}`,
            {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('❌ Zoho Delete Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Returns the current Zoho user associated with the stored OAuth token.
 * This is the quickest way to confirm whether the connected Zoho account has API permission.
 */
const getCurrentZohoUser = async () => {
    const { accessToken, apiDomain } = await getAccessToken();
    try {
        const res = await axios.get(`${apiDomain}/crm/v2/users?type=CurrentUser`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
            timeout: 15000
        });
        const user = Array.isArray(res.data?.users) ? res.data.users[0] : null;
        return { user: user || null };
    } catch (err) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const details = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : (err?.message || 'Unknown error');
        const e = new Error(details);
        e.status = status;
        e.details = details;
        throw e;
    }
};

module.exports = {
    generateTokens,
    getAccessToken,
    mapLeadData,
    deleteLeadFromZoho,
    getAuthUrl,
    mapToZohoLeadType,
    getCurrentZohoUser
};
