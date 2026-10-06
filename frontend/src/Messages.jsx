import { useState, useEffect, useCallback, useRef } from 'react'
const box = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }
export default function Messages({ api, user, say, pid }) {
  const [msgs, setMsgs] = useState([])
  const [ppl, setPpl] = useState([])
  const [fb, setFb] = useState([])
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [cid, setCid] = useState(null)
  const [showOld, setShowOld] = useState(false)
  const base = useRef(null)
  const scroller = useRef(null)
  const load = useCallback(() => {
    if (!pid) return
    api('/api/projects/' + pid + '/messages').then((r) => { if (base.current === null) base.current = r.length ? r[r.length - 1].id : 0; setMsgs(r) }).catch(() => {})
    api('/api/my-feedback').then((r) => setFb(r.filter((x) => +x.project_id === +pid))).catch(() => {})
  }, [pid])
  useEffect(() => {
    if (!pid) return
    base.current = null
    setShowOld(false)
    api('/api/projects/' + pid + '/people').then(setPpl).catch(() => {})
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [pid])
  const shown = showOld ? msgs : msgs.filter((m) => m.id > base.current)
  const hidden = msgs.length - shown.length
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight }, [shown.length])
  const send = async () => { try { await api('/api/projects/' + pid + '/messages', 'POST', { recipient_id: to || null, body: text, contribution_id: cid }); setText(''); setCid(null); load() } catch (e) { say(e.message, true) } }
  const reply = (f) => { setTo(String(f.reviewer_id)); setCid(f.contribution_id); setText('Re: "' + f.milestone + '" - ') }
  if (!pid) return <div style={box}>Open a project first.</div>
  return (
    <div>
      {fb.length > 0 && <div style={box}>
        <b>Review feedback on my work</b>
        {fb.map((f) => (
          <div key={f.id} style={{ margin: '10px 0', padding: 10, borderRadius: 10, borderLeft: '4px solid ' + (f.decision === 'REJECTED' ? '#f87171' : '#4ade80'), background: 'rgba(255,255,255,.04)' }}>
            <div style={{ fontSize: 13 }}><b style={{ color: f.decision === 'REJECTED' ? '#f87171' : '#4ade80' }}>{f.decision}</b> · {f.milestone} · reviewed by {f.reviewer}</div>
            <div style={{ margin: '6px 0' }}>Reason: {f.comments}</div>
            <div style={{ fontSize: 12, opacity: .7 }}>Quality {f.quality} · Impact {f.impact}</div>
            <button style={{ marginTop: 6 }} onClick={() => reply(f)}>Reply to {f.reviewer}</button>
          </div>))}
      </div>}
      <div style={box}>
        <b>Project messages</b>
        {hidden > 0 && !showOld && <div style={{ margin: '8px 0' }}><button onClick={() => setShowOld(true)}>Show earlier messages ({hidden})</button></div>}
        {showOld && <div style={{ margin: '8px 0' }}><button onClick={() => setShowOld(false)}>Hide earlier messages</button></div>}
        <div ref={scroller} style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
          {shown.length === 0 && <div style={{ opacity: .6, fontSize: 13 }}>No new messages. Say something below.</div>}
          {shown.map((m) => (
            <div key={m.id} style={{ alignSelf: m.sender_id === user.id ? 'flex-end' : 'flex-start', maxWidth: '75%', padding: '8px 12px', borderRadius: 12, background: m.sender_id === user.id ? 'rgba(168,85,247,.35)' : 'rgba(255,255,255,.08)' }}>
              <div style={{ fontSize: 11, opacity: .7 }}>{m.sender_name} → {m.recipient_name || 'Whole team'} · {new Date(m.created_at).toLocaleTimeString()}</div>
              <div>{m.body}</div>
            </div>))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Whole team</option>
            {ppl.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
          </select>
          <input style={{ flex: 1, minWidth: 180 }} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} placeholder="Write a message…" />
          <button onClick={send}>Send</button>
        </div>
      </div>
    </div>
  )
}
