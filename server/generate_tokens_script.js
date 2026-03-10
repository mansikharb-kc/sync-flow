require('dotenv').config();
const { generateTokens } = require('./services/zohoService');

const grantToken = process.argv[2];

if (!grantToken) {
    console.error("Please provide Grant Token as Argument.");
    process.exit(1);
}

generateTokens(grantToken)
    .then(() => {
        console.log("✅ Successfully Generated Refresh Token from Grant Token.");
        process.exit(0);
    })
    .catch(err => {
        console.error("❌ Failed:", err);
        process.exit(1);
    });
