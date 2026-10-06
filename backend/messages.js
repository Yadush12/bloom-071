module.exports = (app, { auth, wrap, pool }) => {
  pool.query('CREATE TABLE IF NOT EXISTS messages(id SERIAL PRIMARY KEY, project_id INT, sender_id INT, recipient_id INT, body TEXT, contribution_id INT, created_at TIMESTAMPTZ DEFAULT now())').catch((e) => console.error(e));
  const can = async (u, pid) => u.role === 'admin' || (await pool.query("SELECT 1 FROM projects WHERE id=$1 AND sponsor_id=$2 UNION SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND status<>'left'", [pid, u.id])).rowCount > 0;
  app.get('/api/projects/:id/people', auth, wrap(async (req, res) => {
    if (!(await can(req.user, +req.params.id))) return res.status(403).json({ error: 'Not a project member' });
    res.json((await pool.query("SELECT u.id,u.name,u.role FROM users u WHERE u.id<>$2 AND (u.id IN (SELECT sponsor_id FROM projects WHERE id=$1) OR u.id IN (SELECT user_id FROM project_members WHERE project_id=$1 AND status<>'left')) ORDER BY u.role,u.name", [+req.params.id, req.user.id])).rows);
  }));
  app.get('/api/projects/:id/messages', auth, wrap(async (req, res) => {
    if (!(await can(req.user, +req.params.id))) return res.status(403).json({ error: 'Not a project member' });
    res.json((await pool.query("SELECT m.id,m.body,m.created_at,m.sender_id,m.recipient_id,s.name AS sender_name,r.name AS recipient_name FROM messages m JOIN users s ON s.id=m.sender_id LEFT JOIN users r ON r.id=m.recipient_id WHERE m.project_id=$1 AND ($2::text='admin' OR m.recipient_id IS NULL OR m.sender_id=$3 OR m.recipient_id=$3) ORDER BY m.id", [+req.params.id, req.user.role, req.user.id])).rows);
  }));
  app.post('/api/projects/:id/messages', auth, wrap(async (req, res) => {
    const pid = +req.params.id;
    if (!(await can(req.user, pid))) return res.status(403).json({ error: 'Not a project member' });
    const body = String(req.body.body || '').trim().slice(0, 2000);
    if (!body) return res.status(400).json({ error: 'Write a message first' });
    const rid = req.body.recipient_id ? +req.body.recipient_id : null;
    if (rid && !(await can({ id: rid, role: 'x' }, pid))) return res.status(400).json({ error: 'Recipient is not on this project' });
    const r = await pool.query('INSERT INTO messages(project_id,sender_id,recipient_id,body,contribution_id) VALUES($1,$2,$3,$4,$5) RETURNING *', [pid, req.user.id, rid, body, req.body.contribution_id || null]);
    res.json(r.rows[0]);
  }));
  app.get('/api/my-feedback', auth, wrap(async (req, res) => {
    res.json((await pool.query("SELECT r.id,r.decision,r.comments,r.quality,r.impact,r.created_at,r.reviewer_id,u.name AS reviewer,c.id AS contribution_id,c.project_id,COALESCE(m.title,c.description) AS milestone FROM reviews r JOIN contributions c ON c.id=r.contribution_id JOIN users u ON u.id=r.reviewer_id LEFT JOIN milestones m ON m.id=c.milestone_id WHERE c.user_id=$1 ORDER BY r.id DESC", [req.user.id])).rows);
  }));
};
