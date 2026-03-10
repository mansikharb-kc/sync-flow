
require('dotenv').config({ path: __dirname + '/server/.env' });
const { syncToCrmStaging, syncToZoho } = require('./server/services/stagingService');

async function runPush() {
    try {
        console.log('🚀 Phase 1: Syncing from main leads table to CRM staging...');
        const stageResults = await syncToCrmStaging();
        console.log(`✅ Staging complete: ${stageResults.staged} records staged.`);

        console.log('\n🚀 Phase 2: Pushing staged leads to Zoho CRM...');
        const pushResults = await syncToZoho();

        if (pushResults.length === 0) {
            console.log('ℹ️ No leads were pushed (possibly none pending or already pushed).');
        } else {
            const success = pushResults.filter(r => r.status === 'SUCCESS').length;
            const failed = pushResults.filter(r => r.status === 'FAILED').length;
            console.log(`\n📊 Push Results:`);
            console.log(`✅ Success: ${success}`);
            console.log(`❌ Failed:  ${failed}`);

            if (failed > 0) {
                console.log('\nErrors:');
                pushResults.filter(r => r.status === 'FAILED').forEach(r => {
                    console.log(` - ID ${r.id}: ${r.error}`);
                });
            }
        }
    } catch (error) {
        console.error('\n❌ Fatal Push Error:', error.message);
        if (error.stack) console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

runPush();
