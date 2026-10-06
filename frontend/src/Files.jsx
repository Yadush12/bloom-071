import { useState, useEffect, useCallback } from 'react'

const LC = { edit: '#4ade80', read: '#38bdf8', deny: '#f87171' }
const Pick = ({ value, onChange }) => <span>{['edit', 'read', 'deny'].map((l) => <button key={l} className="sec" onClick={() => onChange(l)} style={{ marginLeft: 4, opacity: value === l ? 1 : .45, outline: value === l ? '2px solid ' + LC[l] : 'none' }}>{l === 'edit' ? 'Edit' : l === 'read' ? 'Read' : 'No access'}</button>)}</span>
const Tag = ({ t, c }) => <span className={'badge ' + (c || 'gray')}>{t}</span>

const Fail = ({ t }) => <div style={{ margin: '6px 0 10px 18px', padding: 8, background: '#fef2f2', borderLeft: '3px solid #dc2626', borderRadius: 4 }}>
  <div className="small"><b>{t.error_type || 'Failed'}</b>{t.message ? ': ' + t.message : ''}</div>
  {t.test_source && <div className="tiny">Test line {t.test_line}: <code>{t.test_source}</code></div>}
  {t.got !== undefined && <div className="tiny">Got: <code>{t.got}</code> &nbsp; {t.op} &nbsp; Expected: <code>{t.expected}</code></div>}
  {t.code_source && <div className="tiny">Breaks in your code, <code>{t.code_function}()</code> line {t.code_line}: <code>{t.code_source}</code></div>}
</div>

function TestLab({ file, api, say }) {
  const [busy, setBusy] = useState(false)
  const [sec, setSec] = useState(0)
  const [rep, setRep] = useState(null)
  const [mine, setMine] = useState('')
  const [mres, setMres] = useState(null)
  useEffect(() => { setRep(null); setMres(null) }, [file.id])
  useEffect(() => { if (!busy) return; setSec(0); const t = setInterval(() => setSec((x) => x + 1), 1000); return () => clearInterval(t) }, [busy])
  const agent = async () => {
    setBusy(true); setRep(null)
    try { const r = await api('/api/files/' + file.id + '/agent-test', 'POST'); setRep(r); say(r.passed ? 'All tests passed.' : 'Some tests failed. See exactly which below.', !r.passed) } catch (e) { say(e.message, true) } finally { setBusy(false) }
  }
  const runMine = async () => {
    try { const r = await api('/api/files/' + file.id + '/run-my-tests', 'POST', { tests: mine }); setMres(r); say(r.passed + ' of ' + r.total + ' of your test cases passed.', r.passed < r.total) } catch (e) { say(e.message, true) }
  }
  const last = rep && rep.final
  return (<div className="card"><h3>Test this file</h3>
    <div className="row"><button onClick={agent} disabled={busy}>{busy ? 'Agent working… ' + sec + 's / 60s' : 'Run AI agent tests (max 1 min)'}</button></div>
    {rep && <div className="hint">
      <b>{rep.passed ? '✅ All passed' : '❌ Failed'}</b> · {(rep.elapsed_ms / 1000).toFixed(1)}s of {rep.budget_ms / 1000}s · tests by {rep.source}
      {rep.summary && <div className="small">{rep.summary}</div>}
      {rep.issues && rep.issues.length > 0 && <div className="small">Issues: {rep.issues.join('; ')}</div>}
      {last && last.load_error && <div style={{ marginTop: 6 }}><b>Could not run: {last.load_error.file}</b><Fail t={{ error_type: last.load_error.type, message: last.load_error.message, test_line: last.load_error.line, test_source: last.load_error.source }} /></div>}
      {last && (last.tests || []).map((t, i) => <div key={i}><div className="small">{t.ok ? '✅' : '❌'} <b>{t.name}</b> <span className="tiny">{t.ms}ms</span></div>{!t.ok && <Fail t={t} />}</div>)}
      {rep.attempts.length > 1 && <div className="tiny">Attempt 1 failed, so the agent revised its tests and ran again (attempt 2 shown).</div>}
      <details><summary className="tiny">AI-written test code</summary><pre>{rep.tests_code}</pre></details>
      <div className="tiny">Logged in the ledger with you as human owner. AI-written tests can be wrong, so human review is required.</div>
    </div>}
    <details className="hint"><summary><b>Try your own test cases</b></summary>
      <div className="tiny">One per line, an expression that should be True, e.g. normalize([0, 10]) == [0.0, 1.0]</div>
      <textarea className="code" style={{ minHeight: 80 }} value={mine} onChange={(e) => setMine(e.target.value)} />
      <button disabled={!mine.trim()} onClick={runMine}>Run my tests</button>
      {mres && <div><b>{mres.passed} of {mres.total} passed</b>{mres.results.map((t) => <div key={t.n}><div className="small">{t.ok ? '✅' : '❌'} #{t.n} <code>{t.case}</code></div>{!t.ok && <Fail t={{ error_type: t.error ? undefined : 'Wrong result', message: t.error, got: t.got, expected: t.expected, op: '==' }} />}</div>)}</div>}
    </details>
  </div>)
}

export default function Files({ pid, user, say, api }) {
  const [files, setFiles] = useState([])
  const [sel, setSel] = useState(null)
  const [denied, setDenied] = useState(null)
  const [text, setText] = useState('')
  const [nf, setNf] = useState({ path: '', content: '', purpose: '' })
  const [pick, setPick] = useState({})
  const [ppl, setPpl] = useState([])
  const [pending, setPending] = useState([])
  const [myReqs, setMyReqs] = useState([])
  const [why, setWhy] = useState({})
  const isAdmin = user.role === 'admin'

  const load = useCallback(async () => {
    try { setFiles(await api('/api/projects/' + pid + '/files')) } catch (e) { setFiles([]) }
    if (isAdmin) {
      try { setPpl(await api('/api/projects/' + pid + '/file-people')) } catch (e) { setPpl([]) }
      try { setPending((await api('/api/lab/requests')).filter((r) => r.project_id === +pid)) } catch (e) { setPending([]) }
    } else {
      try { setMyReqs((await api('/api/lab/files?project_id=' + pid)).requests || []) } catch (e) { setMyReqs([]) }
    }
  }, [pid, api, isAdmin])
  useEffect(() => { setSel(null); setDenied(null); load() }, [load])

  const open = async (f) => {
    setDenied(null); setSel(null)
    try { const r = await api('/api/files/' + f.id); setSel(r); setText(r.content) }
    catch (e) { setDenied({ path: f.path, msg: e.message }); say(e.message, true) }
  }
  const save = async () => {
    try { await api('/api/files/' + sel.id, 'PUT', { content: text }); say('Saved. The new SHA-256 is recorded in the ledger.'); await open(sel); load() } catch (e) { say(e.message, true) }
  }
  const create = async () => {
    try { await api('/api/projects/' + pid + '/files', 'POST', { path: nf.path, content: nf.content, access: pick.new || {} }); say('File created. Access saved and logged in the ledger.'); setNf({ path: '', content: '', purpose: '' }); setPick((s) => ({ ...s, new: {} })); load() } catch (e) { say(e.message, true) }
  }
  const ask = async () => {
    try { await api('/api/projects/' + pid + '/file-requests', 'POST', nf); say('Request sent to the admin. If approved, the file appears here with the access the admin chooses.'); setNf({ path: '', content: '', purpose: '' }); load() } catch (e) { say(e.message, true) }
  }
  const setP = (k, uid, l) => setPick((s) => ({ ...s, [k]: { ...(s[k] || {}), [uid]: l } }))
  const setAll = (k, people, l) => setPick((s) => ({ ...s, [k]: Object.fromEntries(people.map((p) => [p.id, l])) }))
  const approve = async (r) => { try { await api('/api/lab/requests/' + r.id + '/approve', 'POST', { access: pick['r' + r.id] || {} }); say('Approved. File created and access saved in the ledger.'); load() } catch (e) { say(e.message, true) } }
  const reject = async (r) => { try { await api('/api/lab/requests/' + r.id + '/reject', 'POST', { reason: why[r.id] || '' }); say('Request rejected and the requester was told why.'); load() } catch (e) { say(e.message, true) } }
  const setLevel = async (p, level) => {
    try { await api('/api/files/' + sel.id + '/access', 'PUT', { user_id: p.id, level }); setSel((s) => ({ ...s, access: s.access.map((x) => (x.id === p.id ? { ...x, level } : x)) })); say('Access for ' + p.name + ' set to ' + level + '. Logged in the ledger.'); load() } catch (e) { say(e.message, true) }
  }

  const folders = {}
  files.forEach((f) => { const i = f.path.lastIndexOf('/'); const d = i < 0 ? '(root)' : f.path.slice(0, i); (folders[d] = folders[d] || []).push({ ...f, name: f.path.slice(i + 1) }) })
  const mine = files.filter((f) => f.level).length

  return (<>
    <div className="hint"><b>File access control.</b> Everyone on the project can see the file tree. You can open a file only if the admin gave you access. New files are created by the admin, or requested by members and approved by the admin, who decides for each person: Edit, Read or No access. Every denied attempt, grant and edit is written to the ledger.</div>
    {isAdmin && <div className="card"><h3>Pending file requests ({pending.length})</h3>
      {!pending.length && <div className="tiny">No pending requests for this project.</div>}
      {pending.map((r) => { const ch = pick['r' + r.id] || {}; const ok = r.people.every((p) => ch[p.id]); return (
        <div key={r.id} style={{ margin: '10px 0', padding: 10, borderLeft: '4px solid #f59e0b', background: 'rgba(255,255,255,.04)', borderRadius: 8 }}>
          <div><b>{r.name}</b> <span className="tiny">({r.language})</span></div>
          <div className="small">Requested by {r.requester} ({r.requester_role}): {r.purpose}</div>
          <div className="small" style={{ marginTop: 6 }}><b>Who gets what? (required for everyone)</b> <button className="sec" onClick={() => setAll('r' + r.id, r.people, 'read')}>All read</button> <button className="sec" onClick={() => setAll('r' + r.id, r.people, 'deny')}>All no access</button></div>
          {r.people.map((p) => <div key={p.id} className="small" style={{ margin: '4px 0' }}>{p.name} <span className="tiny">({p.role})</span> <Pick value={ch[p.id]} onChange={(l) => setP('r' + r.id, p.id, l)} /></div>)}
          <div className="row" style={{ marginTop: 8 }}><button disabled={!ok} onClick={() => approve(r)}>{ok ? 'Approve and create file' : 'Choose access for everyone first'}</button></div>
          <div className="row" style={{ marginTop: 6 }}><input placeholder="Reason (needed to reject)" value={why[r.id] || ''} onChange={(e) => setWhy((s) => ({ ...s, [r.id]: e.target.value }))} /><button className="sec" onClick={() => reject(r)}>Reject</button></div>
        </div>) })}
    </div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
      <div className="card">
        <h3>Project files <span className="tiny">({mine} of {files.length} open to you)</span></h3>
        {!files.length && <div className="tiny">No files yet, or you are not an accepted member (accept the charter first).</div>}
        {Object.keys(folders).sort().map((d) => <div key={d} style={{ margin: '10px 0' }}>
          <div className="small"><b>📁 {d}</b></div>
          {folders[d].map((f) => <div key={f.id} className="row" style={{ margin: '4px 0 4px 14px' }}>
            <button className="sec" style={{ flex: 1, textAlign: 'left' }} title={'created by ' + (f.owner || '?')} onClick={() => open(f)}>{f.level ? '🔓' : '🔒'} {f.name}{f.lab ? ' · Code Lab' : ''}</button>
            {f.level ? <Tag t={f.level === 'write' ? 'CAN EDIT' : 'READ ONLY'} c={f.level === 'write' ? 'green' : 'blue'} /> : <Tag t="NO ACCESS" c="red" />}
          </div>)}
        </div>)}
      </div>
      <div>
        {denied && <div className="card" style={{ borderColor: '#dc2626' }}><h3>🚫 Access denied</h3><div className="small">{denied.msg}</div><div className="tiny">This attempt was recorded in the ledger. Ask the sponsor, an admin, or a mentor who has access to grant it.</div></div>}
        {sel && <div className="card"><h3>{sel.path}</h3>
          <div className="row"><Tag t={sel.level === 'write' ? 'CAN EDIT' : 'READ ONLY'} c={sel.level === 'write' ? 'green' : 'blue'} /><span className="hash">sha256 {sel.sha256.slice(0, 16)}…</span></div>
          <textarea className="code" style={{ height: 240 }} value={text} readOnly={sel.level !== 'write'} onChange={(e) => setText(e.target.value)} />
          {sel.level === 'write' && <button onClick={save}>Save changes</button>}
          {sel.access && <div style={{ marginTop: 14 }}><h3>Access manager (admin)</h3>
            {sel.access.map((p) => <div key={p.id} className="small" style={{ margin: '6px 0' }}>{p.name} <span className="tiny">({p.role})</span> <Tag t={p.level === 'edit' ? 'CAN EDIT' : p.level === 'read' ? 'READ ONLY' : p.level === 'deny' ? 'NO ACCESS' : 'NOT SET'} c={p.level === 'edit' ? 'green' : p.level === 'read' ? 'blue' : 'red'} /> <Pick value={p.level} onChange={(l) => setLevel(p, l)} /></div>)}
            <div className="tiny">Members can open a file only after accepting the charter, even if you give them access.</div>
          </div>}
        </div>}
        {sel && (/\.py$/i.test(sel.path) || sel.language === 'python') && <TestLab file={sel} api={api} say={say} />}
        {!sel && !denied && <div className="card"><div className="tiny">Click a file in the tree to open it.</div></div>}
      </div>
    </div>
    <div className="card"><h3>{isAdmin ? 'Add a file' : 'Request a file'}</h3>
      <input placeholder="Path, e.g. module1-data/clean.py" value={nf.path} onChange={(e) => setNf({ ...nf, path: e.target.value })} />
      <textarea className="code" style={{ height: 110 }} placeholder={isAdmin ? 'File contents' : 'Starting contents (optional)'} value={nf.content} onChange={(e) => setNf({ ...nf, content: e.target.value })} />
      {!isAdmin && <input placeholder="What is this file for? (the admin reads this)" value={nf.purpose} onChange={(e) => setNf({ ...nf, purpose: e.target.value })} />}
      {isAdmin && ppl.length > 0 && <div style={{ margin: '8px 0' }}>
        <div className="small"><b>Who gets what? (required for everyone)</b> <button className="sec" onClick={() => setAll('new', ppl, 'read')}>All read</button> <button className="sec" onClick={() => setAll('new', ppl, 'deny')}>All no access</button></div>
        {ppl.map((p) => <div key={p.id} className="small" style={{ margin: '4px 0' }}>{p.name} <span className="tiny">({p.role})</span> <Pick value={(pick.new || {})[p.id]} onChange={(l) => setP('new', p.id, l)} /></div>)}
      </div>}
      <div className="row">
        {isAdmin
          ? <button disabled={!nf.path || !ppl.every((p) => (pick.new || {})[p.id])} onClick={create}>Create file</button>
          : <button disabled={!nf.path || !nf.purpose.trim()} onClick={ask}>Send request to admin</button>}
      </div>
      <div className="tiny">{isAdmin ? 'You choose Edit, Read or No access for each person. You can change it later from the file.' : 'Only the admin creates files. If approved, you get the access the admin picks for you.'}</div>
      {!isAdmin && myReqs.length > 0 && <div style={{ marginTop: 10 }}><b className="small">My requests</b>
        {myReqs.map((r) => <div key={r.id} className="small" style={{ margin: '4px 0' }}>{r.name} · <b style={{ color: r.status === 'REJECTED' ? '#f87171' : r.status === 'APPROVED' ? '#4ade80' : '#f59e0b' }}>{r.status}</b>{r.reject_reason ? ' · ' + r.reject_reason : ''}</div>)}
      </div>}
    </div>
  </>)
}
