import { useState, useEffect } from 'react'
const box = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }
const chip = { display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: 'rgba(168,85,247,.28)', marginRight: 6, marginBottom: 4, fontSize: 12 }
const Bar = ({ w, c }) => <div style={{ height: 10, borderRadius: 5, background: c, width: Math.max(2, w) + '%' }} />
export default function Profile({ api, user, say }) {
  const [list, setList] = useState([])
  const [sel, setSel] = useState(user.id)
  const [p, setP] = useState(null)
  const [pid, setPid] = useState('')
  useEffect(() => { api('/api/people').then(setList).catch((e) => say(e.message, true)) }, [])
  useEffect(() => { setP(null); api('/api/people/' + sel).then((r) => { setP(r); if (r.my_projects && r.my_projects[0]) setPid(r.my_projects[0].id) }).catch((e) => say(e.message, true)) }, [sel])
  const send = async () => { try { await api('/api/people/' + sel + '/request', 'POST', { project_id: +pid }); say('Project request sent. They must accept the charter before seeing the brief.') } catch (e) { say(e.message, true) } }
  const maxC = p ? Math.max(1, ...p.series.map((s) => s.commits)) : 1
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      <div style={{ ...box, minWidth: 190, flex: '0 0 190px' }}>
        {list.map((x) => <div key={x.id} onClick={() => setSel(x.id)} style={{ cursor: 'pointer', padding: '6px 4px', fontWeight: x.id === sel ? 700 : 400 }}>{x.name}<div style={{ fontSize: 11, opacity: .6 }}>{x.role}</div></div>)}
      </div>
      <div style={{ flex: 1, minWidth: 280 }}>
        {!p ? <div style={box}>Loading…</div> : <>
          <div style={box}>
            <h2 style={{ margin: 0 }}>{p.name} <span style={{ fontSize: 13, opacity: .7 }}>({p.role}) {p.verification_status === 'verified' ? '✔ verified' : '⏳ ' + p.verification_status}</span></h2>
            <div style={{ margin: '8px 0' }}>{(p.skills || []).map((s) => <span key={s} style={chip}>{s}</span>)}</div>
            <div style={{ fontSize: 13, opacity: .8 }}>Availability: {p.availability || 'n/a'}</div>
            {p.earned !== undefined && <div style={{ fontSize: 13 }}>Earned (visible only to you/admin): ₹{p.earned.toLocaleString('en-IN')}</div>}
            {user.role === 'sponsor' && p.role !== 'sponsor' && p.my_projects && p.my_projects.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <select value={pid} onChange={(e) => setPid(e.target.value)}>{p.my_projects.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>{' '}
                <button onClick={send}>Invite to project</button>
              </div>)}
          </div>
          {p.role !== 'sponsor' && <>
            <div style={box}>
              <b>Reviewed performance</b>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '8px 0', fontSize: 14 }}>
                <span>Accepted: <b>{p.stats.accepted}</b></span><span>Impact: <b>{p.stats.impact}</b></span><span>Quality: <b>{p.stats.quality}</b></span><span>Effort: <b>{p.stats.effort}</b></span><span>Ledger events: <b>{p.stats.ledger_events}</b></span>
              </div>
            </div>
            <div style={box}>
              <b>Expertise</b> <span style={{ fontSize: 12, opacity: .6 }}>(declared skill, bar = accepted work using it)</span>
              {p.expertise.map((e) => <div key={e.skill} style={{ margin: '6px 0', fontSize: 13 }}>{e.skill} ({e.evidence})<Bar w={20 + e.evidence * 30} c="#a855f7" /></div>)}
            </div>
            <div style={box}>
              <b>Impact vs commits</b> <span style={{ fontSize: 12, opacity: .6 }}>commits are shown for transparency and are never used for rewards</span>
              {p.series.length === 0 && <div style={{ fontSize: 13, opacity: .6, margin: '6px 0' }}>No accepted contributions yet.</div>}
              {p.series.map((s, i) => <div key={i} style={{ margin: '8px 0', fontSize: 12 }}>{s.label}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 70, opacity: .5, textDecoration: 'line-through' }}>{s.commits} commits</span><div style={{ flex: 1 }}><Bar w={s.commits / maxC * 100} c="rgba(255,255,255,.2)" /></div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 70 }}>impact {s.impact}</span><div style={{ flex: 1 }}><Bar w={s.impact * 10} c="#ec4899" /></div></div>
              </div>)}
            </div>
          </>}
          <div style={box}>
            <b>{p.role === 'sponsor' ? 'Posted projects' : 'Projects'}</b>
            {(p.role === 'sponsor' ? p.posted : p.projects).map((x, i) => <div key={i} style={{ fontSize: 13, margin: '4px 0' }}>{x.title} <span style={{ opacity: .6 }}>· {x.role || x.engagement_model} · {x.status}</span></div>)}
            <div style={{ fontSize: 11, opacity: .5, marginTop: 6 }}>Only public titles are shown. Confidential briefs never appear on profiles.</div>
          </div>
          {p.credentials.length > 0 && <div style={box}><b>Credentials</b>{p.credentials.map((c, i) => <div key={i} style={{ fontSize: 13, margin: '4px 0' }}>🎓 {c.credential_type} — {c.project}</div>)}</div>}
        </>}
      </div>
    </div>
  )
}
