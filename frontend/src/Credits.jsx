import { useState, useEffect, useCallback } from 'react'
const box = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14, marginBottom: 12 }
const chip = (c) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: c, fontSize: 12, marginRight: 6 })
const Bar = ({ w, c }) => <div style={{ height: 10, borderRadius: 5, background: c, width: Math.max(2, Math.min(100, w)) + '%' }} />
const LC = { Spark: '#64748b', Builder: '#0ea5e9', Contender: '#a855f7', Pioneer: '#f59e0b' }
const SRC = { 'qwen3:8b': 'AI Credit Agent (qwen3:8b)', 'rules-fallback': 'Rule-based fallback', 'synthetic-demo': 'Synthetic demo history' }
const DIMS = [['complexity', 'Complexity'], ['completeness', 'Completeness'], ['documentation', 'Documentation'], ['initiative', 'Initiative']]
export default function Credits({ api, user }) {
  const [d, setD] = useState(null)
  const load = useCallback(() => api('/api/credits/me').then(setD).catch(() => {}), [])
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t) }, [])
  if (!d) return <div style={box}>Loading…</div>
  const lv = d.level
  const pct = lv.ceil > lv.floor ? ((d.total - lv.floor) / (lv.ceil - lv.floor)) * 100 : 100
  const amb = d.ambition >= 7 ? 'Ambitious' : d.ambition >= 4 ? 'Driven' : 'Steady'
  return (
    <div>
      {user.role === 'student' ? <>
        <div style={box}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <div><div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>{d.total}</div><div style={{ fontSize: 12, opacity: .7 }}>credits earned</div></div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <span style={chip(LC[lv.name])}>{lv.name}</span><span style={chip('rgba(255,255,255,.12)')}>Rank #{d.rank} of {d.cohort}</span>
              {d.bonus_eligible && <span style={chip('rgba(74,222,128,.3)')}>Bonus-eligible (future)</span>}
              <div style={{ margin: '8px 0 4px' }}><Bar w={pct} c="linear-gradient(90deg,#a855f7,#ec4899)" /></div>
              <div style={{ fontSize: 12, opacity: .7 }}>{lv.next ? lv.to_next + ' credits to ' + lv.next : 'Top level reached'}</div>
            </div>
            <div style={{ textAlign: 'center' }}><div style={{ fontSize: 22, fontWeight: 700 }}>{amb}</div><div style={{ fontSize: 12, opacity: .7 }}>ambition ({d.ambition}/10)</div></div>
          </div>
          {d.pending > 0 && <div style={{ fontSize: 12, marginTop: 8, opacity: .8 }}>⏳ Credit Agent is assessing {d.pending} submission(s)…</div>}
        </div>
        <div style={box}>
          <b>Average score by dimension</b>
          {DIMS.map(([k, l]) => <div key={k} style={{ margin: '6px 0', fontSize: 13 }}>{l} ({d.dims[k]}/10)<Bar w={d.dims[k] * 10} c="#a855f7" /></div>)}
        </div>
        <div style={box}>
          <b>Credit history</b>
          {d.history.length === 0 && <div style={{ fontSize: 13, opacity: .6, margin: '6px 0' }}>No credits yet. Submit work in the Workspace tab.</div>}
          {d.history.map((h) => (
            <div key={h.id} style={{ margin: '10px 0', padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span><b>{h.label}</b></span><span style={{ fontWeight: 700, color: h.status === 'HELD' ? '#f59e0b' : '#4ade80' }}>{h.status === 'HELD' ? 'HELD' : '+' + h.points}</span></div>
              <div style={{ fontSize: 12, opacity: .7 }}>{SRC[h.source] || h.source} · C{Number(h.complexity)} · F{Number(h.completeness)} · D{Number(h.documentation)} · I{Number(h.initiative)}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{h.reasoning}</div>
            </div>))}
        </div>
      </> : <div style={box}>Credits are earned by students. Here is the cohort leaderboard.</div>}
      <div style={box}>
        <b>Leaderboard</b>
        {d.board.map((b, i) => <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: b.id === user.id ? 700 : 400 }}><span>#{i + 1} {b.name} <span style={chip(LC[b.level])}>{b.level}</span></span><span>{b.total}</span></div>)}
      </div>
      <div style={{ ...box, fontSize: 12, opacity: .75 }}>
        How it works: an AI Credit Agent rates each submission on complexity, completeness, documentation and initiative (expert scores and commit counts are not used). Points = weighted score × 10, capped for tiny submissions, ×0.85 if AI use was declared, held if similarity is flagged. Every assessment is logged in the ledger as an AI action with the student as human owner. Credits do not change the escrow split. In production a sponsor could fund a bonus pool for top credit earners; no money moves in this prototype.
      </div>
    </div>
  )
}
