import { useState, useEffect } from 'react'

export function fireConfetti() {
  const c = document.createElement('canvas')
  c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  c.width = window.innerWidth; c.height = window.innerHeight
  document.body.appendChild(c)
  const ctx = c.getContext('2d')
  const colors = ['#a855f7', '#ec4899', '#f472b6', '#c084fc', '#fbbf24', '#34d399', '#60a5fa']
  const ps = Array.from({ length: 170 }, () => ({ x: c.width / 2 + (Math.random() - 0.5) * 240, y: c.height * 0.38, vx: (Math.random() - 0.5) * 17, vy: -Math.random() * 14 - 4, s: Math.random() * 7 + 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, col: colors[(Math.random() * colors.length) | 0] }))
  let t = 0
  const tick = () => {
    t++
    ctx.clearRect(0, 0, c.width, c.height)
    ps.forEach((p) => { p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.globalAlpha = Math.max(0, 1 - t / 170); ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore() })
    if (t < 170) requestAnimationFrame(tick); else c.remove()
  }
  tick()
}

const PALETTE = ['#a855f7', '#ec4899', '#38bdf8', '#fbbf24', '#34d399', '#f87171', '#818cf8']

export function SplitDonut({ r }) {
  const [go, setGo] = useState(false)
  useEffect(() => { const t = setTimeout(() => setGo(true), 60); return () => clearTimeout(t) }, [])
  const parts = [
    { name: 'Platform fee', v: r.platform_fee },
    { name: 'AI compute reserve', v: r.ai_compute_reserve },
    ...(r.experts || []).map((x) => ({ name: x.name + ' (expert)', v: x.amount })),
    ...(r.students || []).map((x) => ({ name: x.name, v: x.amount })),
  ].filter((p) => Number(p.v) > 0)
  const total = parts.reduce((s, p) => s + Number(p.v), 0)
  if (!total) return null
  const C = 2 * Math.PI * 54
  let acc = 0
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 140 140" width="170" height="170" className="donut">
        <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="18" />
        {parts.map((p, i) => {
          const len = (Number(p.v) / total) * C
          const off = acc
          acc += len
          return <circle key={i} cx="70" cy="70" r="54" fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="18" strokeDasharray={(go ? Math.max(len - 2, 0) : 0) + ' ' + C} strokeDashoffset={-off} transform="rotate(-90 70 70)" style={{ transition: 'stroke-dasharray 1s ease ' + i * 0.12 + 's' }} />
        })}
        <text x="70" y="66" textAnchor="middle" className="donut-n">{'₹' + Number(total).toLocaleString('en-IN')}</text>
        <text x="70" y="82" textAnchor="middle" className="donut-s">where it goes</text>
      </svg>
      <div className="donut-legend">
        {parts.map((p, i) => <div key={i} className="small"><span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} />{p.name} <b>{'₹' + Number(p.v).toLocaleString('en-IN')}</b> <span className="tiny">{Math.round((Number(p.v) / total) * 100)}%</span></div>)}
      </div>
    </div>
  )
}

export function ChainStrip({ api }) {
  const [ev, setEv] = useState([])
  const [v, setV] = useState(null)
  useEffect(() => {
    let live = true
    const load = async () => {
      try { const e = await api('/api/ledger'); const vv = await api('/api/ledger/verify'); if (live) { setEv(e); setV(vv) } } catch (x) { /* ignore */ }
    }
    load()
    const t = setInterval(load, 3000)
    return () => { live = false; clearInterval(t) }
  }, [api])
  const bad = (id) => v && !v.valid && id >= v.broken_at
  return (
    <div className="card"><h3>🔗 Hash chain, visualised</h3>
      <div className="tiny">Each block stores the hash of the block before it. Change one old block and every block after it stops matching.</div>
      <div className="chainstrip">
        {ev.slice(-30).map((e, i) => (
          <div key={e.id} className="blk-wrap">
            {i > 0 && <span className={'link ' + (bad(e.id) ? 'bad' : '')} />}
            <div className={'blk ' + (bad(e.id) ? 'bad' : '')} title={e.action}><b>#{e.id}</b><span>{e.hash.slice(0, 6)}</span><em>{e.action.replace(/_/g, ' ').toLowerCase().slice(0, 14)}</em></div>
          </div>
        ))}
      </div>
      {v && <div className={'chain ' + (v.valid ? 'good' : 'bad')}>{v.valid ? 'All ' + v.checked + ' blocks verify' : 'Chain broken at block #' + v.broken_at + ': every block after it is untrusted'}</div>}
    </div>
  )
}
