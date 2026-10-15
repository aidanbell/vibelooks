# Vibe Looks

What do websites built with AI coding agents actually look like? Vibe Looks crawls public GitHub repos that carry an AI agent's fingerprint (Claude Code, Copilot, Cursor, Devin, Jules), keeps the ones with a front end, and aggregates their stacks, libraries, colours, fonts and styling effects into an interactive report.

Live at **https://vibelooks.aidanb.io**

## How it works

```
GitHub commit search ──▶ data/vibelooks.db ──▶ web/public/summary.json ──▶ static React site
      (npm run crawl)                 (npm run report)                       (web/)
```

1. **Discover.** Commit search finds repos by agent signature (e.g. the `Co-Authored-By: Claude` trailer, or bot authors like `copilot-swe-agent[bot]`).
2. **Packages.** Fetches each repo's `package.json` to detect frontend frameworks and libraries.
3. **Styles.** Scans frontend repos for colours, fonts and CSS effects.
4. **Report.** Summarises each metric overall and per agent into `summary.json`.
5. **Site.** A Vite + React + Tailwind app renders that JSON. There is no backend.

See [RESEARCH.md](RESEARCH.md) for how the fingerprints were chosen and their limitations,

## Running it

Requires Node >= 22.18 (see `.node-version`).

### The site

```sh
cd web
npm ci
npm run dev      # http://localhost:5173
npm run build    # outputs web/dist
```

### The crawler

```sh
cp .env.example .env     # add a GitHub token (read-only public access is enough)
npm run crawl -- --from 2026-09-22 --to 2026-09-28 --per-agent 100
npm run report           # writes data/summary.json and web/public/summary.json
```

The crawl is resumable: each stage only does missing work, so it is safe to interrupt and re-run. Crawl output lives in `data/` and is not committed.

## Deployment

The site is static and deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` that touches `web/`. To refresh the data, run `npm run report` locally and commit the updated `web/public/summary.json`.

It is served from its own subdomain, `vibelooks.aidanb.io`, so the base path is `/`. This needs a `CNAME` DNS record for `vibelooks` pointing to `aidanbell.github.io`, and Settings → Pages → Source set to "GitHub Actions". To serve under a path instead (e.g. `/vibelooks/`), build with `VITE_BASE=/vibelooks/` and remove `web/public/CNAME`.

## Future ideas

- **Automated refreshes.** Run the crawl and report on a weekly GitHub Actions cron and commit the new `summary.json`, so the site stays current without manual work.
- **More agents.** Codex has no commit-author signature today. File-based signals (`CLAUDE.md`, `.cursor/rules`, `AGENTS.md`) could cover it and agents that don't sign commits.
- **A human-written baseline.** Crawl a comparable sample of repos with no AI fingerprint, so the report can show what is distinctive about AI-built sites rather than what is common to all of them.
- **Screenshots and visual clustering.** Capture live deployments and have a small model label the "vibe" (layout, palette, gradients), then cluster similar-looking sites.
- **Beyond React.** Broaden detection to Python, Rails and other stacks, plus component libraries such as shadcn and Lucide.
- **Trends over time.** Track shifts per month and per model version, since the Claude trailer now includes the model name.
- **Interactivity.** Add shareable filter URLs, a per-repo drill-down, and a way to download the underlying data.
- **Better sampling.** Weight by stars or deployment, and handle forks and templates, to reduce skew from throwaway repos.

## Caveats

Agent fingerprints only find repos that leave a visible trace, so the sample skews toward people who keep the default commit trailers. Treat the numbers as trends, not a census.
