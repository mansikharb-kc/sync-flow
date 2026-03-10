const { db } = require('./db');
const axios = require('axios');
const { getAccessToken, mapToZohoLeadType } = require('./services/zohoService');

async function debugSync() {
    try {
        console.log('--- Debugging Zoho Sync (Single Record) ---');
        const { rows: staged } = await db.query("SELECT * FROM crm_leads LIMIT 1");
        if (staged.length === 0) {
            console.log('No leads in staging.');
            return;
        }

        const lead = staged[0];
        console.log('Processing Lead:', lead.source_id);

        const { accessToken, apiDomain } = await getAccessToken();

        const data = {
            Last_Name: lead.last_name || 'Unknown',
            First_Name: lead.first_name || '',
            Company: lead.company || lead.last_name || 'Individual',
            Email: lead.email || null,
            Phone: lead.phone || null,
            Mobile: lead.phone || null
        };
        if (lead.city) data.City = lead.city;
        if (lead.lead_type) {
            const finalType = mapToZohoLeadType(lead.lead_type);
            data.Lead_Source = finalType;
            data.Lead_Type = finalType;
        }

        console.log('Pushing to Zoho...');
        const response = await axios.post(
            `${apiDomain}/crm/v2/Leads`,
            { data: [data] },
            {
                headers: {
                    'Authorization': `Zoho-oauthtoken ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        const zohoRes = response.data.data[0];
        console.log('Zoho Result:', zohoRes.status, zohoRes.message || '');

        if (zohoRes.status === 'success') {
            console.log('Attempting DB Insert into crm_records...');
            try {
                await db.query(`
                    INSERT INTO crm_records (source_id, first_name, last_name, company, email, phone, lead_type, city, crm_status, insert_time, crm_insert_time, zoho_id)
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
                `, [lead.source_id, lead.first_name, lead.last_name, lead.company, lead.email, lead.phone, lead.lead_type, lead.city, lead.insert_time, zohoRes.details.id]);
                console.log('✅ DB Insert Success');
            } catch (dbError) {
                console.error('❌ DB Insert Failed:', dbError.message);
                console.error(dbError.stack);
            }
        } else {
            console.log('Zoho reported failure:', zohoRes.message);
        }

        process.exit(0);
    } catch (e) {
        console.error('❌ Sync Error:', e.message);
        if (e.response) console.error('Data:', e.response.data);
        process.exit(1);
    }
}

debugSync();
