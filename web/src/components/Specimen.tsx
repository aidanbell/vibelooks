import { fmtPct, metric, pctOf, type Group, type Summary } from '../data'

// Tailwind 500/600 steps for each hue bucket the crawler reports.
export const HUE: Record<string, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  orange: '#f97316',
  red: '#ef4444',
  teal: '#14b8a6',
  indigo: '#6366f1',
  purple: '#a855f7',
  pink: '#ec4899',
  '(neutral)': '#71717a',
}

const RADIUS: Record<string, string> = {
  'rounded-none': '0px',
  'rounded-sm': '2px',
  rounded: '4px',
  'rounded-md': '6px',
  'rounded-lg': '8px',
  'rounded-xl': '12px',
  'rounded-2xl': '16px',
  'rounded-3xl': '24px',
  'rounded-full': '9999px',
}

function top(s: Summary, title: string, group: Group, skip: string[] = []) {
  const m = metric(s, title)
  const best = m?.labels.filter((l) => !skip.includes(l.label)).sort((a, b) => b.pct[group] - a.pct[group])[0]
  return best ? { label: best.label, pct: best.pct[group] } : null
}

function Sparkles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" />
    </svg>
  )
}

// The typical site for the selected group: every trait is that group's most common choice.
export function Specimen({ summary, group }: { summary: Summary; group: Group }) {
  const accent = top(summary, 'Accent colour', group, ['(neutral)'])!
  const font = top(summary, 'Fonts', group, ['(system stack)'])!
  const radius = top(summary, 'Dominant radius', group)!
  const meta = top(summary, 'Meta-framework', group)!
  const emoji = top(summary, 'Top emoji', group)!
  const blur = pctOf(summary, 'Effects', 'backdrop blur', group)
  const gradient = pctOf(summary, 'Gradients', 'any gradient', group)
  const sparkles = pctOf(summary, 'Lucide icons', 'Sparkles', group)
  const color = HUE[accent.label]

  const traits = [
    ['Framework', meta.label === '(none)' ? 'React + Vite' : meta.label, meta.pct],
    ['Accent', accent.label, accent.pct],
    ['Font', font.label, font.pct],
    ['Corners', radius.label, radius.pct],
    ['Gradient', 'somewhere', gradient],
    ['Backdrop blur', 'on the nav', blur],
    ['Icon', 'lucide Sparkles', sparkles],
    ['Emoji', emoji.label, emoji.pct],
  ] as const

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      {/* The mock site deliberately uses its own look, not the page's tokens. */}
      <div
        className="relative isolate overflow-hidden rounded-xl border border-border bg-[#0b0b10] text-white"
        style={{ fontFamily: `'${font.label}', system-ui, sans-serif` }}
        aria-label="Mock-up of the typical site"
      >
        <div
          className="absolute -top-24 -right-16 -z-10 h-72 w-72 rounded-full opacity-50 blur-3xl"
          style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
        />
        <div className="absolute -bottom-28 -left-10 -z-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <nav className="flex items-center justify-between border-b border-white/10 bg-white/5 px-5 py-3 backdrop-blur-md">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="h-4 w-4" />
            <span>acme.ai</span>
          </span>
          <span className="hidden gap-5 text-xs text-white/60 sm:flex">
            <span>Features</span>
            <span>Pricing</span>
            <span>Docs</span>
          </span>
        </nav>
        <div className="px-6 pt-12 pb-14 sm:px-10">
          <span
            className="inline-flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80"
            style={{ borderRadius: RADIUS[radius.label] }}
          >
            {emoji.label} Now in beta
          </span>
          <h3 className="mt-5 max-w-md text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
            Ship your ideas{' '}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, #fff, ${color})` }}>
              10x faster
            </span>
          </h3>
          <p className="mt-3 max-w-sm text-sm text-white/60">
            The all-in-one platform that helps modern teams build, launch and scale without the busywork.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <span
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white shadow-lg"
              style={{ background: color, borderRadius: RADIUS[radius.label], boxShadow: `0 0 24px ${color}66` }}
            >
              <Sparkles className="h-4 w-4" /> Get started free
            </span>
            <span
              className="inline-flex items-center border border-white/15 px-5 py-2.5 text-sm text-white/80"
              style={{ borderRadius: RADIUS[radius.label] }}
            >
              View demo →
            </span>
          </div>
        </div>
      </div>

      <dl className="grid content-start gap-px self-start overflow-hidden rounded-xl border border-border bg-hairline">
        {traits.map(([k, v, p]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 bg-surface px-4 py-2.5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="flex items-baseline gap-3 text-sm text-ink">
              <span className="flex items-center gap-2">
                {k === 'Accent' && <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />}
                {v}
              </span>
              <span className="w-10 text-right text-xs tabular-nums text-muted">{fmtPct(p)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
