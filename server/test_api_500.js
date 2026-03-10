const axios = require('axios');

async function testSync500() {
    try {
        console.log('--- Calling /api/zoho/sync ---');
        const response = await axios.post('http://localhost:5000/api/zoho/sync', {
            leadIds: [13268, 13269, 13270, 13271, 13272]
        });
        console.log('Response:', response.data);
    } catch (e) {
        console.log('Status Code:', e.response?.status);
        console.log('Error Data:', JSON.stringify(e.response?.data, null, 2));
    }
}

testSync500();
