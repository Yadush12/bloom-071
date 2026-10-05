const crypto = require('crypto');
const pool = require('./db');
const payload = (r) => JSON.stringify([r.project_id ?? null, r.actor_id ?? null, r.actor_type, r.human_owner_id ?? null, r.action, r.details, r.ts]);
const sha = (prev, r) => crypto.createHash('sha256').update(prev + payload(r)).digest('hex');
async function appendLedger({ project_id = null, actor_id = null, actor_type = 'HUMAN', human_owner_id = null, action, details = {} }) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(42)');
    const last = await c.query('SELECT hash FROM ledger_entries ORDER BY id DESC LIMIT 1');
    const prev = last.rows[0]?.hash || 'GENESIS';
    const r = { project_id, actor_id, actor_type, human_owner_id, action, details: JSON.stringify(details), ts: new Date().toISOString() };
    const hash = sha(prev, r);
    const ins = await c.query(
      'INSERT INTO ledger_entries(project_id,actor_id,actor_type,human_owner_id,action,details,ts,prev_hash,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [r.project_id, r.actor_id, r.actor_type, r.human_owner_id, r.action, r.details, r.ts, prev, hash]);
    await c.query('COMMIT');
    return ins.rows[0];
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
async function verifyLedger() {
  const { rows } = await pool.query('SELECT * FROM ledger_entries ORDER BY id');
  let prev = 'GENESIS';
  for (const r of rows) {
    if (r.prev_hash !== prev || sha(prev, r) !== r.hash) return { valid: false, broken_at: r.id, checked: rows.length };
    prev = r.hash;
  }
  return { valid: true, checked: rows.length };
}
module.exports = { appendLedger, verifyLedger };
