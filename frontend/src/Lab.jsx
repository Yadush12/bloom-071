import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
const box = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }
const LC = { edit: '#4ade80', read: '#38bdf8', deny: '#f87171', none: '#94a3b8', admin: '#a855f7' }
const LT = { edit: 'CAN EDIT', read: 'READ ONLY', deny: 'NO ACCESS', none: 'NO ACCESS', admin: 'ADMIN VIEW' }
const tag = (l) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: LC[l] + '33', color: LC[l], border: '1px solid ' + LC[l] })
const Pick = ({ value, onChange }) => <span>{['edit', 'read', 'deny'].map((l) => <button key={l} onClick={() => onChange(l)} style={{ marginLeft: 4, opacity: value === l ? 1 : .45, outline: value === l ? '2px solid ' + LC[l] : 'none' }}>{l === 'edit' ? 'Edit' : l === 'read' ? 'Read' : 'No access'}</button>)}</span>
export default function Lab({ api, user, say, pid }) {
  const isAdmin = user.role === 'admin'
  const canAsk = user.role === 'student' || user.role === 'expert'
  const [files, setFiles] = useState([])
  const [reqs, setReqs] = useState([])
  const [pending, setPending] = useState([])
  const [doc, setDoc] = useState(null)
  const [code, setCode] = useState('')
  const [dirty, setDirty] = useState(false)
  const [acc, setAcc] = useState([])
  const [form, setForm] = useState({ name: '', ext: '.py', directory: 'docs', newdir: '', purpose: '' })
  const [dirs, setDirs] = useState(['docs'])
  useEffect(() => { if (pid) api('/api/projects/' + pid + '/files').then((fl) => { const d = [...new Set(fl.map((f) => (f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '')).filter(Boolean))]; setDirs(d.length ? d : ['docs']) }).catch(() => {}) }, [pid])
  const [pick, setPick] = useState({})
  const [why, setWhy] = useState({})
  const load = useCallback(() => {
    if (pid) api('/api/lab/files?project_id=' + pid).then((r) => { setFiles(r.files); setReqs(r.requests) }).catch(() => {})
    if (isAdmin) api('/api/lab/requests').then(setPending).catch(() => {})
  }, [pid])
  useEffect(() => { setDoc(null); load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [pid])
  const open = async (f) => {
    try { const d = await api('/api/lab/files/' + f.id); setDoc(d); setCode(d.content); setDirty(false); if (isAdmin) setAcc(await api('/api/lab/files/' + f.id + '/access')) } catch (e) { setDoc(null); say(e.message, true) }
  }
  const save = async () => { try { const r = await api('/api/lab/files/' + doc.id + '/content', 'PUT', { content: code }); setDirty(false); setDoc({ ...doc, version: r.version }); say('Saved v' + r.version + '. Logged in the ledger.'); load() } catch (e) { say(e.message, true) } }
  const ask = async () => { try { await api('/api/lab/requests', 'POST', { project_id: +pid, name: form.name, ext: form.ext, directory: form.directory === '__new' ? form.newdir : form.directory, purpose: form.purpose }); say('Request sent to the admin. If approved, the file is created in the Files tab.'); setForm({ name: '', ext: '.py', directory: form.directory, newdir: '', purpose: '' }); load() } catch (e) { say(e.message, true) } }
  const approve = async (r) => { try { await api('/api/lab/requests/' + r.id + '/approve', 'POST', { access: pick[r.id] || {} }); say('Approved. Access saved and logged.'); load() } catch (e) { say(e.message, true) } }
  const reject = async (r) => { try { await api('/api/lab/requests/' + r.id + '/reject', 'POST', { reason: why[r.id] || '' }); say('Request rejected and the requester was told why.'); load() } catch (e) { say(e.message, true) } }
  const setLevel = async (p, level) => { try { await api('/api/lab/files/' + doc.id + '/access', 'PUT', { user_id: p.id, level }); setAcc((a) => a.map((x) => (x.id === p.id ? { ...x, level } : x))); say('Access for ' + p.name + ' set to ' + level + '. Logged.') } catch (e) { say(e.message, true) } }
  const setP = (rid, uid, l) => setPick((s) => ({ ...s, [rid]: { ...(s[rid] || {}), [uid]: l } }))
  return (
    <div>
      <div style={{ ...box, fontSize: 13 }}>Code Lab: files are created only after the admin approves the request and decides who can edit, read, or is denied. The admin can change anyone's access at any time, and every change is logged in the ledger.</div>
      {isAdmin && <div style={box}>
        <b>Pending file requests ({pending.length})</b>
        {pending.length === 0 && <div style={{ fontSize: 13, opacity: .6, margin: '6px 0' }}>No pending requests.</div>}
        {pending.map((r) => {
          const ch = pick[r.id] || {}
          const ok = r.people.every((p) => ch[p.id])
          return (
            <div key={r.id} style={{ margin: '10px 0', padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)', borderLeft: '4px solid #f59e0b' }}>
              <div><b>{r.name}</b> <span style={{ opacity: .7, fontSize: 12 }}>({r.language}) · {r.project}</span></div>
              <div style={{ fontSize: 13, margin: '4px 0' }}>Requested by {r.requester} ({r.requester_role}): {r.purpose}</div>
              <div style={{ fontSize: 13, marginTop: 8 }}><b>Who gets what? (required for everyone)</b></div>
              {r.people.map((p) => <div key={p.id} style={{ margin: '4px 0', fontSize: 13 }}>{p.name} <span style={{ opacity: .6 }}>({p.role})</span> <Pick value={ch[p.id]} onChange={(l) => setP(r.id, p.id, l)} /></div>)}
              <div style={{ marginTop: 8 }}><button disabled={!ok} onClick={() => approve(r)}>{ok ? 'Approve and save access' : 'Choose access for everyone first'}</button></div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input style={{ flex: 1, minWidth: 180 }} placeholder="Reason (needed to reject)" value={why[r.id] || ''} onChange={(e) => setWhy((s) => ({ ...s, [r.id]: e.target.value }))} />
                <button onClick={() => reject(r)}>Reject</button>
              </div>
            </div>)
        })}
      </div>}
      {!pid ? <div style={box}>Open a project first (Project & charter tab).</div> : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...box, flex: '0 0 280px', minWidth: 240 }}>
          <b>Files ({files.length})</b>
          {files.length === 0 && <div style={{ fontSize: 13, opacity: .6, margin: '6px 0' }}>No files yet.</div>}
          {files.map((f) => (
            <div key={f.id} onClick={() => open(f)} style={{ cursor: 'pointer', padding: '8px 6px', margin: '6px 0', borderRadius: 8, background: doc && doc.id === f.id ? 'rgba(168,85,247,.3)' : 'rgba(255,255,255,.04)' }}>
              <div style={{ fontSize: 14 }}>{f.level === 'edit' || f.level === 'read' || f.level === 'admin' ? '📄' : '🔒'} {f.name}</div>
              <div style={{ marginTop: 3 }}><span style={tag(f.level)}>{LT[f.level]}</span> <span style={{ fontSize: 11, opacity: .6 }}>v{f.version}</span></div>
            </div>))}
        </div>
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={box}>
            {!doc ? <div style={{ opacity: .6, fontSize: 13 }}>Click a file to open it. Locked files are logged as denied attempts.</div> : <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <span><b>{doc.name}</b> <span style={tag(doc.level)}>{LT[doc.level]}</span> <span style={{ fontSize: 11, opacity: .6 }}>v{doc.version}</span></span>
                {doc.level === 'edit' && <button onClick={save} disabled={!dirty}>{dirty ? 'Save' : 'Saved'}</button>}
              </div>
              <Editor key={doc.id} height="340px" theme="vs-dark" language={doc.language} value={code} onChange={(v) => { setCode(v || ''); setDirty(true) }} options={{ readOnly: doc.level !== 'edit', minimap: { enabled: false }, fontSize: 14 }} />
              {doc.content_hash && <div style={{ fontSize: 11, opacity: .5, marginTop: 6 }}>SHA-256 of last save: {doc.content_hash.slice(0, 24)}…</div>}
            </>}
          </div>
          {isAdmin && doc && <div style={box}>
            <b>Access manager for {doc.name}</b>
            {acc.map((p) => <div key={p.id} style={{ margin: '6px 0', fontSize: 13 }}>{p.name} <span style={{ opacity: .6 }}>({p.role})</span> <span style={tag(p.level)}>{p.level === 'none' ? 'NOT SET' : LT[p.level]}</span> <Pick value={p.level} onChange={(l) => setLevel(p, l)} /></div>)}
          </div>}
          {canAsk && <div style={box}>
            <b>Request a new file</b>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' }}>
              <select value={form.directory} onChange={(e) => setForm({ ...form, directory: e.target.value })}>{dirs.map((d) => <option key={d} value={d}>📁 {d}</option>)}<option value="__new">➕ New folder…</option><option value="">(no folder, top level)</option></select>
              {form.directory === '__new' && <input style={{ minWidth: 140 }} placeholder="New folder, e.g. module4-eval" value={form.newdir} onChange={(e) => setForm({ ...form, newdir: e.target.value })} />}
              <input style={{ flex: 1, minWidth: 140 }} placeholder="File name, e.g. augment" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select value={form.ext} onChange={(e) => setForm({ ...form, ext: e.target.value })}>{['.py', '.js', '.md', '.txt', '.json'].map((x) => <option key={x}>{x}</option>)}</select>
            </div>
            <textarea style={{ width: '100%', minHeight: 60 }} placeholder="What is this file for? (the admin reads this)" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            <div style={{ marginTop: 8 }}><button onClick={ask}>Send request to admin</button></div>
            {reqs.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>My requests</b>
              {reqs.map((r) => <div key={r.id} style={{ fontSize: 13, margin: '4px 0' }}>{r.name} · <b style={{ color: r.status === 'REJECTED' ? '#f87171' : r.status === 'APPROVED' ? '#4ade80' : '#f59e0b' }}>{r.status}</b>{r.status === 'APPROVED' ? ' · now in the Files tab' : ''}{r.reject_reason ? ' · ' + r.reject_reason : ''}</div>)}
            </div>}
          </div>}
        </div>
      </div>}
    </div>
  )
}
