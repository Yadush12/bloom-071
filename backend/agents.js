const OLLAMA = 'http://localhost:11434/api/chat', MODEL = 'qwen3:8b';
async function askJSON(system, user) {
  try {
    const r = await fetch(OLLAMA, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({ model: MODEL, stream: false, think: false, format: 'json', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
    const j = await r.json();
    return JSON.parse(j.message.content);
  } catch (e) { console.error('LLM failed, using fallback:', e.message); return null; }
}
const SCOPE_SYSTEM = `You are a Project Scoping Agent for a research collaboration platform. Break the research problem into 4 sequential milestones. Respond ONLY with JSON: {"milestones":[{"title":"","description":"","required_skills":["python"],"deliverable":"","acceptance_criteria":""}]}. Use short lowercase skill names like python, ml, computer vision, medical imaging, edge devices, tflite, optimization, data analysis.`;
const fallbackMilestones = () => [
  { title: 'Dataset and problem analysis', description: 'Analyse fundus image datasets, quality and class balance.', required_skills: ['python', 'medical imaging', 'data analysis'], deliverable: 'Dataset analysis report', acceptance_criteria: 'Report covers dataset quality, preprocessing and limitations.' },
  { title: 'Model development', description: 'Build and train a baseline DR classification model.', required_skills: ['python', 'ml', 'computer vision'], deliverable: 'Trained model and training notebook', acceptance_criteria: 'Model reaches agreed sensitivity on the validation set.' },
  { title: 'Edge-device optimization', description: 'Compress and quantise the model for low-cost edge devices.', required_skills: ['edge devices', 'tflite', 'optimization'], deliverable: 'Optimised model under size limit with latency benchmark', acceptance_criteria: 'Model size and latency meet the targets on the edge device.' },
  { title: 'Evaluation and documentation', description: 'Evaluate on held-out data and document results and limitations.', required_skills: ['python', 'data analysis'], deliverable: 'Evaluation report and documentation', acceptance_criteria: 'Report includes metrics, failure cases and reproducible steps.' }
];
const skillList = (s) => (Array.isArray(s) ? s : String(s || '').split(',')).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
module.exports = (app, { auth, only, wrap, pool, appendLedger }) => {
  app.get('/api/projects/:id/milestones', auth, wrap(async (req, res) => {
    res.json((await pool.query('SELECT * FROM milestones WHERE project_id=$1 ORDER BY id', [req.params.id])).rows);
  }));
  app.post('/api/projects/:id/agents/scope', auth, only('sponsor'), wrap(async (req, res) => {
    const p = (await pool.query('SELECT * FROM projects WHERE id=$1 AND sponsor_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'Project not found or not yours' });
    const out = await askJSON(SCOPE_SYSTEM, `Title: ${p.title}\nPublic summary: ${p.public_summary}\nBudget (INR): ${p.budget}`);
    let ms = out && Array.isArray(out.milestones) && out.milestones.length >= 2 ? out.milestones.slice(0, 5) : null;
    const source = ms ? MODEL : 'fallback-template';
    if (!ms) ms = fallbackMilestones();
    await pool.query(`DELETE FROM milestones WHERE project_id=$1 AND status='PLANNED'`, [p.id]);
    const each = Math.floor((p.budget || 0) / ms.length);
    for (const m of ms) await pool.query('INSERT INTO milestones(project_id,title,description,required_skills,deliverable,acceptance_criteria,amount) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [p.id, m.title, m.description, skillList(m.required_skills), m.deliverable, m.acceptance_criteria, each]);
    await appendLedger({ project_id: p.id, actor_type: 'AI', human_owner_id: req.user.id, action: 'AI_ACTION', details: { agent: 'Scoping Agent', task: 'Generated milestones, skills and acceptance criteria', model: source, milestones: ms.length, input: 'public summary only' } });
    res.json({ source, milestones: (await pool.query('SELECT * FROM milestones WHERE project_id=$1 ORDER BY id', [p.id])).rows });
  }));
  app.post('/api/projects/:id/agents/match', auth, only('sponsor'), wrap(async (req, res) => {
    const p = (await pool.query('SELECT * FROM projects WHERE id=$1 AND sponsor_id=$2', [req.params.id, req.user.id])).rows[0];
    if (!p) return res.status(404).json({ error: 'Project not found or not yours' });
    const required = [...new Set((await pool.query('SELECT required_skills FROM milestones WHERE project_id=$1', [p.id])).rows.flatMap((m) => m.required_skills || []))];
    if (!required.length) return res.status(400).json({ error: 'Run the Scoping Agent first' });
    const cands = (await pool.query(`SELECT id,name,role,skills,availability,coi_sponsor_id,verification_status FROM users WHERE role IN ('expert','student')`)).rows;
    const filtered_out = [], scored = [];
    for (const c of cands) {
      if (c.verification_status !== 'verified') { filtered_out.push({ id: c.id, name: c.name, reason: 'Identity not verified' }); continue; }
      if (c.coi_sponsor_id === p.sponsor_id) { filtered_out.push({ id: c.id, name: c.name, reason: 'Conflict of interest with this sponsor' }); continue; }
      const have = (c.skills || []).map((s) => s.toLowerCase());
      const matched = required.filter((r) => have.some((h) => h === r || h.includes(r) || r.includes(h)));
      scored.push({ id: c.id, name: c.name, role: c.role, availability: c.availability, matched, missing: required.filter((r) => !matched.includes(r)), score: Math.round((100 * matched.length) / required.length) });
    }
    scored.sort((a, b) => b.score - a.score);
    const picks = [...scored.filter((x) => x.role === 'expert').slice(0, 1), ...scored.filter((x) => x.role === 'student').slice(0, 3)];
    picks.forEach((c) => { c.reason = `Matched because ${c.name} has ${c.matched.join(', ') || 'no listed skills'} (${c.score}% of the required skills), is a verified ${c.role}, is available ${c.availability}, and has no conflict of interest with the sponsor.` + (c.missing.length ? ` Gaps: ${c.missing.join(', ')}.` : ''); });
    await appendLedger({ project_id: p.id, actor_type: 'AI', human_owner_id: req.user.id, action: 'AI_ACTION', details: { agent: 'Matching Agent', task: 'Ranked verified candidates', recommended: picks.map((c) => c.name), filtered_out: filtered_out.map((f) => f.name + ': ' + f.reason) } });
    res.json({ required_skills: required, recommended: picks, filtered_out });
  }));
};
