const { getAccessToken } = require('./server/services/zohoService');

async function testToken() {
    try {
        console.log('Testing Zoho Access Token...');
        const result = await getAccessToken();
        console.log('✅ Token obtained:', result.accessToken.substring(0, 5) + '...');
        process.exit(0);
    } catch (e) {
        console.error('❌ Token Error:', e.message);
        if (e.response) {
            console.error('Response data:', e.response.data);
        }
        process.exit(1);
    }
}

testToken();
