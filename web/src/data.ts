// Shape of public/summary.json, written by `npm run report` in the repo root.

export type Group = 'all' | 'claude' | 'copilot' | 'cursor' | 'devin' | 'jules'

export type Label = { label: string; pct: Record<Group, number> }

export type Metric = {
  title: string
  sizes: Record<Group, number>
  labels: Label[]
}

export type Summary = {
  generatedAt: string
  range: { start: string; end: string }
  discovered: Record<Exclude<Group, 'all'>, number>
  frontend: number
  scanned: number
  metrics: Metric[]
  trends?: Trends
}

// Weekly share of each group's repos. pct[group][i] is null when the group had no repos that week.
export type Agent = Exclude<Group, 'all'>
export type Trends = {
  weeks: string[] // Monday, YYYY-MM-DD
  metrics: {
    title: string
    n: Record<Group, number[]>
    labels: { label: string; pct: Record<Group, (number | null)[]> }[]
  }[]
}

export const AGENTS: { id: Exclude<Group, 'all'>; name: string }[] = [
  { id: 'claude', name: 'Claude Code' },
  { id: 'copilot', name: 'Copilot' },
  { id: 'cursor', name: 'Cursor' },
  { id: 'devin', name: 'Devin' },
  { id: 'jules', name: 'Jules' },
]

export async function loadSummary(): Promise<Summary> {
  const res = await fetch(`${import.meta.env.BASE_URL}summary.json`)
  if (!res.ok) throw new Error(`summary.json: ${res.status}`)
  return res.json()
}

export const metric = (s: Summary, title: string) => s.metrics.find((m) => m.title === title)

export const pctOf = (s: Summary, title: string, label: string, group: Group = 'all') =>
  metric(s, title)?.labels.find((l) => l.label === label)?.pct[group] ?? 0

export const fmtPct = (p: number) => (p > 0 && p < 0.01 ? '<1%' : `${Math.round(p * 100)}%`)
