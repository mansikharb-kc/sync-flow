require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { db } = require('./db');

async function safeQuery(label, sql, params = []) {
  try {
    const r = await db.query(sql, params);
    return { label, ok: true, rows: r.rows };
  } catch (e) {
    return { label, ok: false, error: e?.message || String(e) };
  }
}

async function main() {
  const results = [];

  results.push(await safeQuery('counts.leads', 'SELECT COUNT(*)::int AS c FROM leads'));
  results.push(await safeQuery('counts.crm_leads', 'SELECT COUNT(*)::int AS c FROM crm_leads'));
  results.push(await safeQuery('counts.crm_records', 'SELECT COUNT(*)::int AS c FROM crm_records'));

  results.push(await safeQuery('leads.quality', `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sheet_id IS NULL OR sheet_id = '')::int AS missing_sheet_id,
      COUNT(*) FILTER (WHERE COALESCE(full_name,'')='' AND COALESCE(first_name,'')='' AND COALESCE(last_name,'')='')::int AS missing_name,
      COUNT(*) FILTER (WHERE COALESCE(company_name,'')='')::int AS missing_company_name,
      COUNT(*) FILTER (WHERE COALESCE(email,'')='')::int AS missing_email,
      COUNT(*) FILTER (WHERE COALESCE(phone,'')='')::int AS missing_phone
    FROM leads
  `));

  results.push(await safeQuery('crm_leads.by_status', `
    SELECT crm_status, COUNT(*)::int AS c
    FROM crm_leads
    GROUP BY crm_status
    ORDER BY crm_status
  `));

  results.push(await safeQuery('crm_leads.failed_sample', `
    SELECT source_id, crm_status, LEFT(error_message, 200) AS error
    FROM crm_leads
    WHERE crm_status = 'Failed'
    ORDER BY id DESC
    LIMIT 10
  `));

  results.push(await safeQuery('crm_records.sample', `
    SELECT source_id, zoho_id, crm_insert_time
    FROM crm_records
    ORDER BY crm_insert_time DESC NULLS LAST
    LIMIT 10
  `));

  // Print
  for (const r of results) {
    if (!r.ok) {
      console.log(`❌ ${r.label}: ${r.error}`);
      continue;
    }
    console.log(`\n=== ${r.label} ===`);
    if (r.rows.length === 1) console.log(r.rows[0]);
    else console.log(r.rows);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});

