// Summarise data/vibelooks.db: each metric overall and per agent.
// Also writes data/summary.json, and web/public/summary.json when run inside the repo.
//
// Usage: npm run report

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "./lib/db.ts";

type Row = { name: string; agents: string[]; days: Record<string, string>; pkg: any; style: any };

const agentsOf = new Map<string, string[]>();
const daysOf = new Map<string, Record<string, string>>(); // repo -> agent -> day found
for (const r of db.prepare("SELECT name, agent, day FROM repo_agents").all()) {
  const list = agentsOf.get(String(r.name)) ?? [];
  list.push(String(r.agent));
  agentsOf.set(String(r.name), list);
  daysOf.set(String(r.name), { ...daysOf.get(String(r.name)), [String(r.agent)]: String(r.day) });
}
const rows: Row[] = db
  .prepare(`SELECT p.name, p.data AS pkg, s.data AS style FROM packages p LEFT JOIN styles s USING (name) WHERE p.frontend = 1`)
  .all()
  .map((r) => ({
    name: String(r.name),
    agents: agentsOf.get(String(r.name)) ?? [],
    days: daysOf.get(String(r.name)) ?? {},
    pkg: JSON.parse(String(r.pkg)),
    style: r.style ? JSON.parse(String(r.style)) : null,
  }));

const AGENTS = [...new Set([...agentsOf.values()].flat())].sort();
const discovered = Object.fromEntries(AGENTS.map((a) => [a, [...agentsOf.values()].filter((l) => l.includes(a)).length]));

// A metric maps a repo to the labels it counts towards. Percentages are of the
// repos where the metric applies (package metrics: all frontend repos; style metrics: scanned repos).
type Metric = { title: string; of: "pkg" | "style"; labels: (r: Row) => (string | null | undefined)[]; limit?: number };

const METRICS: Metric[] = [
  { title: "Framework", of: "pkg", labels: (r) => (r.pkg.framework.length ? r.pkg.framework : ["(none)"]) },
  { title: "Meta-framework", of: "pkg", labels: (r) => (r.pkg.meta.length ? r.pkg.meta : ["(none)"]) },
  { title: "Styling / UI", of: "pkg", labels: (r) => [
    r.pkg.tailwind ? `tailwind ${String(r.pkg.tailwind).match(/\d+/)?.[0] ?? "?"}.x` : "no tailwind",
    r.pkg.shadcn || r.pkg.deps.includes("class-variance-authority") ? "shadcn-ish" : null,
    r.pkg.lovable ? "lovable" : null,
  ] },
  { title: "Top dependencies", of: "pkg", labels: (r) => r.pkg.deps, limit: 30 },
  { title: "Agent config files", of: "pkg", labels: (r) => r.pkg.agentFiles },
  { title: "Accent colour", of: "style", labels: (r) => [r.style.accent ?? "(neutral)"] },
  { title: "Fonts", of: "style", labels: (r) => r.style.fonts, limit: 15 },
  { title: "Dominant radius", of: "style", labels: (r) => [r.style.radius] },
  { title: "Gradients", of: "style", labels: (r) => [
    r.style.gradients > 0 ? "any gradient" : null,
    r.style.gradientText ? "gradient text" : null,
    r.style.gradientPair && !r.style.gradientPair.includes("neutral") ? `pair: ${r.style.gradientPair}` : null,
  ] },
  { title: "Effects", of: "style", labels: (r) => [
    r.style.darkMode ? "dark mode" : null,
    r.style.effects.blur ? "backdrop blur" : null,
    r.style.effects.glow ? "glow shadows" : null,
    r.style.effects.animate ? "animations" : null,
    r.style.emoji.total >= 3 ? "emoji in UI" : null,
  ] },
  { title: "Lucide icons", of: "style", labels: (r) => r.style.icons, limit: 15 },
  { title: "Top emoji", of: "style", labels: (r) => r.style.emoji.top, limit: 10 },
];

function tally(metric: Metric, keep = metric.limit ?? 12) {
  const pool = rows.filter((r) => metric.of === "pkg" || r.style);
  const groups = { all: pool, ...Object.fromEntries(AGENTS.map((a) => [a, pool.filter((r) => r.agents.includes(a))])) };
  const counts: Record<string, Record<string, number>> = {};
  for (const [g, list] of Object.entries(groups))
    for (const r of list)
      for (const l of new Set(metric.labels(r))) if (l) ((counts[l] ??= {})[g] = (counts[l][g] ?? 0) + 1);
  const sizes = Object.fromEntries(Object.entries(groups).map(([g, l]) => [g, l.length]));
  const labels = Object.entries(counts)
    .sort((a, b) => (b[1].all ?? 0) - (a[1].all ?? 0))
    .slice(0, keep)
    .map(([label, c]) => ({ label, pct: Object.fromEntries(Object.keys(groups).map((g) => [g, sizes[g] ? (c[g] ?? 0) / sizes[g] : 0])) }));
  return { title: metric.title, sizes, labels };
}

const results = METRICS.map((m) => tally(m));

// ---- Trends: share of each group's repos per week (all agents, then each agent) ----
// A repo counts in the week of the day it was discovered for that agent. Files are read at
// the discovery commit, so this is what the repo looked like then. Weeks start on Monday (UTC).
const weekOf = (day: string) => {
  const t = Date.parse(day);
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};
const WEEKS = [...new Set(rows.flatMap((r) => Object.values(r.days).map(weekOf)))].sort();
const TREND_LABELS = 25;

const GROUPS = ["all", ...AGENTS];
// "all" counts each repo once, in the week it was first found by any agent.
const weekIn = (r: Row, g: string) => weekOf(g === "all" ? Object.values(r.days).sort()[0] : r.days[g]);

const trends = {
  weeks: WEEKS,
  metrics: METRICS.map((metric) => {
    const pool = rows.filter((r) => metric.of === "pkg" || r.style);
    // n[group][week], and per label, count[group][week]
    const n: Record<string, number[]> = {};
    const counts: Record<string, Record<string, number[]>> = {};
    for (const g of GROUPS) n[g] = WEEKS.map(() => 0);
    for (const r of pool)
      for (const g of GROUPS) {
        if (g !== "all" && !r.agents.includes(g)) continue;
        const w = WEEKS.indexOf(weekIn(r, g));
        n[g][w]++;
        for (const l of new Set(metric.labels(r))) if (l) ((counts[l] ??= {})[g] ??= WEEKS.map(() => 0))[w]++;
      }
    const wanted = tally(metric, TREND_LABELS).labels.map((l) => l.label);
    return {
      title: metric.title,
      n,
      labels: wanted.map((label) => ({
        label,
        pct: Object.fromEntries(
          GROUPS.map((g) => [g, WEEKS.map((_, w) => (n[g][w] ? Math.round(((counts[label]?.[g]?.[w] ?? 0) / n[g][w]) * 1e4) / 1e4 : null))]),
        ),
      })),
    };
  }),
};

// ---- Print ----
const cols = ["all", ...AGENTS];
const fmt = (p: number) => (p ? `${(p * 100).toFixed(0)}%` : "·").padStart(8);
console.log(`\nDiscovered repos per agent: ${AGENTS.map((a) => `${a} ${discovered[a]}`).join(", ")}`);
const scanned = rows.filter((r) => r.style).length;
console.log(`Frontend repos: ${rows.length}, styles scanned: ${scanned}`);
for (const m of results) {
  console.log(`\n${m.title} (n=${cols.map((c) => m.sizes[c]).join("/")})`);
  console.log(`  ${"".padEnd(30)}${cols.map((c) => c.padStart(8)).join("")}`);
  for (const l of m.labels) console.log(`  ${l.label.slice(0, 30).padEnd(30)}${cols.map((c) => fmt(l.pct[c])).join("")}`);
}

const range = db.prepare("SELECT MIN(day) AS start, MAX(day) AS end FROM repo_agents").get();
const summary = JSON.stringify(
  { generatedAt: new Date().toISOString(), range, discovered, frontend: rows.length, scanned, metrics: results, trends },
  null,
  2,
);
await mkdir("data", { recursive: true });
await writeFile("data/summary.json", summary);
// The site copy only exists where the repo's web/ folder does (not on the crawl server).
const site = existsSync("web");
if (site) {
  await mkdir("web/public", { recursive: true });
  await writeFile("web/public/summary.json", summary);
}
console.log(`\n-> data/summary.json${site ? ", web/public/summary.json" : ""}`);
