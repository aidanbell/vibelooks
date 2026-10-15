import { useMemo, useState } from 'react'
import { AGENTS, fmtPct, type Agent, type Group, type Trends as TrendData } from '../data'

// One colour per line slot (palette series 1-8). Lines are the top options of the chosen metric.
const SLOTS = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`)
const TOP = 8

// Weeks with fewer repos than this are too noisy to plot.
const MIN_N = 30

const wk = (s: string) =>
  new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

// Average of the non-null points in a slice, or null if there are none.
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export function Trends({ trends, group, onGroup }: { trends: TrendData; group: Group; onGroup: (g: Group) => void }) {
  const { weeks } = trends
  const [m, setM] = useState(() => Math.max(0, trends.metrics.findIndex((x) => x.title === 'Styling / UI')))
  const [off, setOff] = useState<Set<string>>(new Set())
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  // Biggest movers: change in an agent's share between the first and last quarter of the period.
  const movers = useMemo(() => {
    const k = Math.max(1, Math.floor(weeks.length / 4))
    const out: { m: number; l: number; agent: Agent; from: number; to: number }[] = []
    trends.metrics.forEach((metric, m) => {
      if (metric.title === 'Agent config files') return
      metric.labels.forEach((lab, l) => {
        for (const a of AGENTS) {
          const ok = (i: number) => metric.n[a.id][i] >= MIN_N
          const first = avg(lab.pct[a.id].slice(0, k).map((v, i) => (ok(i) ? v : null)))
          const last = avg(lab.pct[a.id].slice(-k).map((v, i) => (ok(weeks.length - k + i) ? v : null)))
          if (first !== null && last !== null && Math.max(first, last) >= 0.05) out.push({ m, l, agent: a.id, from: first, to: last })
        }
      })
    })
    return out.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from)).slice(0, 8)
  }, [trends, weeks.length])

  const metric = trends.metrics[m]
  const n = metric.n[group]
  const val = (pct: (number | null)[], i: number) => (n[i] >= MIN_N ? pct[i] : null)

  // The top options for this metric within the selected group, ranked by average weekly share.
  const top = useMemo(
    () =>
      metric.labels
        .map((l) => ({ label: l.label, pct: l.pct[group], mean: avg(l.pct[group].map((v, i) => (n[i] >= MIN_N ? v : null))) ?? 0 }))
        .sort((a, b) => b.mean - a.mean)
        .slice(0, TOP)
        .map((l, i) => ({ ...l, color: SLOTS[i] })),
    [metric, group, n],
  )

  if (weeks.length < 3) {
    return <p className="text-sm text-muted">Trends need at least three weeks of data; this crawl covers {weeks.length}.</p>
  }

  const shown = top.filter((l) => !off.has(l.label))
  const groupName = group === 'all' ? 'all agents' : AGENTS.find((a) => a.id === group)!.name
  const noun = metric.title === 'Accent colour' || metric.title === 'Fonts' ? 'scanned' : 'frontend'

  // Chart geometry
  const W = 720, H = 300, L = 44, R = 16, T = 12, B = 28
  const all = shown.flatMap((l) => weeks.map((_, i) => val(l.pct, i))).filter((v): v is number => v !== null)
  const ymax = Math.min(1, Math.max(0.05, Math.ceil((Math.max(0, ...all) * 1.1) / 0.05) * 0.05))
  const x = (i: number) => L + (i * (W - L - R)) / (weeks.length - 1)
  const y = (v: number) => T + (1 - v / ymax) * (H - T - B)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * ymax)
  const xEvery = Math.ceil(weeks.length / 8)

  const path = (pct: (number | null)[]) => {
    let d = ''
    let pen = false
    weeks.forEach((_, i) => {
      const v = val(pct, i)
      if (v === null) pen = false
      else {
        d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
        pen = true
      }
    })
    return d
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.min(weeks.length - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (weeks.length - 1)))))
  }

  
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <select
            aria-label="Metric"
            value={m}
            onChange={(e) => {
              setM(Number(e.target.value))
              setOff(new Set())
            }}
            className="rounded-md border border-border bg-page px-2 py-1.5 text-sm text-ink"
          >
            {trends.metrics.map((mm, i) => (
              <option key={mm.title} value={i}>
                {mm.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setTable(!table)} className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-track">
            {table ? 'Chart' : 'Table'}
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {top.map((l) => (
            <button
              key={l.label}
              type="button"
              aria-pressed={!off.has(l.label)}
              onClick={() => {
                const next = new Set(off)
                if (!next.delete(l.label)) next.add(l.label)
                setOff(next)
              }}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1 text-sm ${off.has(l.label) ? 'text-muted line-through' : 'text-ink-2'} hover:bg-track`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color, opacity: off.has(l.label) ? 0.3 : 1 }} />
              {l.label}
            </button>
          ))}
        </div>

        {table ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="pb-2 font-normal">Week of</th>
                  {top.map((l) => (
                    <th key={l.label} className="pb-2 text-right font-normal">
                      {l.label}
                    </th>
                  ))}
                  <th className="pb-2 text-right font-normal">n</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w, i) => (
                  <tr key={w} className="border-t border-hairline text-ink-2">
                    <td className="py-1.5">{wk(w)}</td>
                    {top.map((l) => (
                      <td key={l.label} className="py-1.5 text-right">
                        {val(l.pct, i) === null ? '·' : fmtPct(val(l.pct, i)!)}
                      </td>
                    ))}
                    <td className="py-1.5 text-right text-xs text-muted">{n[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full touch-none"
              role="img"
              aria-label={`Weekly share of ${groupName} repos using each of the top ${metric.title} options`}
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--hairline)" />
                  <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              {weeks.map((w, i) =>
                i % xEvery === 0 ? (
                  <text key={w} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    {wk(w)}
                  </text>
                ) : null,
              )}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--muted)" strokeDasharray="3 3" />}
              {shown.map((l) => (
                <g key={l.label}>
                  <path d={path(l.pct)} fill="none" stroke={l.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && val(l.pct, hover) !== null && (
                    <circle cx={x(hover)} cy={y(val(l.pct, hover)!)} r="4.5" fill={l.color} stroke="var(--surface)" strokeWidth="2" />
                  )}
                </g>
              ))}
            </svg>
            {hover !== null && (
              <div
                role="tooltip"
                className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm"
                style={hover > weeks.length / 2 ? { right: '4.5rem' } : { left: '4.5rem' }}
              >
                <div className="mb-1 text-muted">Week of {wk(weeks[hover])}</div>
                {[...shown]
                  .sort((p, q) => (val(q.pct, hover) ?? -1) - (val(p.pct, hover) ?? -1))
                  .map((l) => (
                    <div key={l.label} className="flex items-center gap-2 tabular-nums text-ink">
                      <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
                      <span className="w-28 truncate text-ink-2">{l.label}</span>
                      {val(l.pct, hover) === null ? <span className="text-muted">too few</span> : fmtPct(val(l.pct, hover)!)}
                    </div>
                  ))}
                <div className="mt-1 text-muted">n={n[hover]} repos</div>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Share of {groupName}'s {noun} repos found that week, for the {TOP} most common options. Weeks with fewer than {MIN_N} repos
          are left blank.
        </p>
      </div>

      {movers.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="text-[15px] font-semibold text-ink">Biggest movers</h3>
          <p className="mt-0.5 mb-3 text-xs text-muted">Change in share between the first and last quarter of the period. Click to view that agent and metric.</p>
          <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {movers.map((mv) => {
              const d = mv.to - mv.from
              return (
                <li key={`${mv.m}-${mv.l}-${mv.agent}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setM(mv.m)
                      setOff(new Set())
                      onGroup(mv.agent)
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-track"
                  >
                                        <span className="min-w-0 flex-1 truncate text-ink-2">
                      {AGENTS.find((a) => a.id === mv.agent)!.name} · {trends.metrics[mv.m].labels[mv.l].label}
                    </span>
                    <span className="tabular-nums text-ink">
                      {fmtPct(mv.from)} → {fmtPct(mv.to)}
                    </span>
                    <span aria-hidden className="w-4 text-center">
                      {d > 0 ? '▲' : '▼'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
