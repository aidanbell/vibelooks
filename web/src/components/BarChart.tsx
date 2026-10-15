import { useState, type ReactNode } from 'react'
import { fmtPct, type Group, type Metric } from '../data'

type Props = {
  metric: Metric
  group: Group
  title?: string
  note?: string
  limit?: number
  // Rename or drop labels ("(none)" -> "Plain React"); return null to hide a row.
  display?: (label: string) => string | null
  // Something to draw before the label, e.g. a colour swatch.
  lead?: (label: string) => ReactNode
}

// Horizontal bars, one series. Rows sort by the selected group so each agent's
// own ranking shows; the bar is always series slot 1 (identity never changes on filter).
export function BarChart({ metric, group, title, note, limit = 10, display = (l) => l, lead }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const n = metric.sizes[group]
  const rows = metric.labels
    .map((l) => ({ key: l.label, name: display(l.label), pct: l.pct[group] }))
    .filter((r): r is { key: string; name: string; pct: number } => r.name !== null && r.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit)

  return (
    <figure className="rounded-xl border border-border bg-surface p-5">
      <figcaption className="mb-4 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{title ?? metric.title}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {note ? `${note} · ` : ''}share of {n.toLocaleString()} repos
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTable(!table)}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-track"
        >
          {table ? 'Chart' : 'Table'}
        </button>
      </figcaption>

      {table ? (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="pb-2 font-normal">Label</th>
              <th className="pb-2 text-right font-normal">Repos</th>
              <th className="pb-2 text-right font-normal">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-hairline text-ink-2">
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5 text-right">{Math.round(r.pct * n)}</td>
                <td className="py-1.5 text-right">{fmtPct(r.pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.key}
              onMouseEnter={() => setHover(r.key)}
              onMouseLeave={() => setHover(null)}
              className={`relative grid grid-cols-[minmax(0,9.5rem)_1fr_2.75rem] items-center gap-3 rounded-md px-1 py-1 ${
                hover === r.key ? 'bg-track' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 text-sm text-ink-2">
                {lead?.(r.key)}
                <span className="truncate" title={r.name}>
                  {r.name}
                </span>
              </span>
              <span className="h-3">
                <span
                  className="block h-3 rounded-r-[4px] bg-series-1 transition-[width] duration-300"
                  style={{ width: `${Math.max(r.pct * 100, 0.5)}%` }}
                />
              </span>
              <span className="text-right text-sm tabular-nums text-ink">{fmtPct(r.pct)}</span>
              {hover === r.key && (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute -top-8 left-40 z-10 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-ink shadow-sm"
                >
                  {r.name}: {Math.round(r.pct * n)} of {n} repos
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </figure>
  )
}
