const crypto = require('crypto');
const LEVELS = ['edit', 'read', 'deny'];
const LANGS = ['python', 'javascript', 'markdown', 'plaintext'];
module.exports = (app, { auth, wrap, pool, appendLedger }) => {
  const q = async (sql, p = []) => (await pool.query(sql, p)).rows;
  const EXT = { python: '.py', javascript: '.js', markdown: '.md', plaintext: '.txt' };
  // one-time move: files that were created inside Code Lab now live in the Files tab (project_files)
  const migrate = async () => {
    const rows = (await pool.query("SELECT * FROM lab_files WHERE status='ACTIVE'")).rows;
    for (const f of rows) {
      const p = /\.[A-Za-z0-9]+$/.test(f.name) ? f.name : f.name + (EXT[f.language] || '.txt');
      const ins = (await pool.query('INSERT INTO project_files(project_id,path,content,created_by) VALUES($1,$2,$3,$4) ON CONFLICT (project_id,path) DO NOTHING RETURNING id', [f.project_id, p, f.content || '', f.created_by])).rows[0];
      if (!ins) continue;
      for (const a of (await pool.query('SELECT user_id,level FROM lab_access WHERE file_id=$1', [f.id])).rows) if (a.level === 'edit' || a.level === 'read') await pool.query('INSERT INTO file_access(file_id,user_id,level,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT (file_id,user_id) DO UPDATE SET level=EXCLUDED.level', [ins.id, a.user_id, a.level === 'edit' ? 'write' : 'read', f.created_by]);
      await pool.query("UPDATE lab_files SET status='MIGRATED', target_path=$1 WHERE id=$2", [p, f.id]);
    }
  };
  const ready = (async () => {
    await pool.query("CREATE TABLE IF NOT EXISTS lab_files(id SERIAL PRIMARY KEY, project_id INT, project_created_at TIMESTAMPTZ, name TEXT, language TEXT DEFAULT 'python', purpose TEXT, content TEXT DEFAULT '', content_hash TEXT, version INT DEFAULT 0, status TEXT DEFAULT 'PENDING', created_by INT, decided_by INT, decided_at TIMESTAMPTZ, reject_reason TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), updated_by INT)");
    await pool.query('CREATE TABLE IF NOT EXISTS lab_access(id SERIAL PRIMARY KEY, file_id INT, user_id INT, level TEXT, granted_by INT, updated_at TIMESTAMPTZ DEFAULT now(), UNIQUE(file_id,user_id))');
    await pool.query('ALTER TABLE lab_files ADD COLUMN IF NOT EXISTS target_path TEXT');
    try { await migrate(); } catch (e) { console.error('lab migrate', e.message); }
  })().catch((e) => console.error('lab tables', e));
  const clean = async () => {
    await ready;
    await pool.query('DELETE FROM lab_files f WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=f.project_id AND p.created_at=f.project_created_at)');
    await pool.query('DELETE FROM lab_access a WHERE NOT EXISTS (SELECT 1 FROM lab_files f WHERE f.id=a.file_id)');
  };
  const isMember = async (uid, pid) => (await q("SELECT 1 FROM projects WHERE id=$1 AND sponsor_id=$2 UNION SELECT 1 FROM project_members WHERE project_id=$1 AND user_id=$2 AND status<>'left'", [pid, uid])).length > 0;
  const people = (pid) => q("SELECT u.id,u.name,u.role FROM users u WHERE u.id IN (SELECT sponsor_id FROM projects WHERE id=$1) OR u.id IN (SELECT user_id FROM project_members WHERE project_id=$1 AND status<>'left') ORDER BY u.role,u.name", [pid]);
  const note = async (pid, from, to, body) => { try { await pool.query('INSERT INTO messages(project_id,sender_id,recipient_id,body) VALUES($1,$2,$3,$4)', [pid, from, to, body]); } catch (e) { console.error('lab note', e.message); } };
  const levelFor = async (user, f) => {
    if (user.role === 'admin') return 'admin';
    if (!(await isMember(user.id, f.project_id))) return 'none';
    const r = (await q('SELECT level FROM lab_access WHERE file_id=$1 AND user_id=$2', [f.id, user.id]))[0];
    return r ? r.level : 'none';
  };
  const adminOnly = (req, res) => { if (req.user.role !== 'admin') { res.status(403).json({ error: 'Admin only' }); return false; } return true; };
  const activeFile = async (id) => (await q("SELECT * FROM lab_files WHERE id=$1 AND status='ACTIVE'", [id]))[0];

  app.get('/api/lab/files', auth, wrap(async (req, res) => {
    await clean();
    const pid = +req.query.project_id;
    if (!pid) return res.json({ files: [], requests: [] });
    if (req.user.role !== 'admin' && !(await isMember(req.user.id, pid))) return res.status(403).json({ error: 'Not a project member' });
    const acc = Object.fromEntries((await q('SELECT a.file_id,a.level FROM lab_access a JOIN lab_files f ON f.id=a.file_id WHERE a.user_id=$1 AND f.project_id=$2', [req.user.id, pid])).map((r) => [r.file_id, r.level]));
    const rows = await q('SELECT f.id,f.name,f.language,f.purpose,f.version,f.status,f.reject_reason,f.created_by,f.created_at,f.updated_at,u.name AS creator FROM lab_files f JOIN users u ON u.id=f.created_by WHERE f.project_id=$1 ORDER BY f.name', [pid]);
    res.json({
      files: rows.filter((r) => r.status === 'ACTIVE').map((r) => ({ ...r, level: req.user.role === 'admin' ? 'admin' : (acc[r.id] || 'none') })),
      requests: rows.filter((r) => r.status !== 'ACTIVE' && r.created_by === req.user.id)
    });
  }));

  app.get('/api/lab/files/:id', auth, wrap(async (req, res) => {
    const f = await activeFile(+req.params.id);
    if (!f) return res.status(404).json({ error: 'File not found' });
    const lv = await levelFor(req.user, f);
    if (lv === 'none' || lv === 'deny') {
      await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_ACCESS_DENIED', details: { file: f.name, attempted: 'open', level: lv } });
      return res.status(403).json({ error: 'You do not have access to this file. The attempt was logged.' });
    }
    res.json({ id: f.id, name: f.name, language: f.language, content: f.content, version: f.version, content_hash: f.content_hash, level: lv });
  }));

  app.put('/api/lab/files/:id/content', auth, wrap(async (req, res) => {
    const f = await activeFile(+req.params.id);
    if (!f) return res.status(404).json({ error: 'File not found' });
    const lv = await levelFor(req.user, f);
    if (lv !== 'edit') {
      await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_ACCESS_DENIED', details: { file: f.name, attempted: 'edit', level: lv } });
      return res.status(403).json({ error: 'You only have read access to this file. The attempt was logged.' });
    }
    const content = String(req.body.content == null ? '' : req.body.content);
    if (content.length > 200000) return res.status(400).json({ error: 'File too large (200 KB max)' });
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    const r = (await q('UPDATE lab_files SET content=$1,content_hash=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$4 RETURNING version', [content, hash, req.user.id, f.id]))[0];
    await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_FILE_EDITED', details: { file: f.name, version: r.version, sha256: hash.slice(0, 16) } });
    res.json({ ok: true, version: r.version });
  }));

  app.post('/api/lab/requests', auth, wrap(async (req, res) => {
    if (!['student', 'expert'].includes(req.user.role)) return res.status(403).json({ error: 'Only students and experts can request files' });
    const pid = +req.body.project_id;
    if (!pid || !(await isMember(req.user.id, pid))) return res.status(403).json({ error: 'Not a project member' });
    const EXTS = { '.py': 'python', '.js': 'javascript', '.md': 'markdown', '.txt': 'plaintext', '.json': 'plaintext' };
    const dir = String(req.body.directory || '').trim().replace(/^\/+|\/+$/g, '');
    const ext = String(req.body.ext || '.py').toLowerCase();
    const base = String(req.body.name || '').trim().replace(/\.[A-Za-z0-9]+$/, '');
    if (!(ext in EXTS)) return res.status(400).json({ error: 'Pick a file type: .py .js .md .txt .json' });
    if (!/^[A-Za-z0-9_\-]{1,60}$/.test(base)) return res.status(400).json({ error: 'File name: letters, numbers, _ and - only (no spaces)' });
    if (dir && (!/^[A-Za-z0-9._\-]+(\/[A-Za-z0-9._\-]+)*$/.test(dir) || dir.includes('..'))) return res.status(400).json({ error: 'Folder name: letters, numbers, . _ - and / only' });
    req.body.name = (dir ? dir + '/' : '') + base + ext; req.body.language = EXTS[ext];
    const name = String(req.body.name || '').trim();
    if (!/^[A-Za-z0-9._\-\/ ]{1,80}$/.test(name) || name.includes('..') || name.startsWith('/')) return res.status(400).json({ error: 'Use a simple file name (letters, numbers, . _ - / and spaces, max 80)' });
    const language = LANGS.includes(req.body.language) ? req.body.language : 'plaintext';
    const purpose = String(req.body.purpose || '').trim().slice(0, 500);
    if (!purpose) return res.status(400).json({ error: 'Say what the file is for' });
    await clean();
    if ((await q("SELECT 1 FROM lab_files WHERE project_id=$1 AND lower(name)=lower($2) AND status IN ('PENDING','ACTIVE')", [pid, name])).length) return res.status(400).json({ error: 'A file or request with this name already exists' });
    if ((await q("SELECT 1 FROM lab_files WHERE project_id=$1 AND created_by=$2 AND status='PENDING'", [pid, req.user.id])).length >= 10) return res.status(429).json({ error: 'Too many pending requests' });
    const r = (await q("INSERT INTO lab_files(project_id,project_created_at,name,language,purpose,created_by) VALUES($1,(SELECT created_at FROM projects WHERE id=$1),$2,$3,$4,$5) RETURNING id", [pid, name, language, purpose, req.user.id]))[0];
    await appendLedger({ project_id: pid, actor_id: req.user.id, action: 'LAB_FILE_REQUESTED', details: { file: name, language, purpose } });
    for (const a of await q("SELECT id FROM users WHERE role='admin'")) await note(pid, req.user.id, a.id, 'File request: "' + name + '" (' + language + '). Purpose: ' + purpose + '. Waiting for your approval in the Code Lab tab.');
    res.json({ ok: true, id: r.id });
  }));

  app.get('/api/lab/requests', auth, wrap(async (req, res) => {
    if (!adminOnly(req, res)) return;
    await clean();
    const rows = await q("SELECT f.id,f.project_id,f.name,f.language,f.purpose,f.created_at,p.title AS project,u.name AS requester,u.role AS requester_role FROM lab_files f JOIN projects p ON p.id=f.project_id JOIN users u ON u.id=f.created_by WHERE f.status='PENDING' ORDER BY f.id");
    for (const r of rows) r.people = await people(r.project_id);
    res.json(rows);
  }));

  app.post('/api/lab/requests/:id/approve', auth, wrap(async (req, res) => {
    if (!adminOnly(req, res)) return;
    const f = (await q("SELECT * FROM lab_files WHERE id=$1 AND status='PENDING'", [+req.params.id]))[0];
    if (!f) return res.status(404).json({ error: 'Request not found or already decided' });
    const ppl = await people(f.project_id);
    const access = req.body.access || {};
    const missing = ppl.filter((p) => !LEVELS.includes(access[p.id]));
    if (missing.length) return res.status(400).json({ error: 'Choose Edit, Read or No access for: ' + missing.map((m) => m.name).join(', ') });
    if ((await pool.query('SELECT 1 FROM project_files WHERE project_id=$1 AND path=$2', [f.project_id, f.name])).rowCount) return res.status(400).json({ error: 'A file with this path already exists in Files: ' + f.name });
    const nf = (await pool.query('INSERT INTO project_files(project_id,path,content,created_by) VALUES($1,$2,$3,$4) RETURNING id', [f.project_id, f.name, f.content || '', f.created_by])).rows[0];
    for (const p of ppl) await pool.query('INSERT INTO file_access(file_id,user_id,level,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT (file_id,user_id) DO UPDATE SET level=EXCLUDED.level', [nf.id, p.id, access[p.id] === 'edit' ? 'write' : access[p.id] === 'read' ? 'read' : 'deny', req.user.id]);
    await pool.query("UPDATE lab_files SET status='APPROVED',target_path=$1,decided_by=$2,decided_at=now() WHERE id=$3", [f.name, req.user.id, f.id]);
    await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'FILE_CREATED', details: { file: f.name, via: 'Code Lab request approved' } });
    for (const p of ppl) await pool.query('INSERT INTO lab_access(file_id,user_id,level,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT (file_id,user_id) DO UPDATE SET level=$3,granted_by=$4,updated_at=now()', [f.id, p.id, access[p.id], req.user.id]);
    await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_FILE_APPROVED', details: { file: f.name, requested_by: f.created_by, access: ppl.map((p) => p.name + ': ' + access[p.id]).join(', ') } });
    await note(f.project_id, req.user.id, f.created_by, 'Your file request "' + f.name + '" was APPROVED. Your access: ' + (access[f.created_by] || 'not set') + '. Open it in the Files tab.');
    res.json({ ok: true });
  }));
app.post('/api/lab/requests/:id/reject', auth, wrap(async (req, res) => {
    if (!adminOnly(req, res)) return;
    const f = (await q("SELECT * FROM lab_files WHERE id=$1 AND status='PENDING'", [+req.params.id]))[0];
    if (!f) return res.status(404).json({ error: 'Request not found or already decided' });
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ error: 'Give a reason for rejecting' });
    await pool.query("UPDATE lab_files SET status='REJECTED',reject_reason=$1,decided_by=$2,decided_at=now() WHERE id=$3", [reason, req.user.id, f.id]);
    await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_FILE_REJECTED', details: { file: f.name, reason } });
    await note(f.project_id, req.user.id, f.created_by, 'Your file request "' + f.name + '" was REJECTED. Reason: ' + reason);
    res.json({ ok: true });
  }));

  app.get('/api/lab/files/:id/access', auth, wrap(async (req, res) => {
    if (!adminOnly(req, res)) return;
    const f = await activeFile(+req.params.id);
    if (!f) return res.status(404).json({ error: 'File not found' });
    const m = Object.fromEntries((await q('SELECT user_id,level FROM lab_access WHERE file_id=$1', [f.id])).map((r) => [r.user_id, r.level]));
    res.json((await people(f.project_id)).map((p) => ({ ...p, level: m[p.id] || 'none' })));
  }));

  app.put('/api/lab/files/:id/access', auth, wrap(async (req, res) => {
    if (!adminOnly(req, res)) return;
    const f = await activeFile(+req.params.id);
    if (!f) return res.status(404).json({ error: 'File not found' });
    const level = req.body.level, uid = +req.body.user_id;
    if (!LEVELS.includes(level)) return res.status(400).json({ error: 'Level must be edit, read or deny' });
    const p = (await people(f.project_id)).find((x) => x.id === uid);
    if (!p) return res.status(400).json({ error: 'That person is not on this project' });
    const old = (await q('SELECT level FROM lab_access WHERE file_id=$1 AND user_id=$2', [f.id, uid]))[0];
    await pool.query('INSERT INTO lab_access(file_id,user_id,level,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT (file_id,user_id) DO UPDATE SET level=$3,granted_by=$4,updated_at=now()', [f.id, uid, level, req.user.id]);
    await appendLedger({ project_id: f.project_id, actor_id: req.user.id, action: 'LAB_ACCESS_CHANGED', details: { file: f.name, person: p.name, from: old ? old.level : 'none', to: level } });
    await note(f.project_id, req.user.id, uid, 'Admin changed your access to "' + f.name + '": ' + level + '.');
    res.json({ ok: true });
  }));
};
