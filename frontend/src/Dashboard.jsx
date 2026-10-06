import { useState, useEffect } from 'react'
const box = { background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12, padding: 14 }
const PAL = ['#a855f7', '#ec4899', '#38bdf8', '#4ade80', '#f59e0b', '#f87171']
const SC = { ACCEPTED: '#4ade80', REJECTED: '#f87171', SUBMITTED: '#38bdf8', FLAGGED: '#f59e0b', FUNDED: '#38bdf8', RELEASED: '#4ade80', PLANNED: '#94a3b8' }
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }
const kgrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 12 }
const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN')
const fmt = (n) => (n >= 1000 ? Math.round(n / 100) / 10 + 'k' : n)
const Empty = () => <div style={{ opacity: .6, fontSize: 13, padding: '18px 0' }}>No data yet.</div>
const Card = ({ title, sub, children }) => <div style={box}><b>{title}</b>{sub && <div style={{ fontSize: 11, opacity: .6 }}>{sub}</div>}<div style={{ marginTop: 8 }}>{children}</div></div>
const Kpi = ({ l, v }) => <div style={{ ...box, textAlign: 'center' }}><div style={{ fontSize: 26, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, opacity: .7 }}>{l}</div></div>
function Line({ series, max }) {
  const n = Math.max(0, ...series.map((s) => s.data.length))
  if (!n) return <Empty />
  const W = 320, H = 150, L = 32, R = 10, T = 12, B = 22
  const top = max || Math.max(1, ...series.flatMap((s) => s.data.map((d) => d.y))) * 1.15
  const x = (i) => L + (n === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1))
  const y = (v) => T + (H - T - B) * (1 - v / top)
  return (
    <div>
      <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%' }}>
        {[0, 0.5, 1].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(top * g)} y2={y(top * g)} stroke="rgba(255,255,255,.15)" /><text x={L - 4} y={y(top * g) + 3} fontSize="9" textAnchor="end" fill="currentColor" opacity=".6">{Math.round(top * g)}</text></g>)}
        {series.map((s, k) => <g key={k}>
          <polyline points={s.data.map((d, i) => x(i) + ',' + y(d.y)).join(' ')} fill="none" stroke={s.color} strokeWidth="2.5" />
          {s.data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.y)} r="4" fill={d.c || s.color}><title>{d.label + ': ' + d.y}</title></circle>)}
        </g>)}
        {Array.from({ length: n }, (_, i) => <text key={i} x={x(i)} y={H - 6} fontSize="9" textAnchor="middle" fill="currentColor" opacity=".6">{i + 1}</text>)}
      </svg>
      {series.length > 1 && <div style={{ fontSize: 12 }}>{series.map((s) => <span key={s.name} style={{ marginRight: 12 }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: s.color, marginRight: 5 }} />{s.name}</span>)}</div>}
    </div>
  )
}
function Bars({ items }) {
  if (!items.length) return <Empty />
  const W = 320, H = 150, L = 8, B = 30, T = 16
  const top = Math.max(1, ...items.map((d) => d.v)) * 1.15
  const slot = (W - L - 8) / items.length
  const bw = Math.min(44, slot - 8)
  return (
    <svg viewBox={'0 0 ' + W + ' ' + H} style={{ width: '100%' }}>
      {items.map((d, i) => { const cx = L + slot * i + slot / 2; const h = (H - T - B) * (d.v / top); return (
        <g key={i}>
          <rect x={cx - bw / 2} y={H - B - h} width={bw} height={Math.max(h, 1)} rx="4" fill={d.c || PAL[i % PAL.length]}><title>{(d.t || d.l) + ': ' + d.v}</title></rect>
          <text x={cx} y={H - B - h - 3} fontSize="9" textAnchor="middle" fill="currentColor">{fmt(d.v)}</text>
          <text x={cx} y={H - B + 12} fontSize="9" textAnchor="middle" fill="currentColor" opacity=".7">{String(d.l).slice(0, 10)}</text>
        </g>) })}
    </svg>
  )
}
function Donut({ items }) {
  const tot = items.reduce((s, d) => s + d.v, 0)
  if (!tot) return <Empty />
  const R = 40, C = 2 * Math.PI * R
  let off = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 120 120" style={{ width: 130 }}>
        <g transform="rotate(-90 60 60)">{items.map((d, i) => { const len = (d.v / tot) * C; const el = <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={d.c || PAL[i % PAL.length]} strokeWidth="18" strokeDasharray={len + ' ' + (C - len)} strokeDashoffset={-off}><title>{d.l + ': ' + d.v}</title></circle>; off += len; return el })}</g>
        <text x="60" y="65" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">{fmt(tot)}</text>
      </svg>
      <div style={{ fontSize: 13 }}>{items.map((d, i) => <div key={i}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: d.c || PAL[i % PAL.length], marginRight: 6 }} />{d.l}: {d.v}</div>)}</div>
    </div>
  )
}
function Radar({ axes }) {
  const cx = 100, cy = 100, R = 62, n = axes.length
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + (Math.cos(a) * R * v) / 10, cy + (Math.sin(a) * R * v) / 10] }
  const poly = (v) => axes.map((_, i) => pt(i, v).join(',')).join(' ')
  return (
    <svg viewBox="0 0 200 200" style={{ width: '100%', maxWidth: 260 }}>
      {[2.5, 5, 7.5, 10].map((v) => <polygon key={v} points={poly(v)} fill="none" stroke="rgba(255,255,255,.18)" />)}
      {axes.map((a, i) => { const [lx, ly] = pt(i, 12.6); return <text key={i} x={lx} y={ly + 3} fontSize="9" textAnchor="middle" fill="currentColor">{a.l}</text> })}
      <polygon points={axes.map((a, i) => pt(i, a.v).join(',')).join(' ')} fill="rgba(168,85,247,.35)" stroke="#a855f7" strokeWidth="2" />
      {axes.map((a, i) => { const [px, py] = pt(i, a.v); return <circle key={i} cx={px} cy={py} r="3.5" fill="#ec4899"><title>{a.l + ': ' + a.v}</title></circle> })}
    </svg>
  )
}
export default function Dashboard({ api, user }) {
  const [d, setD] = useState(null)
  useEffect(() => { const l = () => api('/api/dashboard').then(setD).catch(() => {}); l(); const t = setInterval(l, 8000); return () => clearInterval(t) }, [])
  if (!d) return <div style={box}>Loading…</div>
  const cnt = (rows) => rows.map((r) => ({ l: r.status, v: r.n, c: SC[r.status] }))
  const esc = (rows) => rows.map((r) => ({ l: r.status, v: r.total, c: SC[r.status] }))
  if (d.role === 'student') {
    let run = 0
    const cum = d.credit_series.map((r) => ({ y: (run += r.points), label: r.label }))
    const accepted = (d.status.find((s) => s.status === 'ACCEPTED') || { n: 0 }).n
    const avgI = d.impact_series.length ? (d.impact_series.reduce((s, r) => s + r.impact, 0) / d.impact_series.length).toFixed(1) : 0
    const r1 = (v) => Math.round(v * 10) / 10
    return (
      <div>
        <div style={kgrid}><Kpi l="Credits" v={run} /><Kpi l="Accepted work" v={accepted} /><Kpi l="Avg reviewed impact" v={avgI} /><Kpi l="Earned" v={inr(d.earned)} /></div>
        <div style={grid}>
          <Card title="Credits over time" sub="cumulative, from the AI Credit Agent"><Line series={[{ name: 'Credits', color: '#a855f7', data: cum }]} /></Card>
          <Card title="Reviewed impact per submission" sub="green = accepted, red = rejected"><Line max={10} series={[{ name: 'Impact', color: '#ec4899', data: d.impact_series.map((r) => ({ y: r.impact, label: r.label, c: SC[r.status] })) }]} /></Card>
          <Card title="Skill profile" sub="average Credit Agent scores (0 to 10)"><Radar axes={[{ l: 'Complexity', v: r1(d.dims.complexity) }, { l: 'Completeness', v: r1(d.dims.completeness) }, { l: 'Docs', v: r1(d.dims.documentation) }, { l: 'Initiative', v: r1(d.dims.initiative) }]} /></Card>
          <Card title="Submissions by status"><Donut items={cnt(d.status)} /></Card>
        </div>
      </div>
    )
  }
  if (d.role === 'expert') {
    const acc = d.reviews.filter((r) => r.decision === 'ACCEPTED').length
    const rej = d.reviews.length - acc
    const avg = (k) => (d.reviews.length ? (d.reviews.reduce((s, r) => s + r.quality * (k === 'q' ? 1 : 0) + r.impact * (k === 'i' ? 1 : 0), 0) / d.reviews.length).toFixed(1) : 0)
    return (
      <div>
        <div style={kgrid}><Kpi l="Reviews given" v={d.reviews.length} /><Kpi l="Pending reviews" v={d.pending} /><Kpi l="Acceptance rate" v={d.reviews.length ? Math.round((acc / d.reviews.length) * 100) + '%' : '-'} /><Kpi l="Projects" v={d.projects} /></div>
        <div style={grid}>
          <Card title="Scores I gave" sub="each point is one review"><Line max={10} series={[{ name: 'Quality', color: '#a855f7', data: d.reviews.map((r) => ({ y: r.quality, label: 'Quality' })) }, { name: 'Impact', color: '#ec4899', data: d.reviews.map((r) => ({ y: r.impact, label: 'Impact' })) }]} /></Card>
          <Card title="Decisions"><Donut items={[{ l: 'ACCEPTED', v: acc, c: SC.ACCEPTED }, { l: 'REJECTED', v: rej, c: SC.REJECTED }]} /></Card>
          <Card title="Average scores given"><Bars items={[{ l: 'Quality', v: +avg('q'), c: '#a855f7' }, { l: 'Impact', v: +avg('i'), c: '#ec4899' }]} /></Card>
        </div>
      </div>
    )
  }
  if (d.role === 'sponsor') {
    const budget = d.milestones.reduce((s, m) => s + m.amount, 0)
    const held = (d.escrow.find((e) => e.status === 'FUNDED') || { total: 0 }).total
    const rel = (d.escrow.find((e) => e.status === 'RELEASED') || { total: 0 }).total
    return (
      <div>
        <div style={kgrid}><Kpi l="Milestones" v={d.milestones.length} /><Kpi l="Total budget" v={inr(budget)} /><Kpi l="In escrow" v={inr(held)} /><Kpi l="Released" v={inr(rel)} /><Kpi l="Team members" v={d.team} /></div>
        <div style={grid}>
          <Card title="Milestone amounts" sub="color = status"><Bars items={d.milestones.map((m, i) => ({ l: 'M' + (i + 1), v: m.amount, c: SC[m.status], t: m.title + ' (' + m.status + ')' }))} /></Card>
          <Card title="Escrow by status (₹)"><Donut items={esc(d.escrow)} /></Card>
          <Card title="Team submissions by status"><Donut items={cnt(d.contrib)} /></Card>
        </div>
      </div>
    )
  }
  const byRole = Object.values(d.users.reduce((a, r) => { a[r.role] = a[r.role] || { l: r.role, v: 0 }; a[r.role].v += r.n; return a }, {}))
  const total = byRole.reduce((s, r) => s + r.v, 0)
  const pend = d.users.filter((r) => r.verification_status !== 'verified').reduce((s, r) => s + r.n, 0)
  return (
    <div>
      <div style={kgrid}><Kpi l="Users" v={total} /><Kpi l="Pending verification" v={pend} /><Kpi l="Projects" v={d.projects} /><Kpi l="Ledger entries" v={d.ledger_total} /><Kpi l="AI actions" v={d.ai_actions} /></div>
      <div style={grid}>
        <Card title="Users by role"><Bars items={byRole} /></Card>
        <Card title="Ledger activity" sub="top actions"><Bars items={d.ledger.map((r) => ({ l: r.action.replace(/_/g, ' ').toLowerCase(), v: r.n, t: r.action }))} /></Card>
        <Card title="Submissions by status"><Donut items={cnt(d.contrib)} /></Card>
        <Card title="Escrow by status (₹)"><Donut items={esc(d.escrow)} /></Card>
      </div>
    </div>
  )
}
