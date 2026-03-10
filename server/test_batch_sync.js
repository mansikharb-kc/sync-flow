const { db } = require('./db');
const axios = require('axios');
const { getAccessToken, mapToZohoLeadType } = require('./services/zohoService');

async function testBatchSync() {
    try {
        console.log('--- Testing Batch Sync (5 Records) ---');
        const { rows: stagedLeads } = await db.query("SELECT * FROM crm_leads LIMIT 5");

        if (stagedLeads.length === 0) {
            console.log('No leads in staging.');
            return;
        }

        const { accessToken, apiDomain } = await getAccessToken();
        const results = [];

        const payloadData = stagedLeads.map(lead => {
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
            return data;
        });

        console.log('Pushing batch of 5 to Zoho...');
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
        console.log(`Received ${zohoResponses.length} responses from Zoho.`);

        for (let j = 0; j < zohoResponses.length; j++) {
            const zohoRes = zohoResponses[j];
            const lead = stagedLeads[j];

            if (zohoRes.status === 'success') {
                console.log(`Lead ${lead.source_id}: Success`);
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
                } catch (err) {
                    console.error(`❌ DB Insert Error for ${lead.source_id}:`, err.message);
                }
            } else {
                console.log(`Lead ${lead.source_id}: Failed - ${zohoRes.message}`);
            }
        }

        process.exit(0);
    } catch (e) {
        console.error('CRITICAL Error:', e.message);
        if (e.response) console.error('Details:', e.response.data);
        process.exit(1);
    }
}

testBatchSync();
