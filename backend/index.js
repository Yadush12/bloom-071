require('dotenv').config();
const express = require('express'), cors = require('cors'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
const pool = require('./db'); const { appendLedger, verifyLedger } = require('./ledger');
const app = express(); app.use(cors()); app.use(express.json()); global.M={req:0,err:0,ms:0}; app.use((q,s,n)=>{const t=Date.now();s.on('finish',()=>{global.M.req++;global.M.ms+=Date.now()-t;if(s.statusCode>=500)global.M.err++;});n();});
const SECRET = process.env.JWT_SECRET;
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: e.message }); });
const auth = (req, res, next) => { try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); } catch { res.status(401).json({ error: 'Login required' }); } };
const only = (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Role not allowed' });
const latestCharter = async (pid) => (await pool.query('SELECT * FROM charters WHERE project_id=$1 ORDER BY version DESC LIMIT 1', [pid])).rows[0];
async function canSeeBrief(user, project, charter) {
  if (user.role === 'admin' || project.sponsor_id === user.id) return true;
  if (!charter) return false;
  const r = await pool.query(`SELECT 1 FROM project_members m JOIN charter_acceptances a ON a.user_id=m.user_id AND a.charter_id=$2 WHERE m.project_id=$1 AND m.user_id=$3 AND m.status<>'left'`, [project.id, charter.id, user.id]);
  return r.rowCount > 0;
}
app.get('/api/health', (q, s) => s.json({ ok: true }));
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  const u = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  if (!u || !bcrypt.compareSync(password, u.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
  const user = { id: u.id, name: u.name, role: u.role };
  await appendLedger({ actor_id: u.id, action: 'LOGIN', details: { role: u.role } });
  res.json({ token: jwt.sign(user, SECRET, { expiresIn: '12h' }), user });
}));
app.get('/api/projects', auth, wrap(async (req, res) => {
  res.json((await pool.query('SELECT id,title,public_summary,status,engagement_model,budget,sponsor_id FROM projects ORDER BY id')).rows);
}));
app.post('/api/projects', auth, only('sponsor'), wrap(async (req, res) => {
  const { title, public_summary, confidential_brief, engagement_model, budget } = req.body;
  const p = (await pool.query(`INSERT INTO projects(sponsor_id,title,public_summary,confidential_brief,status,engagement_model,budget) VALUES($1,$2,$3,$4,'draft',$5,$6) RETURNING *`, [req.user.id, title, public_summary, confidential_brief, engagement_model, budget || 0])).rows[0];
  await appendLedger({ project_id: p.id, actor_id: req.user.id, action: 'PROJECT_CREATED', details: { title, engagement_model } });
  res.json(p);
}));
app.get('/api/projects/:id', auth, wrap(async (req, res) => {
  const p = (await pool.query('SELECT * FROM projects WHERE id=$1', [req.params.id])).rows[0];
  if (!p) return res.status(404).json({ error: 'Not found' });
  const charter = await latestCharter(p.id);
  const unlocked = await canSeeBrief(req.user, p, charter);
  const members = (await pool.query(`SELECT u.id,u.name,m.role,m.status, EXISTS(SELECT 1 FROM charter_acceptances a WHERE a.user_id=u.id AND a.charter_id=$2) AS accepted FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=$1 ORDER BY m.id`, [p.id, charter ? charter.id : 0])).rows;
  const { confidential_brief, ...pub } = p;
  res.json({ ...pub, brief_locked: !unlocked, confidential_brief: unlocked ? confidential_brief : null, charter, members });
}));
app.post('/api/projects/:id/members', auth, only('sponsor'), wrap(async (req, res) => {
  const { user_id, role } = req.body;
  await pool.query('INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, user_id, role]);
  await appendLedger({ project_id: +req.params.id, actor_id: req.user.id, action: 'MEMBER_INVITED', details: { user_id, role } });
  res.json({ ok: true });
}));
app.post('/api/projects/:id/charter', auth, only('sponsor'), wrap(async (req, res) => {
  const prev = await latestCharter(req.params.id); const c = { ...(prev || {}), ...req.body };
  const v = (prev ? prev.version : 0) + 1;
  const ins = (await pool.query(`INSERT INTO charters(project_id,version,engagement_model,scope,rewards,ip_rules,publication_rules,confidentiality_rules,ai_rules,credit_split,exit_rules,dispute_rules,commercialization_rules) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [req.params.id, v, c.engagement_model, c.scope, c.rewards, c.ip_rules, c.publication_rules, c.confidentiality_rules, c.ai_rules, c.credit_split, c.exit_rules, c.dispute_rules, c.commercialization_rules])).rows[0];
  if (prev) await pool.query(`UPDATE charters SET status='superseded' WHERE id=$1`, [prev.id]);
  await appendLedger({ project_id: +req.params.id, actor_id: req.user.id, action: 'CHARTER_PUBLISHED', details: { version: v, note: 'All members must re-accept' } });
  res.json(ins);
}));
app.post('/api/charters/:id/accept', auth, wrap(async (req, res) => {
  const ch = (await pool.query('SELECT * FROM charters WHERE id=$1', [req.params.id])).rows[0];
  if (!ch) return res.status(404).json({ error: 'Charter not found' });
  const m = (await pool.query(`SELECT * FROM project_members WHERE project_id=$1 AND user_id=$2 AND status<>'left'`, [ch.project_id, req.user.id])).rows[0];
  if (!m) return res.status(403).json({ error: 'You are not a member of this project' });
  await pool.query('INSERT INTO charter_acceptances(charter_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [ch.id, req.user.id]);
  await pool.query(`UPDATE project_members SET status='active' WHERE id=$1`, [m.id]);
  await appendLedger({ project_id: ch.project_id, actor_id: req.user.id, action: 'CHARTER_ACCEPTED', details: { version: 'v' + ch.version + '.0', engagement_model: ch.engagement_model } });
  await appendLedger({ project_id: ch.project_id, actor_id: req.user.id, action: 'CONFIDENTIAL_BRIEF_UNLOCKED', details: {} });
  res.json({ accepted: true, version: 'v' + ch.version + '.0' });
}));
app.get('/api/ledger/verify', wrap(async (req, res) => res.json(await verifyLedger())));
app.get('/api/ledger', auth, wrap(async (req, res) => {
  const q = req.query.project_id ? await pool.query('SELECT * FROM ledger_entries WHERE project_id=$1 ORDER BY id', [req.query.project_id]) : await pool.query('SELECT * FROM ledger_entries ORDER BY id');
  const names = Object.fromEntries((await pool.query('SELECT id,name FROM users')).rows.map((u) => [u.id, u.name]));
  res.json(q.rows.map((r) => ({ event_id: 'EVT-' + String(r.id).padStart(3, '0'), id: r.id, project_id: r.project_id, actor: names[r.actor_id] || 'System', actor_type: r.actor_type, human_owner: names[r.human_owner_id] || null, action: r.action, details: JSON.parse(r.details), ts: r.ts, hash: r.hash.slice(0, 10), prev_hash: r.prev_hash.slice(0, 10) })));
}));
app.post('/api/ledger/tamper', auth, only('admin'), wrap(async (req, res) => {
  await pool.query(`UPDATE ledger_entries SET details='{"tampered":true}' WHERE id=$1`, [req.body.id]);
  res.json({ tampered: req.body.id });
}));
require('./agents')(app, { auth, only, wrap, pool, appendLedger });
require('./workspace')(app, { auth, only, wrap, pool, appendLedger });
require('./rewards')(app, { auth, only, wrap, pool, appendLedger });
app.listen(process.env.PORT || 4000, () => console.log('API on ' + (process.env.PORT || 4000)));
