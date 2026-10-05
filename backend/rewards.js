const { verifyLedger } = require('./ledger');
const DEF = { platform_fee: 0.10, ai_reserve: 0.05, expert_share: 0.30, equal_part: 0.40 };
const inr = (n) => '₹' + Number(n).toLocaleString('en-IN');
const avg = (a) => (a.length ? Math.round((10 * a.reduce((x, y) => x + y, 0)) / a.length) / 10 : 0);
function split(A, cfg, weights, nExperts) {
  const fee = Math.round(A * cfg.platform_fee), ai = Math.round(A * cfg.ai_reserve), net = A - fee - ai;
  const expertTotal = nExperts ? Math.round(net * cfg.expert_share) : 0;
  const pool = net - expertTotal, n = weights.length, tw = weights.reduce((a, b) => a + b, 0);
  const equalPer = n ? (pool * cfg.equal_part) / n : 0, wPool = pool * (1 - cfg.equal_part);
  const shares = weights.map((w) => Math.floor(equalPer + (tw ? (wPool * w) / tw : wPool / n) + 1e-9));
  if (n) shares[n - 1] += pool - shares.reduce((a, b) => a + b, 0);
  const expertShares = [];
  if (nExperts) { const e = Math.floor(expertTotal / nExperts); for (let i = 0; i < nExperts; i++) expertShares.push(e); expertShares[0] += expertTotal - e * nExperts; }
  return { fee, ai, net, expertTotal, pool, equalPer, wPool, shares, expertShares };
}
module.exports = (app, { auth, only, wrap, pool, appendLedger }) => {
  const getM = async (id) => (await pool.query('SELECT m.*,p.sponsor_id,p.engagement_model,p.budget,p.title AS project_title FROM milestones m JOIN projects p ON p.id=m.project_id WHERE m.id=$1', [id])).rows[0];
  async function compute(m, body = {}) {
    const cfg = { ...DEF, ...(body.config || {}) };
    const experts = (await pool.query(`SELECT u.id,u.name FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND pm.role='expert' AND pm.status='active' ORDER BY u.id`, [m.project_id])).rows;
    const rows = (await pool.query(`SELECT c.user_id,u.name,c.impact_score,c.quality_score,c.reviewed_effort,c.commit_count FROM contributions c JOIN users u ON u.id=c.user_id WHERE c.milestone_id=$1 AND c.status='ACCEPTED' AND u.role='student'`, [m.id])).rows;
    const by = {};
    for (const r of rows) {
      const s = (by[r.user_id] = by[r.user_id] || { id: r.user_id, name: r.name, score: 0, commits: 0, imp: [], q: [], e: [] });
      const imp = +r.impact_score || 0, q = +r.quality_score || 0, e = +r.reviewed_effort || 0;
      s.score += m.outcome === 'NEGATIVE_RESULT' ? e : 0.5 * imp + 0.3 * q + 0.2 * e;
      s.commits += r.commit_count || 0; s.imp.push(imp); s.q.push(q); s.e.push(e);
    }
    const studs = Object.values(by);
    if (!studs.length) return null;
    const sp = split(m.amount, cfg, studs.map((s) => s.score), experts.length);
    const tw = studs.reduce((a, s) => a + s.score, 0);
    return {
      milestone: m.title, amount: m.amount, outcome: m.outcome || 'POSITIVE', config: cfg,
      platform_fee: sp.fee, ai_compute_reserve: sp.ai, expert_total: sp.expertTotal, student_pool: sp.pool,
      rule: 'Role allocation first, then reviewed impact, quality and effort. Commit count is never used.',
      experts: experts.map((e, i) => ({ id: e.id, name: e.name, role: 'expert', amount: sp.expertShares[i], why: `Agreed expert role: ${Math.round(cfg.expert_share * 100)}% of the net ${inr(sp.net)} after platform fee and AI reserve.` })),
      students: studs.map((s, i) => {
        const pct = tw ? Math.round((100 * s.score) / tw) : Math.round(100 / studs.length);
        const eq = Math.round(sp.equalPer);
        return { id: s.id, name: s.name, role: 'student', commits: s.commits, weight_pct: pct, amount: sp.shares[i],
          why: `${pct}% weight from reviewed ${m.outcome === 'NEGATIVE_RESULT' ? 'documented effort' : `impact ${avg(s.imp)}, quality ${avg(s.q)}, effort ${avg(s.e)}`}. ${s.commits} commits are shown for transparency but NOT used. Share = ${inr(eq)} equal part + ${inr(sp.shares[i] - eq)} weighted part.` };
      })
    };
  }
async function doAccept(m, req, res, by) {
    if (m.status !== 'FUNDED') return res.status(400).json({ error: `Milestone is ${m.status}; it must be FUNDED (escrow) before acceptance` });
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM contributions WHERE milestone_id=$1 AND status='ACCEPTED'`, [m.id])).rows[0].n;
    if (!n) return res.status(400).json({ error: 'No expert-accepted contribution on this milestone yet' });
    const outcome = req.body.outcome === 'negative_result' ? 'NEGATIVE_RESULT' : 'POSITIVE';
    await pool.query(`UPDATE milestones SET status='ACCEPTED', outcome=$1 WHERE id=$2`, [outcome, m.id]);
    await appendLedger({ project_id: m.project_id, actor_id: req.user.id, action: 'MILESTONE_ACCEPTED', details: { milestone: m.title, outcome, accepted_by: by, note: outcome === 'NEGATIVE_RESULT' ? 'Documented negative result accepted; reward uses reviewed effort' : undefined } });
    res.json({ milestone: m.title, status: 'ACCEPTED', outcome, accepted_by: by });
  }
  app.post('/api/milestones/:id/fund', auth, only('sponsor'), wrap(async (req, res) => {
    const m = await getM(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.sponsor_id !== req.user.id) return res.status(403).json({ error: 'Not your project' });
    if (m.engagement_model !== 'funded' || !m.amount) return res.status(400).json({ error: 'This is a non-monetary project: no payment can be promised or funded' });
    if (m.status !== 'PLANNED') return res.status(400).json({ error: `Milestone is already ${m.status}` });
    const days = +req.body.window_days || 7;
    await pool.query('INSERT INTO escrows(project_id,milestone_id,amount,status) VALUES($1,$2,$3,$4)', [m.project_id, m.id, m.amount, 'FUNDED']);
    await pool.query(`UPDATE milestones SET status='FUNDED', accept_by=now()+($1||' days')::interval WHERE id=$2`, [String(days), m.id]);
    await appendLedger({ project_id: m.project_id, actor_id: req.user.id, action: 'ESCROW_FUNDED', details: { milestone: m.title, amount: inr(m.amount), status: 'FUNDED → ESCROW', acceptance_window_days: days } });
    res.json({ milestone: m.title, amount: m.amount, status: 'FUNDED → ESCROW', acceptance_window_days: days });
  }));
  app.post('/api/milestones/:id/accept', auth, only('sponsor'), wrap(async (req, res) => {
    const m = await getM(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.sponsor_id !== req.user.id) return res.status(403).json({ error: 'Not your project' });
    await doAccept(m, req, res, 'sponsor');
  }));
  app.post('/api/milestones/:id/auto-accept', auth, only('admin'), wrap(async (req, res) => {
    const m = await getM(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (!req.body.simulate_window_elapsed && !(m.accept_by && new Date() > new Date(m.accept_by))) return res.status(400).json({ error: 'Acceptance window still open until ' + m.accept_by });
    await doAccept(m, req, res, 'auto-accept: sponsor silent past the acceptance window');
  }));
  app.post('/api/milestones/:id/calculate-reward', auth, only('sponsor', 'expert', 'admin'), wrap(async (req, res) => {
    const m = await getM(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (m.status !== 'ACCEPTED') return res.status(400).json({ error: `Milestone must be ACCEPTED (now ${m.status})` });
    const r = await compute(m, req.body);
    if (!r) return res.status(400).json({ error: 'No accepted student contributions to reward' });
    await appendLedger({ project_id: m.project_id, actor_id: req.user.id, action: 'REWARD_CALCULATED', details: { milestone: m.title, config: r.config, split: [...r.experts, ...r.students].map((x) => x.name + ': ' + inr(x.amount)) } });
    res.json(r);
  }));
  app.post('/api/milestones/:id/release-escrow', auth, only('sponsor', 'admin'), wrap(async (req, res) => {
    const m = await getM(req.params.id);
    if (!m) return res.status(404).json({ error: 'Milestone not found' });
    if (req.user.role === 'sponsor' && m.sponsor_id !== req.user.id) return res.status(403).json({ error: 'Not your project' });
    if (m.status !== 'ACCEPTED') return res.status(400).json({ error: `Milestone must be ACCEPTED first (now ${m.status})` });
    const esc = (await pool.query(`SELECT * FROM escrows WHERE milestone_id=$1 AND status='FUNDED'`, [m.id])).rows[0];
    if (!esc) return res.status(400).json({ error: 'No funded escrow for this milestone' });
    const r = await compute(m, req.body);
    if (!r) return res.status(400).json({ error: 'No accepted student contributions to reward' });
    const pay = (uid, amt, why) => pool.query('INSERT INTO payouts(escrow_id,user_id,amount,reason) VALUES($1,$2,$3,$4)', [esc.id, uid, amt, why]);
    await pay(null, r.platform_fee, `Platform fee (${Math.round(r.config.platform_fee * 100)}%)`);
    await pay(null, r.ai_compute_reserve, `AI compute reserve (${Math.round(r.config.ai_reserve * 100)}%), charged visibly: AI does not earn`);
    for (const x of [...r.experts, ...r.students]) await pay(x.id, x.amount, x.why);
    await pool.query(`UPDATE escrows SET status='RELEASED', released_at=now() WHERE id=$1`, [esc.id]);
    await pool.query(`UPDATE milestones SET status='RELEASED' WHERE id=$1`, [m.id]);
    await appendLedger({ project_id: m.project_id, actor_id: req.user.id, action: 'ESCROW_RELEASED', details: { milestone: m.title, amount: inr(m.amount), status: 'ESCROW → RELEASED', paid: [...r.experts, ...r.students].map((x) => x.name + ': ' + inr(x.amount)) } });
    res.json({ status: 'ESCROW → RELEASED', ...r });
  }));
  app.get('/api/projects/:id/payouts', auth, wrap(async (req, res) => {
    res.json((await pool.query(`SELECT po.*,u.name,m.title AS milestone FROM payouts po JOIN escrows e ON e.id=po.escrow_id JOIN milestones m ON m.id=e.milestone_id LEFT JOIN users u ON u.id=po.user_id WHERE e.project_id=$1 ORDER BY po.id`, [req.params.id])).rows);
  }));
  app.post('/api/projects/:id/issue-credentials', auth, only('sponsor', 'admin'), wrap(async (req, res) => {
    const p = (await pool.query('SELECT * FROM projects WHERE id=$1', [req.params.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'Not found' });
    if (req.user.role === 'sponsor' && p.sponsor_id !== req.user.id) return res.status(403).json({ error: 'Not your project' });
    if (p.engagement_model === 'funded' && p.budget > 0) return res.status(400).json({ error: 'Funded project: rewards are paid from escrow' });
    const students = (await pool.query(`SELECT DISTINCT u.id,u.name FROM contributions c JOIN users u ON u.id=c.user_id WHERE c.project_id=$1 AND c.status='ACCEPTED' AND u.role='student'`, [p.id])).rows;
    const experts = (await pool.query(`SELECT u.id,u.name FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=$1 AND pm.role='expert' AND pm.status='active'`, [p.id])).rows;
    const todo = [...students.map((s) => ({ ...s, types: ['Research Credit', 'Certificate of Contribution', 'Co-authorship'] })), ...experts.map((e) => ({ ...e, types: ['Mentorship Credit', 'Recommendation Letter'] }))];
    const issued = [];
    for (const t of todo) {
      for (const type of t.types) if (!(await pool.query('SELECT 1 FROM credentials WHERE project_id=$1 AND user_id=$2 AND credential_type=$3', [p.id, t.id, type])).rowCount) await pool.query('INSERT INTO credentials(project_id,user_id,credential_type) VALUES($1,$2,$3)', [p.id, t.id, type]);
      await appendLedger({ project_id: p.id, actor_id: req.user.id, action: 'CREDENTIAL_ISSUED', details: { to: t.name, credentials: t.types, payment: 'none (₹0 engagement model)' } });
      issued.push({ name: t.name, credentials: t.types });
    }
    res.json({ project: p.title, payment: '₹0: no payment on this engagement model', issued });
  }));
  app.get('/api/projects/:id/credentials', auth, wrap(async (req, res) => {
    res.json((await pool.query('SELECT c.*,u.name FROM credentials c JOIN users u ON u.id=c.user_id WHERE c.project_id=$1 ORDER BY c.id', [req.params.id])).rows);
  }));
  app.post('/api/projects/:id/leave', auth, wrap(async (req, res) => {
    const mm = (await pool.query(`SELECT * FROM project_members WHERE project_id=$1 AND user_id=$2 AND status<>'left'`, [req.params.id, req.user.id])).rows[0];
    if (!mm) return res.status(404).json({ error: 'Not an active member' });
    const n = (await pool.query(`SELECT COUNT(*)::int AS n FROM contributions WHERE project_id=$1 AND user_id=$2 AND status='ACCEPTED'`, [req.params.id, req.user.id])).rows[0].n;
    await pool.query(`UPDATE project_members SET status='left' WHERE id=$1`, [mm.id]);
    await appendLedger({ project_id: +req.params.id, actor_id: req.user.id, action: 'MEMBER_LEFT', details: { credit_kept: true, accepted_contributions: n, payout: 'pro-rata share for accepted work is preserved', access: 'revoked', open_work: 'returned for reassignment' } });
    res.json({ left: true, credit_kept: true, accepted_contributions: n, access: 'revoked' });
  }));
  app.post('/api/projects/:id/disputes', auth, wrap(async (req, res) => {
    const d = (await pool.query('INSERT INTO disputes(project_id,raised_by,reason,evidence) VALUES($1,$2,$3,$4) RETURNING *', [req.params.id, req.user.id, req.body.reason, req.body.evidence || 'See project ledger'])).rows[0];
    await appendLedger({ project_id: +req.params.id, actor_id: req.user.id, action: 'DISPUTE_RAISED', details: { dispute: d.id, reason: req.body.reason } });
    res.json(d);
  }));
  app.post('/api/disputes/:id/resolve', auth, only('admin'), wrap(async (req, res) => {
    const d = (await pool.query(`UPDATE disputes SET status='RESOLVED', resolution=$1 WHERE id=$2 RETURNING *`, [req.body.resolution, req.params.id])).rows[0];
    if (!d) return res.status(404).json({ error: 'Not found' });
    await appendLedger({ project_id: d.project_id, actor_id: req.user.id, action: 'DISPUTE_RESOLVED', details: { dispute: d.id, resolution: req.body.resolution } });
    res.json(d);
  }));
  app.get('/api/admin/metrics', auth, only('admin'), wrap(async (req, res) => {
    const one = async (s) => (await pool.query(s)).rows[0].n;
    const g = global.M || { req: 0, ms: 0, err: 0 };
    const esc = {}; (await pool.query('SELECT status, COALESCE(SUM(amount),0)::int AS total FROM escrows GROUP BY status')).rows.forEach((r) => (esc[r.status] = r.total));
    const v = await verifyLedger();
    res.json({
      active_projects: await one(`SELECT COUNT(*)::int AS n FROM projects WHERE status='open'`), users: await one('SELECT COUNT(*)::int AS n FROM users'),
      ai_requests: await one(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE action='AI_ACTION'`), integrity_alerts: await one(`SELECT COUNT(*)::int AS n FROM ledger_entries WHERE action='INTEGRITY_FLAG'`),
      pending_reviews: await one(`SELECT COUNT(*)::int AS n FROM contributions WHERE status IN ('SUBMITTED','FLAGGED')`), escrow: esc,
      ledger_entries: v.checked, ledger_valid: v.valid, requests: g.req, avg_latency_ms: g.req ? Math.round(g.ms / g.req) : 0, error_rate_pct: g.req ? Math.round((1000 * g.err) / g.req) / 10 : 0,
      recent_events: (await pool.query('SELECT action,ts FROM ledger_entries ORDER BY id DESC LIMIT 8')).rows
    });
  }));
};
module.exports.split = split;
