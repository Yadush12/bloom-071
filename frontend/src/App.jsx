import { useState, useEffect, useCallback } from 'react'
import Lab from './Lab.jsx'
import Dashboard from './Dashboard.jsx'
import Credits from './Credits.jsx'
import Messages from './Messages.jsx'
import Profile from './Profile.jsx'
import Editor from '@monaco-editor/react'
import { fireConfetti, SplitDonut, ChainStrip } from './Fancy.jsx'
import Files from './Files.jsx'

const API = 'http://localhost:4000'
let TOKEN = ''
async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const COLORS = { FUNDED: 'blue', ACCEPTED: 'green', RELEASED: 'green', PLANNED: 'gray', SUBMITTED: 'gray', FLAGGED: 'red', REJECTED: 'red' }
const Badge = ({ t, c }) => <span className={'badge ' + (c || COLORS[t] || 'gray')}>{t}</span>
const DEMO = [['Sponsor', 'sponsor@demo.com'], ['Dr. Meera', 'meera@demo.com'], ['Student A', 'a@demo.com'], ['Student B', 'b@demo.com'], ['Student C', 'c@demo.com'], ['Admin', 'admin@demo.com'], ['Dr. Rao (COI)', 'rao@demo.com']]
const STEPS = [
  { n: 1, t: 'Post', tab: 'overview', who: 'sponsor@demo.com', cap: 'Sponsor posts a problem: public summary, confidential brief and a published charter.' },
  { n: 2, t: 'Scope & Match', tab: 'scope', who: 'sponsor@demo.com', cap: 'AI agents split the work into milestones and recommend people with reasons. Conflicts of interest are filtered out.' },
  { n: 3, t: 'Join & Fund', tab: 'overview', who: 'a@demo.com', cap: 'Members accept the charter and only then does the brief unlock. Sponsor funds escrow (Escrow tab).' },
  { n: 4, t: 'Work', tab: 'work', who: 'a@demo.com', cap: 'Humans and an AI agent work. Every action is logged with a human owner. Copied work is flagged.' },
  { n: 5, t: 'Accept & Pay', tab: 'pay', who: 'sponsor@demo.com', cap: 'Sponsor accepts, reward engine explains each share, escrow releases. Unpaid projects issue credentials.' },
  { n: 6, t: 'Verify', tab: 'verify', who: 'admin@demo.com', cap: 'Edit an old ledger entry and verification fails.' }
]
const TABS = [['overview', 'Project & charter'], ['scope', 'Scope & match'], ['work', 'Workspace'], ['pay', 'Escrow & rewards'], ['files', 'Files'], ['lab', 'Code Lab'], ['dashboard', 'Dashboard'], ['credits', 'Credits'], ['messages', 'Messages'], ['people', 'People'], ['verify', 'Verify & admin']]
const FIELDS = [['Engagement model', 'engagement_model'], ['Scope', 'scope'], ['Rewards', 'rewards'], ['IP', 'ip_rules'], ['Publication', 'publication_rules'], ['Confidentiality', 'confidentiality_rules'], ['AI use', 'ai_rules'], ['Credit split', 'credit_split'], ['Exit', 'exit_rules'], ['Disputes', 'dispute_rules'], ['Commercialisation', 'commercialization_rules']]
const SAMPLES = {
  'Preprocessing': 'def normalize(pixels):\n    lo, hi = min(pixels), max(pixels)\n    if hi == lo:\n        return [0.0 for _ in pixels]\n    return [(p - lo) / (hi - lo) for p in pixels]\n',
  'Padding': 'def resize_with_padding(img, size):\n    h, w = len(img), len(img[0])\n    scale = min(size / h, size / w)\n    return [[0] * size for _ in range(size)] if scale <= 0 else img\n',
  'Quantise': 'def quantize(weights, bits=8):\n    levels = 2 ** bits - 1\n    lo, hi = min(weights), max(weights)\n    step = (hi - lo) / levels if hi > lo else 1.0\n    return [round((x - lo) / step) for x in weights]\n'
}

function Ledger({ pid }) {
  const [ev, setEv] = useState([])
  const [v, setV] = useState(null)
  const load = useCallback(async () => { try { setEv(await api('/api/ledger?project_id=' + pid)); setV(await api('/api/ledger/verify')) } catch (e) { /* ignore */ } }, [pid])
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t) }, [load])
  return (
    <div className="card side">
      <h3>What's happening inside</h3>
      <div className="tiny">Live, hash-chained ledger. Every action: who, what, when.</div>
      {v && <div className={'chain ' + (v.valid ? 'good' : 'bad')}>{v.valid ? '✅ Chain valid · ' + v.checked + ' entries verified' : '❌ TAMPERING DETECTED at entry #' + v.broken_at}</div>}
      {[...ev].reverse().slice(0, 40).map((e) => (
        <div key={e.id} className={'ev ' + (e.actor_type === 'AI' ? 'ai' : '')}>
          <div><b>{e.event_id}</b> <Badge t={e.action} c={e.actor_type === 'AI' ? 'purple' : 'blue'} /> {e.actor_type === 'AI' && <Badge t="AI" c="purple" />}</div>
          <div className="small">{e.actor_type === 'AI' ? (e.details.agent || 'AI Agent') : e.actor}{e.human_owner ? <> · human owner: <b>{e.human_owner}</b></> : null}</div>
          <div className="tiny">{JSON.stringify(e.details).slice(0, 150)}</div>
          <div className="hash">{e.prev_hash} → {e.hash} · {new Date(e.ts).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  )
}
function Overview({ pid, user, say, refresh, setPid }) {
  const [p, setP] = useState(null)
  const [nf, setNf] = useState({ title: '', summary: '', brief: '', budget: 0, model: 'funded' })
  const load = useCallback(() => api('/api/projects/' + pid).then(setP).catch((e) => say(e.message, true)), [pid, user])
  useEffect(() => { load() }, [load])
  if (!p) return <div className="card">Loading…</div>
  const ch = p.charter
  const me = p.members.find((m) => m.id === user.id)
  const unpaid = ch && ch.engagement_model !== 'funded'
  const accept = async () => { try { const r = await api('/api/charters/' + ch.id + '/accept', 'POST'); say('Charter ' + r.version + ' accepted. Confidential brief unlocked.'); load() } catch (e) { say(e.message, true) } }
  const v2 = async () => { try { await api('/api/projects/' + p.id + '/charter', 'POST', { engagement_model: 'knowledge-sharing', rewards: 'No payment: credit only (changed from paid)' }); say('Charter v' + (ch.version + 1) + '.0 published. Every member must re-accept; the brief re-locks.'); load() } catch (e) { say(e.message, true) } }
  const create = async () => {
    try {
      const np = await api('/api/projects', 'POST', { title: nf.title, public_summary: nf.summary, confidential_brief: nf.brief, engagement_model: nf.model, budget: +nf.budget })
      await api('/api/projects/' + np.id + '/charter', 'POST', { engagement_model: nf.model, scope: 'Milestones with deliverables and acceptance criteria', rewards: nf.model === 'funded' ? 'Milestone payments via escrow, plus credit' : 'No payment: certificates, co-authorship, recommendation letters', ip_rules: 'Sponsor owns IP; contributors keep authorship credit', publication_rules: 'Co-authorship for accepted contributors', confidentiality_rules: 'Brief is confidential; approved AI tools only', ai_rules: 'AI use must be declared; agent actions logged to a human owner', credit_split: 'Role share first, then reviewed impact (never commit count)', exit_rules: 'Leaving keeps credit for accepted work', dispute_rules: 'Admin mediation; ledger is evidence', commercialization_rules: 'Contributors get credit and a revenue-share discussion' })
      say('Problem posted with charter v1.0'); await refresh(); setPid(np.id)
    } catch (e) { say(e.message, true) }
  }
  return (<>
    <div className="card">
      <h2>{p.title}</h2>
      <div className="row">
        <Badge t={unpaid ? 'UNPAID · no payment promised' : 'FUNDED · ' + inr(p.budget)} c={unpaid ? 'orange' : 'blue'} />
        {ch && <Badge t={'Charter v' + ch.version + '.0'} c="gray" />}
      </div>
      <p><b>Public summary:</b> {p.public_summary}</p>
      <div className={'brief ' + (p.brief_locked ? 'locked' : 'open')}>
        <b>Confidential brief: {p.brief_locked ? '🔒 LOCKED' : '🔓 UNLOCKED'}</b>
        <div>{p.brief_locked ? 'Hidden by the server. It unlocks only for members who accepted the current charter.' : p.confidential_brief}</div>
      </div>
      {me && !me.accepted && user.role !== 'sponsor' && <div className="hint">Accept the charter to unlock the brief. <button className="ok" onClick={accept}>Accept Charter v{ch.version}.0</button></div>}
      {me && me.accepted && <Badge t={'Charter v' + ch.version + '.0 — Accepted'} c="green" />}
      {user.role === 'sponsor' && p.sponsor_id === user.id && <div className="row"><button className="danger" onClick={v2}>Change terms → Charter v2 (paid becomes unpaid)</button><span className="tiny">Terms never change silently: new version, re-acceptance.</span></div>}
    </div>
    <div className="card"><h3>Project charter</h3>
      <table><tbody>{ch && FIELDS.map(([l, k]) => <tr key={k}><th>{l}</th><td>{ch[k]}</td></tr>)}</tbody></table>
    </div>
    <div className="card"><h3>Team</h3>
      <table><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Latest charter</th></tr></thead>
        <tbody>{p.members.map((m) => <tr key={m.id}><td>{m.name}</td><td>{m.role}</td><td>{m.status}</td><td>{m.accepted ? <Badge t="ACCEPTED" c="green" /> : <Badge t="NOT ACCEPTED" c="orange" />}</td></tr>)}</tbody></table>
    </div>
    {user.role === 'sponsor' && <div className="card"><h3>Post a new research problem</h3>
      <input placeholder="Title" value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })} />
      <textarea placeholder="Public summary (visible to everyone)" value={nf.summary} onChange={(e) => setNf({ ...nf, summary: e.target.value })} />
      <textarea placeholder="Confidential brief (hidden until charter accepted)" value={nf.brief} onChange={(e) => setNf({ ...nf, brief: e.target.value })} />
      <div className="row"><select value={nf.model} onChange={(e) => setNf({ ...nf, model: e.target.value })}><option value="funded">Funded (escrow)</option><option value="knowledge-sharing">Knowledge-sharing (no payment)</option></select>
        <input type="number" placeholder="Budget ₹" value={nf.budget} onChange={(e) => setNf({ ...nf, budget: e.target.value })} />
        <button onClick={create} disabled={!nf.title}>Post with charter v1.0</button></div>
    </div>}
  </>)
}

function Scope({ pid, user, say, setBusy }) {
  const [ms, setMs] = useState([])
  const [m, setM] = useState(null)
  const load = useCallback(() => api('/api/projects/' + pid + '/milestones').then(setMs).catch(() => {}), [pid])
  useEffect(() => { setM(null); load() }, [load])
  const isSp = user.role === 'sponsor'
  const gen = async () => { setBusy('Scoping Agent (Qwen3 8B) is reading the public summary… up to 90 seconds'); try { const r = await api('/api/projects/' + pid + '/agents/scope', 'POST'); say('Scope generated by ' + r.source); load() } catch (e) { say(e.message, true) } finally { setBusy('') } }
  const match = async () => { setBusy('Matching Agent is ranking verified candidates…'); try { setM(await api('/api/projects/' + pid + '/agents/match', 'POST')) } catch (e) { say(e.message, true) } finally { setBusy('') } }
  const invite = async () => { try { for (const c of m.recommended) await api('/api/projects/' + pid + '/members', 'POST', { user_id: c.id, role: c.role }); say('Recommended team invited. They must accept the charter before seeing the brief.') } catch (e) { say(e.message, true) } }
  return (<>
    <div className="card"><h3>AI scoping</h3>
      <div className="tiny">The Scoping Agent only ever sees the public summary, never the confidential brief.</div>
      {isSp ? <div className="row"><button onClick={gen}>Generate Project Scope</button><button onClick={match} disabled={!ms.length}>Run Matching Agent</button></div> : <div className="hint">Log in as the Sponsor to run the agents.</div>}
      {ms.map((x, i) => <div key={x.id} className="card" style={{ background: '#fafbff' }}>
        <div className="row"><b>Milestone {i + 1}: {x.title}</b><Badge t={x.status} /><Badge t={inr(x.amount)} c="blue" /></div>
        <div className="small">{x.description}</div>
        <div className="row">{(x.required_skills || []).map((s) => <Badge key={s} t={s} c="purple" />)}</div>
        <div className="tiny"><b>Deliverable:</b> {x.deliverable} · <b>Acceptance:</b> {x.acceptance_criteria}</div>
      </div>)}
    </div>
    {m && <div className="card"><h3>Matching results</h3>
      <div className="tiny">Required skills: {m.required_skills.join(', ')}</div>
      {m.recommended.map((c) => <div key={c.id} style={{ margin: '10px 0' }}>
        <div className="row"><b>{c.name}</b><Badge t={c.role} c="blue" /><span className="tiny">{c.score}% skill match</span></div>
        <div className="bar"><i style={{ width: c.score + '%' }} /></div><div className="small">{c.reason}</div></div>)}
      {m.filtered_out.map((f) => <div key={f.id} className="hint" style={{ background: '#fee2e2', borderColor: '#dc2626' }}>🚫 <b>{f.name}</b> filtered out: {f.reason}</div>)}
      {isSp && <button className="ok" onClick={invite}>Invite recommended team</button>}
    </div>}
  </>)
}

function Work({ pid, user, say, setBusy }) {
  const [ms, setMs] = useState([])
  const [cs, setCs] = useState([])
  const [pj, setPj] = useState(null)
  const [f, setF] = useState({ milestone: '', description: '', artifact: '', ai: false, commits: 0 })
  const [mono, setMono] = useState(navigator.onLine)
  const [rev, setRev] = useState({})
  const [rep, setRep] = useState({})
  const [mine, setMine] = useState({})
  const [mres, setMres] = useState({})
  const load = useCallback(async () => {
    try { setMs(await api('/api/projects/' + pid + '/milestones')); setPj(await api('/api/projects/' + pid)) } catch (e) { /* ignore */ }
    try { setCs(await api('/api/projects/' + pid + '/contributions')) } catch (e) { setCs([]) }
  }, [pid])
  useEffect(() => { load() }, [load])
  const mid = f.milestone || (ms[0] && ms[0].id)
  const worker = user.role === 'student' || user.role === 'expert'
  const submit = async () => {
    try { const r = await api('/api/milestones/' + mid + '/contributions', 'POST', { description: f.description, artifact: f.artifact, ai_declared: f.ai, commit_count: +f.commits }); say('Submitted. Integrity check: ' + r.integrity.status + ' (' + r.integrity.similarity + '% similar)', r.integrity.status !== 'CLEAR'); load() } catch (e) { say(e.message, true) }
  }
  const agent = async (c) => {
    setBusy('Workspace Agent is reading the code, writing tests and running them… up to 1 minute')
    try { const r = await api('/api/contributions/' + c.id + '/agent-review', 'POST'); setRep((x) => ({ ...x, [c.id]: r })); say('Agent finished. Every step is in the ledger with you as human owner.') } catch (e) { say(e.message, true) } finally { setBusy('') }
  }
  const runMine = async (c) => {
    try { const r = await api('/api/contributions/' + c.id + '/run-my-tests', 'POST', { tests: mine[c.id] || '' }); setMres((x) => ({ ...x, [c.id]: r })); say('Ran ' + r.total + ' of your test cases: ' + r.passed + ' passed. Logged in the ledger.', r.passed < r.total) } catch (e) { say(e.message, true) }
  }
  const review = async (c, decision) => {
    const r = rev[c.id] || { quality: 8, impact: 8, effort: 8, comments: '' }
    try { await api('/api/contributions/' + c.id + '/review', 'POST', { quality: +r.quality, impact: +r.impact, effort: +r.effort, comments: r.comments, decision }); say('Review recorded: ' + decision); load() } catch (e) { say(e.message, true) }
  }
  const setR = (id, k, v) => setRev((x) => ({ ...x, [id]: { quality: 8, impact: 8, effort: 8, comments: '', ...(x[id] || {}), [k]: v } }))
  const funded = pj && pj.engagement_model === 'funded'
  const mObj = ms.find((x) => x.id === +mid)
  return (<>
    {worker && <div className="card"><h3>Submit a contribution (code editor)</h3>
      {funded && mObj && mObj.status === 'PLANNED' && <div className="hint">This milestone is not funded yet. The sponsor must fund escrow first (Escrow &amp; rewards tab).</div>}
      <select value={mid || ''} onChange={(e) => setF((x) => ({ ...x, milestone: e.target.value }))}>{ms.map((x) => <option key={x.id} value={x.id}>{x.title} ({x.status})</option>)}</select>
      <input placeholder="Description" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} />
      <div className="row">{Object.keys(SAMPLES).map((k) => <button key={k} className="sec" onClick={() => setF((x) => ({ ...x, artifact: SAMPLES[k], description: x.description || k + ' code' }))}>Load sample: {k}</button>)}<label className="small"><input type="checkbox" checked={!mono} onChange={(e) => setMono(!e.target.checked)} style={{ width: 'auto' }} /> plain editor</label></div>
      {mono ? <Editor height="220px" language="python" theme="vs-dark" value={f.artifact} onChange={(v) => setF((x) => ({ ...x, artifact: v || '' }))} options={{ minimap: { enabled: false }, fontSize: 13 }} /> : <textarea className="code" value={f.artifact} onChange={(e) => setF((x) => ({ ...x, artifact: e.target.value }))} />}
      <div className="row"><label className="small"><input type="checkbox" checked={f.ai} onChange={(e) => setF((x) => ({ ...x, ai: e.target.checked }))} style={{ width: 'auto' }} /> I used AI tools (declaration)</label>
        <button onClick={submit} disabled={!f.artifact || !mid}>Submit contribution</button></div>
    </div>}
    <div className="card"><h3>Contributions</h3>
      {!cs.length && <div className="tiny">None yet (or you are not an accepted member).</div>}
      {cs.map((c) => { const r = rep[c.id] || (c.agent_report ? JSON.parse(c.agent_report) : null); return (
        <div key={c.id} className="card" style={{ background: '#fafbff' }}>
          <div className="row"><b>#{c.id} {c.description}</b><Badge t={c.status} /><span className="tiny">by {c.contributor} · {c.milestone}</span></div>
          <div className="row"><Badge t={c.similarity >= 60 ? 'REVIEW REQUIRED · ' + c.similarity + '% similar' : 'CLEAR · ' + c.similarity + '% similar'} c={c.similarity >= 60 ? 'red' : 'green'} />
            <Badge t={c.ai_declared ? 'AI use declared' : 'No AI declared'} c="purple" /><span className="hash">sha256 {c.artifact_hash.slice(0, 16)}…</span>
            {c.commit_count > 0 && <span className="tiny">{c.commit_count} commits (not used for rewards)</span>}
            {c.impact_score && <Badge t={'impact ' + c.impact_score + ' · quality ' + c.quality_score} c="blue" />}</div>
          <pre>{c.artifact}</pre>
          {worker && <button onClick={() => agent(c)}>Run AI agent review (writes and runs tests)</button>}
          {r && <div className="hint"><b>Agent report:</b> {r.summary}<br />Syntax: {r.syntax_ok ? '✅' : '❌'} · Tests: {r.tests_passed ? '✅ passed' : '❌ failed'}{r.issues && r.issues.length ? <><br />Issues: {r.issues.join('; ')}</> : null}
            {!r.details && !r.tests_passed && <div className="tiny">⚠ Old report without failure details. Click "Run AI agent review" again to see exactly which test failed.</div>}
            {r.details && r.details.load_error && <div className="tiny">❌ {r.details.load_error.file} line {r.details.load_error.line}: {r.details.load_error.type}: {r.details.load_error.message} <code>{r.details.load_error.source}</code></div>}
            {r.details && (r.details.tests || []).filter((t) => !t.ok).map((t, i) => <div key={i} className="tiny">❌ <b>{t.name}</b> (test line {t.test_line}): <code>{t.test_source}</code> {t.got !== undefined ? '→ got ' + t.got + ' ' + t.op + ' expected ' + t.expected : '→ ' + t.error_type + ': ' + t.message}{t.code_source ? ' · breaks in your code ' + t.code_function + '() line ' + t.code_line + ': ' + t.code_source : ''}</div>)}
            <details open><summary>Generated tests and output</summary><pre>{r.tests}{'\n\n'}{r.test_output}</pre></details></div>}
          {worker && <details className="hint"><summary><b>Try your own test cases</b></summary>
            <div className="tiny">One per line. Write an expression that should be True, for example: preprocess([2, 4], 4) == [0.5, 1.0, 0.0, 0.0]</div>
            <textarea className="code" style={{ minHeight: 80 }} placeholder={'preprocess([2, 4], 4) == [0.5, 1.0, 0.0, 0.0]\npreprocess([], 3) == [0.0, 0.0, 0.0]'} value={mine[c.id] || ''} onChange={(e) => setMine((x) => ({ ...x, [c.id]: e.target.value }))} />
            <button onClick={() => runMine(c)}>Run my tests</button>
            {mres[c.id] && <div><b>{mres[c.id].passed} of {mres[c.id].total} passed</b>{mres[c.id].results.map((t, i) => <div key={i} className="tiny">{t.ok ? '✅' : '❌'} <code>{t.case}</code>{t.error ? ' → ' + t.error : ''}{t.got !== undefined ? ' → got ' + t.got + ', expected ' + t.expected : ''}</div>)}</div>}
          </details>}
          {user.role === 'expert' && ['SUBMITTED', 'FLAGGED'].includes(c.status) && <div className="hint"><b>Expert review</b>
            <div className="row">{['quality', 'impact', 'effort'].map((k) => <label key={k} className="small">{k}<input type="number" step="0.1" value={(rev[c.id] || {})[k] ?? 8} onChange={(e) => setR(c.id, k, e.target.value)} /></label>)}</div>
            <input placeholder="Reason (required)" value={(rev[c.id] || {}).comments || ''} onChange={(e) => setR(c.id, 'comments', e.target.value)} />
            <div className="row"><button className="ok" onClick={() => review(c, 'ACCEPTED')}>Accept</button><button className="danger" onClick={() => review(c, 'REJECTED')}>Reject</button></div></div>}
        </div>) })}
    </div>
  </>)
}

function Reward({ r }) {
  const all = [...r.experts, ...r.students]
  return (<div>
    <div className="small">Milestone {inr(r.amount)} · platform fee {inr(r.platform_fee)} · AI compute reserve {inr(r.ai_compute_reserve)} (AI does not earn) · {r.outcome === 'NEGATIVE_RESULT' ? 'documented negative result: effort-based' : 'positive result'}</div>
    <SplitDonut r={r} />
    <table><thead><tr><th>Person</th><th>Role</th><th>Weight</th><th>Amount</th></tr></thead>
      <tbody>{all.map((x) => <tr key={x.id}><td><b>{x.name}</b><div className="tiny">{x.why}</div></td><td>{x.role}</td><td>{x.weight_pct ? x.weight_pct + '%' : '—'}</td><td><b>{inr(x.amount)}</b></td></tr>)}</tbody></table>
    <div className="tiny">{r.rule}</div></div>)
}

function Pay({ pid, user, say, setBusy }) {
  const [p, setP] = useState(null)
  const [ms, setMs] = useState([])
  const [pay, setPay] = useState([])
  const [creds, setCreds] = useState([])
  const [rw, setRw] = useState({})
  const [neg, setNeg] = useState({})
  const [reason, setReason] = useState('')
  const load = useCallback(async () => {
    try { setP(await api('/api/projects/' + pid)); setMs(await api('/api/projects/' + pid + '/milestones')); setPay(await api('/api/projects/' + pid + '/payouts')); setCreds(await api('/api/projects/' + pid + '/credentials')) } catch (e) { say(e.message, true) }
  }, [pid])
  useEffect(() => { setRw({}); load() }, [load])
  const act = async (label, fn) => { try { setBusy(label + '…'); const r = await fn(); say(label + ': done'); await load(); return r } catch (e) { say(e.message, true) } finally { setBusy('') } }
  if (!p) return <div className="card">Loading…</div>
  const funded = p.engagement_model === 'funded'
  const sp = user.role === 'sponsor' && p.sponsor_id === user.id
  return (<>
    {funded ? <div className="card"><h3>Milestones, escrow and rewards</h3>
      {ms.map((m) => <div key={m.id} className="card" style={{ background: '#fafbff' }}>
        <div className="row"><b>{m.title}</b><Badge t={m.status === 'FUNDED' ? 'FUNDED → ESCROW' : m.status === 'RELEASED' ? 'ESCROW → RELEASED' : m.status} c={COLORS[m.status]} /><Badge t={inr(m.amount)} c="blue" /></div>
        <div className="row">
          {m.status === 'PLANNED' && sp && <button onClick={() => act('Fund escrow', () => api('/api/milestones/' + m.id + '/fund', 'POST', { window_days: 7 }))}>Fund {inr(m.amount)} into escrow</button>}
          {m.status === 'FUNDED' && sp && <><label className="small"><input type="checkbox" style={{ width: 'auto' }} checked={!!neg[m.id]} onChange={(e) => setNeg({ ...neg, [m.id]: e.target.checked })} /> Research failed: accept documented negative result</label>
            <button className="ok" onClick={() => act('Accept milestone', () => api('/api/milestones/' + m.id + '/accept', 'POST', { outcome: neg[m.id] ? 'negative_result' : 'positive' }))}>Accept Milestone</button></>}
          {m.status === 'FUNDED' && user.role === 'admin' && <button className="sec" onClick={() => act('Auto-accept (sponsor silent)', () => api('/api/milestones/' + m.id + '/auto-accept', 'POST', { simulate_window_elapsed: true }))}>Sponsor silent: auto-accept</button>}
          {m.status === 'ACCEPTED' && <button onClick={async () => { const r = await act('Calculate reward', () => api('/api/milestones/' + m.id + '/calculate-reward', 'POST', {})); if (r) setRw((x) => ({ ...x, [m.id]: r })) }}>Calculate reward</button>}
          {m.status === 'ACCEPTED' && sp && <button className="ok" onClick={async () => { const r = await act('Release escrow', () => api('/api/milestones/' + m.id + '/release-escrow', 'POST', {})); if (r) setRw((x) => ({ ...x, [m.id]: r })) }}>Release escrow</button>}
        </div>
        {rw[m.id] && <Reward r={rw[m.id]} />}
        {m.status === 'RELEASED' && !rw[m.id] && <table><tbody>{pay.filter((x) => x.milestone === m.title || x.milestone == null).map((x) => <tr key={x.id}><td><b>{x.name || 'Platform / AI reserve'}</b><div className="tiny">{x.reason}</div></td><td><b>{inr(x.amount)}</b></td></tr>)}</tbody></table>}
      </div>)}
    </div> : <div className="card"><h3>Non-monetary project: ₹0</h3>
      <div className="hint">No payment is offered or possible here. Contributors receive credentials and credit instead.</div>
      {sp && <button className="ok" onClick={() => act('Issue credentials', () => api('/api/projects/' + pid + '/issue-credentials', 'POST', {}))}>Issue credentials and credit</button>}
      {creds.length > 0 && <table><thead><tr><th>Person</th><th>Credential</th></tr></thead><tbody>{creds.map((c) => <tr key={c.id}><td>{c.name}</td><td><Badge t={c.credential_type} c="green" /></td></tr>)}</tbody></table>}
    </div>}
    <div className="card"><h3>Edge cases</h3>
      <div className="row"><button className="sec" onClick={() => act('Leave project', () => api('/api/projects/' + pid + '/leave', 'POST', {}))}>Student quits (credit kept, access revoked)</button></div>
      <div className="row"><input placeholder="Dispute reason" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="sec" onClick={() => act('Raise dispute', () => api('/api/projects/' + pid + '/disputes', 'POST', { reason }))} disabled={!reason}>Raise dispute</button></div>
    </div>
  </>)
}
function Verify({ user, say }) {
  const [m, setM] = useState(null)
  const load = useCallback(() => { if (user.role === 'admin') api('/api/admin/metrics').then(setM).catch(() => {}) }, [user])
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t) }, [load])
  const [users, setUsers] = useState([])
  const loadU = useCallback(() => { if (user.role === 'admin') api('/api/admin/users').then(setUsers).catch(() => {}) }, [user])
  useEffect(() => { loadU() }, [loadU])
  const verifyU = async (id) => { try { await api('/api/admin/users/' + id + '/verify', 'POST'); say('User verified and logged in the ledger.'); loadU() } catch (e) { say(e.message, true) } }
  const tamper = async () => { try { const evs = await api('/api/ledger'); const t = evs[2]; await api('/api/ledger/tamper', 'POST', { id: t.id }); say('Edited ' + t.event_id + ' directly in the database. Watch the chain banner.', true) } catch (e) { say(e.message, true) } }
  const restore = async () => { try { await api('/api/ledger/restore', 'POST'); say('Original entry restored. Chain valid again.') } catch (e) { say(e.message, true) } }
  if (user.role !== 'admin') return <div className="card"><div className="hint">Log in as <b>Admin</b> for the verification demo and system metrics.</div></div>
  return (<>
    <div className="card"><h3>Ledger verification</h3>
      <div className="small">Each entry stores the hash of the previous one. Editing any old entry breaks every hash after it.</div>
      <div className="row"><button className="danger" onClick={tamper}>Tamper with an old entry</button><button className="ok" onClick={restore}>Restore original</button></div>
    </div>
    <ChainStrip api={api} />
    <div className="card"><h3>Identity verification</h3>
      <table><tbody>{users.map((u) => <tr key={u.id}><td>{u.name}</td><td className="tiny">{u.role}</td><td>{u.verification_status === 'verified' ? <Badge t="VERIFIED" c="green" /> : <button onClick={() => verifyU(u.id)}>Verify</button>}</td></tr>)}</tbody></table>
    </div>
    {m && <div className="card"><h3>System overview</h3>
      <div className="grid">{[['Active projects', m.active_projects], ['Users', m.users], ['AI requests', m.ai_requests], ['Integrity alerts', m.integrity_alerts], ['Pending reviews', m.pending_reviews], ['Avg latency ms', m.avg_latency_ms], ['Error rate %', m.error_rate_pct], ['Ledger entries', m.ledger_entries]].map(([l, v]) => <div key={l} className="stat"><b>{v}</b><span className="tiny">{l}</span></div>)}</div>
      <p className="small">Escrow: {Object.entries(m.escrow).map(([k, v]) => k + ' ' + inr(v)).join(' · ') || 'none yet'}</p>
    </div>}
  </>)
}

export default function App() {
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [pid, setPid] = useState(1)
  const [projects, setProjects] = useState([])
  const [tab, setTab] = useState('dashboard')
  const [step, setStep] = useState(1)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'student', skills: '' })
  const [reg, setReg] = useState(false)
  const f = (k) => (e) => setForm((x) => ({ ...x, [k]: e.target.value }))
  const say = (t, bad) => { if (!bad && /releas|accepted|credential|issued/i.test(String(t))) fireConfetti(); setMsg({ t, bad }); setTimeout(() => setMsg(null), 7000) }
  const refresh = async () => { try { setProjects(await api('/api/projects')) } catch (e) { /* ignore */ } }
  const login = async (em, pw = 'pass123') => {
    try { const r = await api('/api/auth/login', 'POST', { email: em, password: pw }); TOKEN = r.token; sessionStorage.setItem('token', r.token); sessionStorage.setItem('email', em); setEmail(em); setUser(r.user); await refresh() } catch (e) { say(e.message, true) }
  }
  const register = async () => {
    try { await api('/api/auth/register', 'POST', form); say('Registered. An admin must verify your identity before you can be matched. You can log in now.'); setReg(false) } catch (e) { say(e.message, true) }
  }
  const logout = () => { TOKEN = ''; sessionStorage.clear(); setUser(null); setEmail('') }
  useEffect(() => { const t = sessionStorage.getItem('token'); if (t) { TOKEN = t; api('/api/auth/me').then((u) => { setUser(u); setEmail(sessionStorage.getItem('email') || ''); refresh() }).catch(() => sessionStorage.clear()) } }, [])
  const goStep = async (s) => { setStep(s.n); if (email !== s.who) await login(s.who); setTab(s.tab) }
  if (!user) return (<div className="login card"><h2>Collaborative Research Ecosystem</h2><p className="tiny">Team Bloom-071 · Gardenia 2K26</p>
    <h3>{reg ? 'Create account' : 'Log in'}</h3>
    {reg && <input placeholder="Full name" value={form.name} onChange={f('name')} />}
    <input placeholder="Email" value={form.email} onChange={f('email')} />
    <input type="password" placeholder="Password (6+ characters)" value={form.password} onChange={f('password')} />
    {reg && <><select value={form.role} onChange={f('role')}><option value="student">Student</option><option value="expert">Expert / mentor</option><option value="sponsor">Sponsor</option></select>
      <input placeholder="Skills, comma separated (e.g. python, ml)" value={form.skills} onChange={f('skills')} /></>}
    <div className="row">{reg ? <button onClick={register}>Register</button> : <button onClick={() => login(form.email, form.password)}>Log in</button>}
      <button className="sec" onClick={() => setReg(!reg)}>{reg ? 'Back to login' : 'New here? Register'}</button></div>
    {msg && <div className={'toast ' + (msg.bad ? 'bad' : '')}>{msg.t}</div>}
    <hr /><div className="tiny">Demo shortcuts (synthetic users, password pass123):</div>
    <div className="row">{DEMO.map(([n, e]) => <button key={e} className="sec" onClick={() => login(e)}>{n}</button>)}</div></div>)
  const cur = STEPS.find((s) => s.n === step)
  return (<div>
    <div className="top"><h1>🔬 Collaborative Research Ecosystem</h1>
      <span className="tiny" style={{ color: '#b9bdd6' }}>Logged in as</span>
      {DEMO.map(([n, e]) => <button key={e} className={email === e ? 'on' : ''} onClick={() => login(e)}>{n}</button>)}
      <button onClick={logout}>Log out</button><select style={{ width: 'auto' }} value={pid} onChange={(e) => setPid(+e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>#{p.id} {p.title.slice(0, 40)} · {p.engagement_model}</option>)}</select></div>
    <div className="steps">{STEPS.map((s) => <div key={s.n} className={'step ' + (s.n === step ? 'on' : '')} onClick={() => goStep(s)}><b>{s.n}. {s.t}</b><span>{s.n === step ? s.cap : 'as ' + (DEMO.find((d) => d[1] === s.who) || [''])[0]}</span></div>)}</div>
    {busy && <div className="busy">⏳ {busy}</div>}
    {msg && <div className={'toast ' + (msg.bad ? 'bad' : '')}>{msg.t}</div>}
    <div className="layout"><div>
      <div className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {cur && <div className="hint"><b>Step {cur.n}:</b> {cur.cap}</div>}
      {tab === 'overview' && <Overview pid={pid} user={user} say={say} refresh={refresh} setPid={setPid} />}
      {tab === 'scope' && <Scope pid={pid} user={user} say={say} setBusy={setBusy} />}
      {tab === 'work' && <Work pid={pid} user={user} say={say} setBusy={setBusy} />}
      {tab === 'pay' && <Pay pid={pid} user={user} say={say} setBusy={setBusy} />}
      {tab === 'files' && <Files pid={pid} user={user} say={say} api={api} />}
      {tab === 'verify' && <Verify user={user} say={say} />}
      {tab === 'people' ? <Profile key={user.id} api={api} user={user} say={say} /> : null}
      {tab === 'messages' ? <Messages key={user.id} api={api} user={user} say={say} pid={pid} /> : null}
      {tab === 'credits' ? <Credits key={user.id} api={api} user={user} say={say} /> : null}
      {tab === 'dashboard' ? <Dashboard key={user.id} api={api} user={user} /> : null}
      {tab === 'lab' ? <Lab key={user.id} api={api} user={user} say={say} pid={pid} /> : null}
    </div><Ledger pid={pid} /></div>
  </div>)
}
