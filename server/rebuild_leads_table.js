require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { db } = require('./db');
const { getSpreadsheetMetadata, getSheetValues } = require('./services/sheetService');
const { ensureTableExists, getSafeColumnName } = require('./services/dbService');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

const unique = (arr) => Array.from(new Set(arr));

async function main() {
  if (!SPREADSHEET_ID) {
    throw new Error('Missing SPREADSHEET_ID in environment');
  }

  console.log('🔎 Reading sheet headers to rebuild leads table...');
  const meta = await getSpreadsheetMetadata(SPREADSHEET_ID);
  const sheets = meta.sheets || [];
  if (sheets.length === 0) throw new Error('No sheets found in spreadsheet metadata');

  const standardHeaders = [
    'sheet_id',
    'full_name',
    'first_name',
    'last_name',
    'phone',
    'email',
    'city',
    'lead_type',
    'company_name'
  ];

  const allHeaders = [...standardHeaders];

  for (const s of sheets) {
    const title = s.properties?.title;
    if (!title) continue;

    // Read just the header row
    const values = await getSheetValues(SPREADSHEET_ID, `'${title}'!A1:ZZ1`).catch(() => null);
    const headersRow = values && values[0] ? values[0] : [];

    const safeHeaders = headersRow
      .map(h => getSafeColumnName(String(h)))
      .filter(Boolean);

    allHeaders.push(...safeHeaders);
  }

  const combined = unique(allHeaders);
  // Ensure sheet_id is first
  const finalHeaders = ['sheet_id', ...combined.filter(h => h !== 'sheet_id')];

  console.log(`🧨 Dropping "leads" table (if exists)...`);
  await db.query('DROP TABLE IF EXISTS "leads" CASCADE');

  console.log(`🧱 Creating new "leads" table with ${finalHeaders.length} columns...`);
  await ensureTableExists('leads', finalHeaders);

  console.log('✅ Rebuild complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Rebuild failed:', e?.message || e);
  process.exit(1);
});

