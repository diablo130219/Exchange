const { Pool } = require('pg');

const sourceUrl = process.env.SOURCE_DATABASE_URL;
const targetUrl = process.env.SUPABASE_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error('Imposta SOURCE_DATABASE_URL e SUPABASE_DATABASE_URL.');
  process.exit(1);
}

function mkPool(url) {
  return new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
}

const source = mkPool(sourceUrl);
const target = mkPool(targetUrl);

const tables = [
  { name:'casse', pk:'id' },
  { name:'bets', pk:'id' },
  { name:'settings', pk:'id' },
  { name:'matches', pk:'id' },
  { name:'subscribers', pk:'chat_id' },
  { name:'alert_settings', pk:'id' },
  { name:'team_crests', pk:'name_norm' }
];

function qid(s){ return '"' + String(s).replace(/"/g,'""') + '"'; }

async function copyTable(t) {
  const { rows } = await source.query(`SELECT * FROM ${qid(t.name)}`);
  if (!rows.length) {
    console.log(`${t.name}: 0 righe`);
    return;
  }
  const cols = Object.keys(rows[0]);
  let n = 0;
  for (const row of rows) {
    const vals = cols.map(c => row[c]);
    const placeholders = cols.map((_,i)=>`$${i+1}`).join(',');
    const updates = cols.filter(c => c !== t.pk).map(c => `${qid(c)}=EXCLUDED.${qid(c)}`).join(',');
    const sql = `INSERT INTO ${qid(t.name)} (${cols.map(qid).join(',')}) VALUES (${placeholders}) ON CONFLICT (${qid(t.pk)}) DO UPDATE SET ${updates}`;
    await target.query(sql, vals);
    n++;
  }
  console.log(`${t.name}: ${n} righe copiate`);
}

(async()=>{
  try {
    for (const t of tables) await copyTable(t);
    console.log('Migrazione completata.');
  } catch (err) {
    console.error('Migrazione fallita:', err);
    process.exitCode = 1;
  } finally {
    await source.end();
    await target.end();
  }
})();
