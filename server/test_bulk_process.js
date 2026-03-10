const axios = require('axios');

async function testBulkProcess() {
    try {
        console.log('--- Calling /api/crm-sync/process (Bulk Sync) ---');
        const response = await axios.post('http://localhost:5000/api/crm-sync/process');
        console.log('Success:', response.data.success);
        console.log('Results Sample (first 2):', response.data.results?.slice(0, 2));
        const successCount = response.data.results?.filter(r => r.status === 'SUCCESS').length;
        console.log('Total Success:', successCount);
    } catch (e) {
        console.log('Status Code:', e.response?.status);
        console.log('Error Message:', e.response?.data?.error || e.message);
        if (e.response?.data?.stack) console.log('Stack:', e.response.data.stack);
    }
}

testBulkProcess();
