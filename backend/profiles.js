module.exports = (app, { auth, wrap, pool, appendLedger }) => {
  app.get('/api/people', auth, wrap(async (req, res) => {
    res.json((await pool.query("SELECT id,name,role,skills,verification_status FROM users WHERE role IN ('student','expert','sponsor') ORDER BY role,name")).rows);
  }));
  app.get('/api/people/:id', auth, wrap(async (req, res) => {
    const id = +req.params.id;
    const u = (await pool.query('SELECT id,name,role,skills,availability,verification_status FROM users WHERE id=$1', [id])).rows[0];
    if (!u) return res.status(404).json({ error: 'Not found' });
    const cs = (await pool.query(`SELECT c.id,c.impact_score,c.quality_score,c.reviewed_effort,c.commit_count,c.status,COALESCE(m.title,c.description) AS milestone,m.required_skills,p.title AS project FROM contributions c LEFT JOIN milestones m ON m.id=c.milestone_id LEFT JOIN projects p ON p.id=c.project_id WHERE c.user_id=$1 ORDER BY c.id`, [id])).rows;
    const acc = cs.filter((c) => c.status === 'ACCEPTED');
    const avg = (k) => acc.length ? +(acc.reduce((s, c) => s + Number(c[k] || 0), 0) / acc.length).toFixed(1) : 0;
    const expertise = (u.skills || []).map((s) => ({ skill: s, evidence: acc.filter((c) => (c.required_skills || []).some((r) => r.toLowerCase() === s.toLowerCase())).length }));
    const creds = (await pool.query('SELECT cr.credential_type,cr.issued_at,p.title AS project FROM credentials cr JOIN projects p ON p.id=cr.project_id WHERE cr.user_id=$1', [id])).rows;
    const projs = (await pool.query("SELECT p.title,pm.role,pm.status FROM project_members pm JOIN projects p ON p.id=pm.project_id WHERE pm.user_id=$1 AND pm.status<>'invited'", [id])).rows;
    const posted = u.role === 'sponsor' ? (await pool.query('SELECT title,engagement_model,status FROM projects WHERE sponsor_id=$1', [id])).rows : [];
    const ev = (await pool.query('SELECT count(*)::int AS n FROM ledger_entries WHERE actor_id=$1', [id])).rows[0].n;
    const out = { ...u, stats: { accepted: acc.length, impact: avg('impact_score'), quality: avg('quality_score'), effort: avg('reviewed_effort'), commits: cs.reduce((s, c) => s + (c.commit_count || 0), 0), ledger_events: ev }, expertise, series: acc.map((c) => ({ label: c.milestone, impact: Number(c.impact_score || 0), commits: c.commit_count || 0 })), credentials: creds, projects: projs, posted };
    if (req.user.id === id || req.user.role === 'admin') out.earned = +(await pool.query('SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE user_id=$1', [id])).rows[0].t;
    if (req.user.role === 'sponsor') out.my_projects = (await pool.query('SELECT id,title FROM projects WHERE sponsor_id=$1', [req.user.id])).rows;
    res.json(out);
  }));
  app.post('/api/people/:id/request', auth, wrap(async (req, res) => {
    if (req.user.role !== 'sponsor') return res.status(403).json({ error: 'Only sponsors can send project requests' });
    const t = (await pool.query("SELECT id,role,verification_status FROM users WHERE id=$1 AND role IN ('student','expert')", [+req.params.id])).rows[0];
    if (!t) return res.status(404).json({ error: 'Person not found' });
    if (t.verification_status !== 'verified') return res.status(400).json({ error: 'Only verified people can be invited' });
    if (!(await pool.query('SELECT 1 FROM projects WHERE id=$1 AND sponsor_id=$2', [req.body.project_id, req.user.id])).rowCount) return res.status(403).json({ error: 'Not your project' });
    await pool.query('INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [req.body.project_id, t.id, t.role]);
    await appendLedger({ project_id: +req.body.project_id, actor_id: req.user.id, action: 'MEMBER_INVITED', details: { user_id: t.id, role: t.role, via: 'profile' } });
    res.json({ ok: true });
  }));
};
