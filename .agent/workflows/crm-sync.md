---
description: CRM Staging and Zoho Sync Workflow
---

This workflow manages the staging of leads into a CRM-ready format and their subsequent synchronization with Zoho CRM.

### Step 1: Stage New Leads
This step identifies new records in the `leads` table that haven't been staged yet and moves them to `crm_leads`.

// turbo
1. Run the staging sync script:
```bash
node server/sync_to_staging.js
```

### Step 2: Push to Zoho CRM
This step takes all 'Pending' records from `crm_leads` and attempts to push them to Zoho CRM.

// turbo
1. Run the Zoho sync script:
```bash
node server/sync_to_zoho.js
```

### Step 3: Verify Results
Check the status of your staged leads.

1. Query the database for summary:
```bash
node -e "const { db } = require('./server/db'); async function check() { const res = await db.query('SELECT crm_status, COUNT(*) FROM crm_leads GROUP BY crm_status'); console.table(res.rows); process.exit(0); } check();"
```
