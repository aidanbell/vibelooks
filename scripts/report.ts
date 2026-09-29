// Summarise data/vibelooks.db: each metric overall and per agent.
// Also writes data/summary.json for the site.
//
// Usage: npm run report

import { writeFile } from "node:fs/promises";
import { db } from "./lib/db.ts";

type Row = { name: string; agents: string[]; pkg: any; style: any };

const agentsOf = new Map<string, string[]>();
for (const r of db.prepare("SELECT name, agent FROM repo_agents").all()) {
  const list = agentsOf.get(String(r.name)) ?? [];
  list.push(String(r.agent));
  agentsOf.set(String(r.name), list);
}
const rows: Row[] = db
  .prepare(`SELECT p.name, p.data AS pkg, s.data AS style FROM packages p LEFT JOIN styles s USING (name) WHERE p.frontend = 1`)
  .all()
  .map((r) => ({
    name: String(r.name),
    agents: agentsOf.get(String(r.name)) ?? [],
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

function tally(metric: Metric) {
  const pool = rows.filter((r) => metric.of === "pkg" || r.style);
  const groups = { all: pool, ...Object.fromEntries(AGENTS.map((a) => [a, pool.filter((r) => r.agents.includes(a))])) };
  const counts: Record<string, Record<string, number>> = {};
  for (const [g, list] of Object.entries(groups))
    for (const r of list)
      for (const l of new Set(metric.labels(r))) if (l) ((counts[l] ??= {})[g] = (counts[l][g] ?? 0) + 1);
  const sizes = Object.fromEntries(Object.entries(groups).map(([g, l]) => [g, l.length]));
  const labels = Object.entries(counts)
    .sort((a, b) => (b[1].all ?? 0) - (a[1].all ?? 0))
    .slice(0, metric.limit ?? 12)
    .map(([label, c]) => ({ label, pct: Object.fromEntries(Object.keys(groups).map((g) => [g, sizes[g] ? (c[g] ?? 0) / sizes[g] : 0])) }));
  return { title: metric.title, sizes, labels };
}

const results = METRICS.map(tally);

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

await writeFile(
  "data/summary.json",
  JSON.stringify({ generatedAt: new Date().toISOString(), discovered, frontend: rows.length, scanned, metrics: results }, null, 2),
);
console.log("\n-> data/summary.json");
