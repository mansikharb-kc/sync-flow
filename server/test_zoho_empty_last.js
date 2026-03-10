const { getAccessToken } = require('./services/zohoService');
const axios = require('axios');

async function testEmptyLastName() {
    try {
        const { accessToken, apiDomain } = await getAccessToken();
        const payloadData = [{
            Last_Name: '', // EMPTY
            First_Name: 'Test',
            Company: 'Test Company',
            Email: 'test_empty_last@example.com'
        }];

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

        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.log('Status Code:', e.response?.status);
        console.log('Error Data:', JSON.stringify(e.response?.data, null, 2));
    }
}

testEmptyLastName();
