# Research: Acquiring the data

_Researched 2026-09-29. Companion to PLAN.md._

## TL;DR

- **You don't need to crawl blindly, and you don't need Claude for the crawl.** Almost every AI assistant leaves a signature you can search for. The GitHub Search API finds repos by that signature, and the GraphQL API reads their `package.json` in bulk. Both are free with a personal access token.
- **The pipeline is deterministic.** Parsing `package.json`, CSS and Tailwind config is plain code. An LLM only earns its keep for optional "vibe" labelling of screenshots (Haiku, a fraction of a cent each).
- **Apify is optional.** Its GitHub actors mostly wrap the same public API and charge $1–3 per 1,000 results. It is worth it mainly for **screenshotting live deployments** and hosted scheduling. A free GitHub Actions cron covers the rest.
- **Watch out:** since Oct 7, 2025 the GitHub Events API (and so GH Archive) **no longer includes commit messages or authors in PushEvents**, so you can't mine AI trailers from GH Archive any more. Use Commit Search instead.

---

## 1. Fingerprints: how to tell a repo was AI-assisted

Two kinds of signal. **Commit signals** are strong and dated. **File signals** are weaker (someone may just have tried a tool once) but can be found with code search.

### Commit signals (searchable via `GET /search/commits`)

| Tool | Query | Notes |
|---|---|---|
| Claude Code | `"noreply@anthropic.com"` | `Co-Authored-By: Claude …` trailer. Since Dec 2025 it includes the model name, so you can break down by model. |
| GitHub Copilot agent | `author:copilot-swe-agent[bot]` | |
| OpenAI Codex | `author:chatgpt-codex-connector[bot]` | |
| Cursor (editor) | `"cursoragent@cursor.com"` | |
| Cursor (background agent) | `author-email:agent@cursor.com` | |
| Devin | `author:devin-ai-integration[bot]` | |
| Google Jules | `author:google-labs-jules[bot]` | |
| Amazon Q | `author:amazon-q-developer[bot]` | |
| Aider | `"aider.chat"` | |
| OpenCode | `"noreply@opencode.ai"` | |

Source: [powerset-co/github-coding-agent-tracker](https://github.com/powerset-co/github-coding-agent-tracker), which counts these daily.

### File and dependency signals (via code search or a file fetch)

| Signal | Implies |
|---|---|
| `CLAUDE.md`, `.claude/` | Claude Code |
| `AGENTS.md` | Codex / generic agent |
| `.cursorrules`, `.cursor/rules/` | Cursor |
| `.github/copilot-instructions.md` | Copilot |
| `GEMINI.md` | Gemini CLI |
| `.windsurfrules`, `.clinerules`, `.kiro/` | Windsurf, Cline, Kiro |
| `lovable-tagger` in devDependencies | **Lovable** (a very clean signal) |
| `@replit/*` packages, `.replit` | Replit Agent |
| Bolt, v0 | **No reliable package fingerprint.** Look for README boilerplate, or treat as undetectable. |

### Volume

Claude-attributed commits alone run to about **740k–830k per day** on public GitHub (Sept 2026, per [claude-github-monitor](https://github.com/AlbGri/claude-github-monitor)). Finding repos isn't the problem. **Sampling fairly** is the problem (see §5).

---

## 2. Data sources compared

| Source | Good for | Limits |
|---|---|---|
| **GitHub Commit Search** | Discovering repos by AI signature, with dates | 30 req/min; **1,000 results per query**. Work around the cap by slicing with `committer-date:2026-09-01T00:00..2026-09-01T01:00`. The existing trackers do exactly this. |
| **GitHub Code Search** | Finding `CLAUDE.md`, `lovable-tagger` and similar | **10 req/min**, 1,000 per query, **no date qualifiers**, default branch only. Slice by `size:` ranges or by `path:` instead. |
| **GitHub GraphQL** | **Bulk enrichment.** One query can fetch `package.json`, `tailwind.config.*`, stars, homepage URL, topics and languages for ~50 repos at once. | 5,000 points/hr per token. |
| **raw.githubusercontent.com** | Fetching individual files without spending API quota | Unofficial limits; be polite. |
| GH Archive / BigQuery | Repo creation activity, star events | **Commit messages removed Oct 2025** ([changelog](https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/)). 1 TB/month of BigQuery queries is free. |
| ecosyste.ms dependents API | Listing repos that depend on an npm package | Checked it: only **49** dependents indexed for `lovable-tagger`. Coverage is too thin to rely on. |
| Apify GitHub actors | None that the API doesn't already do | $1–3 per 1k results ([example](https://apify.com/dami_studio/github-scraper/api)) |

Search rate limits: [GitHub docs](https://docs.github.com/en/rest/search/search).

---

## 3. Proposed pipeline

```
 ┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌───────────┐    ┌────────┐
 │ 1. Discover │ →  │ 2. Filter    │ →  │ 3. Extract  │ →  │ 4. Visual │ →  │ 5. Agg │
 │ commit/code │    │ has frontend?│    │ deps, CSS,  │    │ (optional)│    │ → JSON │
 │ search      │    │ package.json │    │ fonts, etc. │    │ screenshot│    │ for UI │
 └─────────────┘    └──────────────┘    └─────────────┘    └───────────┘    └────────┘
   Search API         GraphQL batch       GraphQL/raw        Apify/Playwright  SQLite
```

1. **Discover.** For each agent signature, run commit search over hour-sized windows and collect `repository.full_name` plus the first commit date seen. Deduplicate into a `repos` table tagged with the agent(s) detected.
2. **Filter.** Use one GraphQL query per ~50 repos to fetch `HEAD:package.json`. Keep repos whose dependencies include `react`, `vue`, `@angular/core`, `svelte`, `next`, `nuxt`, `astro`, `solid-js` and similar. Skip forks and empty repos. For monorepos, also check `apps/*/package.json` and `web/package.json` via the tree API.
3. **Extract.** No LLM needed here:
   - **Stack:** framework, meta-framework, bundler (vite/next/webpack), TypeScript or not, package manager (by lockfile).
   - **Libraries:** tailwind, shadcn (`components.json` present), lucide-react, framer-motion, radix, react-query, zustand, supabase, prisma and so on. Store the whole dependency list and decide what to chart later.
   - **Styling:** parse `globals.css` / `index.css` / `tailwind.config.*` for CSS variables and colours (hex/hsl/oklch → hue buckets), `border-radius` values, gradient classes (`bg-gradient-to-r from-purple-…`), and fonts (`next/font` imports, Google Fonts links, `@fontsource/*`). This is where the "purple gradient + Inter + rounded-xl" stereotype can be tested with data.
4. **Visual (optional, later).** Many repos have a `homepageUrl` (Vercel, Netlify, lovable.app). Screenshot those and, if you like, ask Haiku for a structured label (dark/light, hero style, dominant hue). This is the step where **Apify** fits: its screenshot actors cost cents per 1k pages and it handles headless browsers for you.
5. **Aggregate.** Roll up into static JSON (per agent × month × feature) that the React site loads. No backend needed.

**Storage:** SQLite locally to start. Move to Postgres or Supabase only if you want the crawl running in the cloud.

---

## 4. Cost and throughput estimates

Assumes one GitHub token. Adding a second token (for example a GitHub App installation) doubles throughput.

| Step | Throughput | Cost |
|---|---|---|
| Commit search discovery | 30 req/min × 100 results ≈ **~180k commits/hr**. That dedupes to far fewer repos, but plenty. | Free |
| GraphQL package.json filter | ~50 repos per query and thousands of queries/hr, so **tens of thousands of repos/hr** in practice | Free |
| Style file fetch | Similar to the filter step. Only runs for repos that pass the filter. | Free |
| Screenshots (Apify) | Parallel | Free tier gives $5/month of credit. Starter plan is $19/mo ([pricing](https://apify.com/pricing)). |
| Haiku labelling of screenshots | n/a | Roughly $1–5 per 10k images with a short prompt and structured output |
| Scheduling | Daily incremental run | **GitHub Actions cron is free for public repos.** Apify schedules work too. |

**A realistic first milestone:** 5–10k frontend repos per agent, which is a few hours of crawling on one token. That's enough for stable percentages.

**Where Claude would get expensive:** having Claude Code itself do the crawling, reading repos one by one in a session. Don't do that. Write the crawler as a normal script and use LLM calls only on the small optional visual step.

---

## 5. Methodology issues to decide early

1. **Control group.** Without a baseline, "vibe-coded sites use Tailwind" means nothing, because *everyone* in 2026 uses Tailwind. Also sample non-AI frontend repos created in the same period (for example random repos from GH Archive `CreateEvent`s, filtered to ones with no AI signature). The interesting charts are **differences from the baseline**.
2. **Sampling bias.** Claude commit volume dwarfs Jules and Amazon Q. Sample a fixed number of repos per agent per month rather than taking whatever the search returns.
3. **Heavy committers.** A single bot-driven repo can have thousands of commits. Count **repos**, not commits.
4. **Attribution strength.** Label each repo with `signal: commit | config-file | dependency` and let the UI filter by it. Someone who once ran `claude init` is not the same as a repo with 500 Claude commits. Possibly store "% of commits AI-attributed" too.
5. **Templates.** `create-vite` / `create-next-app` / shadcn defaults will dominate. Consider detecting untouched starter templates (tiny repos, default README) and excluding them or flagging them.
6. **Etiquette and ToS.** Stay on the official API, respect `Retry-After` / secondary rate limits, store only derived metadata (not copies of code), and publish aggregates only.

---

## 6. Suggested next steps

1. Create a GitHub token and write a small `discover.ts` (or Python) that runs commit search for one agent over one day. See how many unique repos come back.
2. Add the GraphQL `package.json` batch filter and measure what fraction are frontend projects.
3. Write extractors for dependencies and CSS, then store everything in SQLite.
4. Once the numbers look sane, schedule it (GitHub Actions cron) and start building the React charts.
5. Add the baseline sample, then screenshots via Apify.

## Prior art worth reading

- [powerset-co/github-coding-agent-tracker](https://github.com/powerset-co/github-coding-agent-tracker): signatures for each agent, daily counts
- [AlbGri/claude-github-monitor](https://github.com/AlbGri/claude-github-monitor): commit-search methodology and indexing lag caveats
- [dukbong/the-claude-index](https://github.com/dukbong/the-claude-index): live dashboard of Claude commits
- [GitHub Events API payload changes (2025)](https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/)
- [GH Archive](https://www.gharchive.org/)
