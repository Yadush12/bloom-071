const bcrypt = require('bcryptjs'); const pool = require('./db'); const { appendLedger } = require('./ledger');
(async () => {
  const h = bcrypt.hashSync('pass123', 8);
  const u = async (name, email, role, skills, coi = null) => (await pool.query(
    `INSERT INTO users(name,email,password_hash,role,verification_status,skills,availability,coi_sponsor_id) VALUES($1,$2,$3,$4,'verified',$5,'10 hrs/week',$6) RETURNING id`,
    [name, email, h, role, skills, coi])).rows[0].id;
  const sponsor = await u('Aarav Research Labs', 'sponsor@demo.com', 'sponsor', ['funding']);
  const meera = await u('Dr. Meera', 'meera@demo.com', 'expert', ['python', 'ml', 'computer vision', 'medical imaging']);
  const rao = await u('Dr. Rao (COI)', 'rao@demo.com', 'expert', ['python', 'ml', 'computer vision'], sponsor);
  const a = await u('Student A', 'a@demo.com', 'student', ['python', 'ml', 'computer vision']);
  const b = await u('Student B', 'b@demo.com', 'student', ['python', 'medical imaging', 'data analysis']);
  const c = await u('Student C', 'c@demo.com', 'student', ['python', 'edge devices', 'tflite', 'optimization']);
  await u('Admin User', 'admin@demo.com', 'admin', []);
  const charterSql = `INSERT INTO charters(project_id,version,engagement_model,scope,rewards,ip_rules,publication_rules,confidentiality_rules,ai_rules,credit_split,exit_rules,dispute_rules,commercialization_rules) VALUES($1,1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`;
  const mk = async (title, summary, brief, model, budget, rewards) => {
    const p = (await pool.query(`INSERT INTO projects(sponsor_id,title,public_summary,confidential_brief,status,engagement_model,budget) VALUES($1,$2,$3,$4,'open',$5,$6) RETURNING id`, [sponsor, title, summary, brief, model, budget])).rows[0].id;
    await pool.query(charterSql, [p, model, 'Milestones with deliverables and acceptance criteria', rewards, 'Sponsor owns IP; contributors keep authorship credit', 'Co-authorship for accepted contributors', 'Brief is confidential; only approved AI tools allowed', 'AI use must be declared; agent actions are logged against a human owner', 'Role share first, then reviewed impact (never commit count)', 'Leaving keeps credit for accepted work; pro-rata share', 'Mediation by admin; ledger is evidence', 'Contributors get credit and a revenue-share discussion']);
    await appendLedger({ project_id: p, actor_id: sponsor, action: 'PROJECT_CREATED', details: { title, model } });
    await appendLedger({ project_id: p, actor_id: sponsor, action: 'CHARTER_PUBLISHED', details: { version: 1 } });
    return p;
  };
  const p1 = await mk('Low-cost detection of diabetic retinopathy from fundus images on edge devices', 'Build a lightweight model that screens fundus images for diabetic retinopathy on low-cost edge devices.', 'CONFIDENTIAL: Sponsor dataset of 12,000 labelled fundus images, target <50 MB model, 90% sensitivity.', 'funded', 100000, 'Rs 1,00,000 via milestone escrow, plus credit');
  const p2 = await mk('Student-led annotation guide for retinal image datasets', 'Create an open annotation guideline for retinal image datasets.', 'CONFIDENTIAL: Draft guideline outline shared by the faculty lead.', 'knowledge-sharing', 0, 'No payment: certificates, co-authorship, recommendation letters');
  for (const [uid, role] of [[meera, 'expert'], [a, 'student'], [b, 'student'], [c, 'student']]) await pool.query('INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)', [p1, uid, role]);
  for (const [uid, role] of [[meera, 'expert'], [a, 'student'], [b, 'student']]) await pool.query('INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,$3)', [p2, uid, role]);
  await pool.query("INSERT INTO milestones(project_id,title,description,required_skills,deliverable,acceptance_criteria,amount,status) VALUES($1,'Annotation guideline draft','Draft the retinal annotation guideline','{python}','Guideline draft','Covers label definitions and examples',0,'PLANNED')", [p2]);
  const addFile = async (path, content, owner, readers = []) => {
    const id = (await pool.query('INSERT INTO project_files(project_id,path,content,created_by) VALUES($1,$2,$3,$4) RETURNING id', [p1, path, content, owner])).rows[0].id;
    for (const [uid, lv] of [[owner, 'write'], ...readers.map((r) => [r, 'read'])]) await pool.query('INSERT INTO file_access(file_id,user_id,level,granted_by) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [id, uid, lv, sponsor]);
  };
  await addFile('module1-data/preprocess.py', 'def normalize(pixels):\n    lo, hi = min(pixels), max(pixels)\n    return [(p - lo) / (hi - lo) for p in pixels]\n', a, [meera]);
  await addFile('module1-data/dataset_notes.md', '# Dataset notes\nQuality issues found in the sponsor fundus dataset.\n', a, [meera]);
  await addFile('module2-model/train.py', '# Training script for the DR classifier\nEPOCHS = 20\n', b, [meera]);
  await addFile('module3-edge/quantize.py', 'def quantize(weights, bits=8):\n    levels = 2 ** bits - 1\n    return [round(w * levels) for w in weights]\n', c, [meera]);
  await addFile('docs/PROJECT_NOTES.md', '# Project notes\nShared notes for the whole team.\n', meera, [a, b, c]);
  console.log('Seeded. Password for all demo users: pass123');
  process.exit(0);
})();
