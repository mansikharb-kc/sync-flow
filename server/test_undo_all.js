const axios = require('axios');

async function testUndoAll() {
    try {
        console.log('--- Calling /api/zoho/undo-all ---');
        const response = await axios.post('http://localhost:5000/api/zoho/undo-all');
        console.log('Response:', response.data);
    } catch (e) {
        console.log('Status Code:', e.response?.status);
        console.log('Error Data:', JSON.stringify(e.response?.data, null, 2));
    }
}

testUndoAll();
