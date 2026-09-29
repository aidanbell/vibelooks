// Resumable crawl into data/vibelooks.db. Each stage only does work that's
// missing, so it's safe to Ctrl-C and re-run. Without --stage, it works a week
// at a time, newest first, so recent data is usable before the backfill finishes.
//
//   discover  commit search per agent per day, until --per-agent new repos are found
//   packages  fetch package.json, mark which repos have a frontend
//   styles    extract styling from frontend repos
//
// Usage: npm run crawl -- [--from 2026-09-22] [--to 2026-09-28] [--per-agent 100] [--stage discover|packages|styles]

import { parseArgs } from "node:util";
import { db, now } from "./lib/db.ts";
import { gh, sleep } from "./lib/github.ts";
import { analyze, fetchPackages } from "./lib/packages.ts";
import { scanRepo } from "./lib/styles.ts";

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string", default: yesterday },
    "per-agent": { type: "string", default: "100" },
    stage: { type: "string" },
    concurrency: { type: "string", default: "4" },
  },
});
const to = args.to!;
const from = args.from ?? new Date(Date.parse(to) - 6 * 86_400_000).toISOString().slice(0, 10);
const PER_AGENT = Number(args["per-agent"]);

// Commit-search signatures. Only used to *find* repos. (Codex's bot doesn't
// author commits, so it has no usable signature yet.)
const AGENTS: Record<string, string> = {
  claude: '"noreply@anthropic.com"',
  copilot: "author:copilot-swe-agent[bot]",
  cursor: '"cursoragent@cursor.com"',
  jules: "author:google-labs-jules[bot]",
  devin: "author:devin-ai-integration[bot]",
};

// Visit hours spread across the day, so a busy agent's sample isn't all from midnight UTC.
const HOUR_ORDER = [0, 12, 6, 18, 3, 15, 9, 21, 1, 13, 7, 19, 4, 16, 10, 22, 2, 14, 8, 20, 5, 17, 11, 23];

// In a terminal, overwrite one progress line; in container logs, print every 100th.
const progress = (i: number, msg: string) =>
  process.stdout.isTTY ? process.stdout.write(`\r  ${msg}`) : i % 100 === 0 && console.log(`  ${msg}`);

function days(a: string, b: string) {
  const out: string[] = [];
  for (let t = Date.parse(a); t <= Date.parse(b); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// ---- Stage 1: discover ----

async function discover(dayList: string[]) {
  const countFor = db.prepare("SELECT COUNT(*) AS n FROM repo_agents WHERE agent = ? AND day = ?");
  const windowDone = db.prepare("SELECT 1 FROM search_windows WHERE agent = ? AND window_start = ?");
  const seenByAgent = db.prepare("SELECT 1 FROM repo_agents WHERE name = ? AND agent = ?");
  const shaSeen = db.prepare("SELECT 1 FROM repos WHERE sha = ? AND name != ?");
  const addRepo = db.prepare("INSERT OR IGNORE INTO repos (name, discovered_at, sha) VALUES (?, ?, ?)");
  const addAgent = db.prepare("INSERT OR IGNORE INTO repo_agents (name, agent, day) VALUES (?, ?, ?)");
  const addWindow = db.prepare("INSERT OR REPLACE INTO search_windows (agent, window_start, commits) VALUES (?, ?, ?)");

  for (const day of dayList) {
    for (const [agent, sig] of Object.entries(AGENTS)) {
      let have = Number(countFor.get(agent, day)!.n);
      let searches = 0;
      for (const h of HOUR_ORDER) {
        if (have >= PER_AGENT) break;
        const start = `${day}T${String(h).padStart(2, "0")}:00:00Z`;
        if (windowDone.get(agent, start)) continue;
        const q = `${sig} committer-date:${start}..${day}T${String(h).padStart(2, "0")}:59:59Z`;
        const data = await gh(`https://api.github.com/search/commits?q=${encodeURIComponent(q)}&per_page=100`);
        searches++;
        await sleep(2100); // search API: 30 req/min
        db.exec("BEGIN");
        for (const item of data.items) {
          if (have >= PER_AGENT) break;
          if (item.repository.fork || item.repository.private) continue;
          const name = item.repository.full_name;
          if (seenByAgent.get(name, agent)) continue; // count each repo once per agent
          if (shaSeen.get(item.sha, name)) continue; // same commit in another repo: a template copy or clone
          addRepo.run(name, now(), item.sha);
          addAgent.run(name, agent, day);
          have++;
        }
        addWindow.run(agent, start, data.items.length);
        db.exec("COMMIT");
      }
      console.log(`  ${day} ${agent.padEnd(8)} ${String(have).padStart(4)} repos  (${searches} searches)`);
    }
  }
}

// ---- Stage 2: packages ----

async function packages() {
  const rows = db.prepare("SELECT name, sha FROM repos WHERE name NOT IN (SELECT name FROM packages)").all();
  const todo = rows.map((r) => String(r.name));
  const revs = Object.fromEntries(rows.filter((r) => r.sha).map((r) => [String(r.name), String(r.sha)]));
  console.log(`  ${todo.length} repos to check`);
  const save = db.prepare("INSERT OR REPLACE INTO packages (name, checked_at, frontend, data) VALUES (?, ?, ?, ?)");
  const CHUNK = 50;
  let frontend = 0;
  for (let i = 0; i < todo.length; i += CHUNK) {
    const chunk = todo.slice(i, i + CHUNK);
    const raw = await fetchPackages(chunk, revs);
    db.exec("BEGIN");
    for (const name of chunk) {
      const a = raw[name] ? analyze(raw[name]) : null;
      if (a && revs[name]) Object.assign(a, { rev: revs[name] });
      if (a) frontend++;
      save.run(name, now(), a ? 1 : 0, a ? JSON.stringify(a) : null);
    }
    db.exec("COMMIT");
    const n = Math.min(i + CHUNK, todo.length);
    progress(n === todo.length ? 0 : n, `checked ${n}/${todo.length}, ${frontend} frontend`);
  }
  if (todo.length && process.stdout.isTTY) process.stdout.write("\n");
}

// ---- Stage 3: styles ----

async function styles() {
  const todo = db
    .prepare("SELECT name, data FROM packages WHERE frontend = 1 AND name NOT IN (SELECT name FROM styles)")
    .all()
    .map((r) => ({ repo: String(r.name), ...JSON.parse(String(r.data)) }));
  console.log(`  ${todo.length} frontend repos to scan`);
  const save = db.prepare("INSERT OR REPLACE INTO styles (name, scanned_at, data) VALUES (?, ?, ?)");
  let done = 0;
  await Promise.all(
    Array.from({ length: Number(args.concurrency) }, async () => {
      for (let r; (r = todo.shift()); ) {
        let res = null;
        try {
          res = await scanRepo(r);
        } catch (err) {
          console.warn(`\n  ${r.repo}: ${(err as Error).message.split("\n")[0]}`);
        }
        save.run(r.repo, now(), res ? JSON.stringify(res) : null);
        progress(++done, `scanned ${done}`);
      }
    }),
  );
  if (done && process.stdout.isTTY) process.stdout.write("\n");
}

const all = days(from, to);
const stages = { discover: () => discover(all), packages, styles };
if (args.stage) {
  await stages[args.stage as keyof typeof stages]();
} else {
  for (let end = all.length; end > 0; end -= 7) {
    const week = all.slice(Math.max(0, end - 7), end);
    console.log(`\n== ${week[0]} .. ${week.at(-1)} ==`);
    await discover(week);
    await packages();
    await styles();
  }
}
