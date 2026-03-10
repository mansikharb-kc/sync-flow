require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { db } = require('./db');

(async () => {
  const sql = `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
    ORDER BY ordinal_position
  `;
  const r = await db.query(sql);
  console.log('LEADS_COLS=' + r.rows.length);
  console.log(r.rows.map(x => x.column_name).join(', '));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

