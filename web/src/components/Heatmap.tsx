import { useState } from 'react'
import { AGENTS, fmtPct, pctOf, type Summary } from '../data'

// Blue sequential ramp (dataviz reference palette), light -> dark.
const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95']

export type Signal = { title: string; label: string; name: string }

// Agents x signals. Shading is relative within each row (min -> max across agents),
// because the point is which agent leans hardest on each habit, not the absolute level.
export function Heatmap({ summary, signals }: { summary: Summary; signals: Signal[] }) {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface p-5">
      <table className="w-full min-w-[34rem] border-separate border-spacing-[2px] text-sm tabular-nums">
        <thead>
          <tr>
            <th />
            {AGENTS.map((a) => (
              <th key={a.id} className="px-2 pb-2 text-center text-xs font-medium text-ink-2">
                {a.name}
              </th>
            ))}
            <th className="px-2 pb-2 text-right text-xs font-medium text-muted">All</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const vals = AGENTS.map((a) => pctOf(summary, s.title, s.label, a.id))
            const lo = Math.min(...vals)
            const hi = Math.max(...vals)
            return (
              <tr key={s.name}>
                <th scope="row" className="pr-3 text-left text-sm font-normal whitespace-nowrap text-ink-2">
                  {s.name}
                </th>
                {vals.map((v, i) => {
                  const t = hi > lo ? (v - lo) / (hi - lo) : 0.5
                  const step = Math.round(t * (RAMP.length - 1))
                  const id = `${s.name}-${AGENTS[i].id}`
                  return (
                    <td
                      key={id}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                      title={`${AGENTS[i].name}: ${fmtPct(v)} of repos · ${s.name}`}
                      className={`h-9 rounded-[4px] text-center text-[13px] ${hover === id ? 'outline-2 outline-ink' : ''}`}
                      style={{ background: RAMP[step], color: step >= 6 ? '#ffffff' : '#0b0b0b' }}
                    >
                      {fmtPct(v)}
                    </td>
                  )
                })}
                <td className="pl-2 text-right text-muted">{fmtPct(pctOf(summary, s.title, s.label))}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">
        Darker = that agent's repos use it more, relative to the other agents in the same row.
      </p>
    </div>
  )
}
