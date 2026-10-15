import { useEffect, useState } from 'react'
import { BarChart } from './components/BarChart'
import { Heatmap, type Signal } from './components/Heatmap'
import { Trends } from './components/Trends'
import { HUE, Specimen } from './components/Specimen'
import { AGENTS, metric, loadSummary, type Group, type Summary } from './data'

const SIGNALS: Signal[] = [
  { title: 'Effects', label: 'glow shadows', name: 'Glow shadows' },
  { title: 'Effects', label: 'backdrop blur', name: 'Backdrop blur' },
  { title: 'Gradients', label: 'gradient text', name: 'Gradient text' },
  { title: 'Effects', label: 'emoji in UI', name: 'Emoji in the UI' },
  { title: 'Lucide icons', label: 'Sparkles', name: 'Sparkles icon' },
  { title: 'Fonts', label: 'Inter', name: 'Inter' },
  { title: 'Meta-framework', label: 'next', name: 'Next.js' },
  { title: 'Styling / UI', label: 'tailwind 4.x', name: 'Tailwind 4' },
  { title: 'Top dependencies', label: 'vitest', name: 'Vitest' },
  { title: 'Top dependencies', label: '@playwright/test', name: 'Playwright' },
  { title: 'Top dependencies', label: '@supabase/supabase-js', name: 'Supabase' },
]

// "Sep 22–28" within a month, "May 2025 – Sep 2026" across months.
function fmtRange({ start, end }: { start: string; end: string }) {
  const d = (s: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { ...o, timeZone: 'UTC' })
  if (start.slice(0, 7) === end.slice(0, 7)) return `${d(start, { month: 'short', day: 'numeric' })}–${end.slice(8).replace(/^0/, '')}`
  return `${d(start, { month: 'short', year: 'numeric' })} – ${d(end, { month: 'short', year: 'numeric' })}`
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{title}</h2>
      {intro && <p className="mt-1 max-w-2xl text-sm text-ink-2">{intro}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  )
}

export default function App() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState<Group>('all')

  useEffect(() => {
    loadSummary().then(setSummary, (e) => setError(String(e)))
  }, [])

  if (error) return <p className="p-8 text-sm text-ink-2">Couldn't load the data: {error}</p>
  if (!summary) return <p className="p-8 text-sm text-muted">Loading…</p>

  const m = (title: string) => metric(summary, title)!
  const discovered = Object.values(summary.discovered).reduce((a, b) => a + b, 0)
  const groupName = group === 'all' ? 'all agents' : AGENTS.find((a) => a.id === group)!.name

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <header className="pt-14 pb-10 sm:pt-20">
        <p className="text-sm font-medium text-series-1">Vibe Looks</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight text-balance text-ink sm:text-5xl">
          What does a vibe-coded website actually look like?
        </h1>
        <p className="mt-4 max-w-2xl text-base text-ink-2">
          Public GitHub repos with commits signed by an AI coding agent, filtered to the ones with a web front end, then
          read for their stack, libraries, colours, fonts and effects.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Repos with agent commits" value={discovered.toLocaleString()} />
          <Stat label="With a web front end" value={summary.frontend.toLocaleString()} />
          <Stat label="Agents tracked" value={String(AGENTS.length)} />
          <Stat label={`Commits from${summary.range.start.slice(0, 7) === summary.range.end.slice(0, 7) ? `, ${summary.range.end.slice(0, 4)}` : ''}`} value={fmtRange(summary.range)} />
        </div>
      </header>

      <nav
        aria-label="Filter by agent"
        className="sticky top-0 z-20 -mx-4 mb-10 border-b border-hairline bg-page/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="flex flex-wrap gap-1.5">
          {([{ id: 'all', name: 'All agents' }, ...AGENTS] as { id: Group; name: string }[]).map((a) => (
            <button
              key={a.id}
              type="button"
              aria-pressed={group === a.id}
              onClick={() => setGroup(a.id)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                group === a.id ? 'bg-ink text-page' : 'text-ink-2 hover:bg-track'
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
      </nav>

      <div className="space-y-16">
        {summary.trends && (
          <Section
            id="trends"
            title="Trends over time"
            intro="How the most common choices rise and fall week to week. Use the agent filter above to switch between all agents and a single agent."
          >
            <Trends trends={summary.trends} group={group} onGroup={setGroup} />
          </Section>
        )}

        <Section
          id="specimen"
          title={`The typical site, ${groupName}`}
          intro="Every trait below is the most common choice among these repos, assembled into one page. It's a composite: no single repo looks exactly like this."
        >
          <Specimen summary={summary} group={group} />
        </Section>

        <Section id="stack" title="The stack">
          <div className="grid gap-5 md:grid-cols-2">
            <BarChart metric={m('Framework')} group={group} display={(l) => (l === '(none)' ? null : l)} />
            <BarChart
              metric={m('Meta-framework')}
              group={group}
              display={(l) => (l === '(none)' ? 'none (plain SPA)' : l)}
            />
            <BarChart
              metric={m('Styling / UI')}
              group={group}
              title="Styling"
              display={(l) => (l === 'tailwind ?.x' ? null : l === 'shadcn-ish' ? 'shadcn/ui' : l)}
            />
            <BarChart metric={m('Top dependencies')} group={group} title="Most common dependencies" limit={15} />
          </div>
        </Section>

        <Section
          id="look"
          title="The look"
          intro="Read from each repo's CSS, Tailwind config and component files. Accent is the most-used non-grey colour, ignoring error and success styling."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <BarChart
              metric={m('Accent colour')}
              group={group}
              lead={(l) => <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HUE[l] }} />}
              display={(l) => (l === '(neutral)' ? 'no accent (greys only)' : l)}
            />
            <BarChart metric={m('Fonts')} group={group} limit={12} display={(l) => (l === '(system stack)' ? 'system font stack' : l)} />
            <BarChart metric={m('Dominant radius')} group={group} title="Most-used corner radius" />
            <BarChart
              metric={m('Effects')}
              group={group}
              title="Effects"
              note="emoji = 3 or more in the UI"
            />
            <BarChart metric={m('Lucide icons')} group={group} title="Most-used Lucide icons" limit={12} />
            <BarChart metric={m('Top emoji')} group={group} title="Most-used emoji" />
          </div>
        </Section>

        <Section
          id="fingerprints"
          title="Agent fingerprints"
          intro="The habits that differ most between agents. Jules leans hardest on glow, blur and gradient text; Claude Code's repos ship the most test tooling."
        >
          <Heatmap summary={summary} signals={SIGNALS} />
        </Section>

        <Section id="agents-files" title="Who else was here?" intro="Agent config files found in the repo root. Plenty of repos are worked on by more than one agent.">
          <div className="grid gap-5 md:grid-cols-2">
            <BarChart metric={m('Agent config files')} group={group} title="Agent config files" />
          </div>
        </Section>

        <Section id="method" title="How this was made">
          <div className="max-w-2xl space-y-3 text-sm text-ink-2">
            <p>
              Repos are found through GitHub commit search, by the signature each agent leaves: Claude Code's
              co-author trailer, and the bot accounts for Copilot, Jules and Devin, and Cursor's agent email. Up to{' '}
              {Math.max(...Object.values(summary.discovered))} new repos per agent per day are sampled, spread across
              the day, and forks are skipped.
            </p>
            <p>
              A repo counts as a front end if its <code className="text-ink">package.json</code> (at the root or in a
              common app folder) depends on React, Vue, Angular, Svelte, Solid, Astro or a framework built on them. Up to
              40 style and component files per repo are then parsed with plain pattern matching, so no AI is involved.
              shadcn's stock <code className="text-ink">components/ui</code> files are skipped so they don't make every
              shadcn repo look identical.
            </p>
            <p>
              Percentages are shares of repos, not commits. Only agents that sign their commits can be seen, and a
              repo counts for every agent that touched it.
            </p>
          </div>
        </Section>
      </div>

      <footer className="mt-20 border-t border-hairline pt-6 text-xs text-muted">
        Data updated {new Date(summary.generatedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}.
      </footer>
    </div>
  )
}
