// Batch-fetch package.json (+ root listing, shadcn config) via GraphQL and
// decide whether a repo has a frontend.

import { graphql } from "./github.ts";

const FRAMEWORKS = ["react", "vue", "@angular/core", "svelte", "solid-js", "preact", "astro", "@builder.io/qwik"];
const META = ["next", "nuxt", "@sveltejs/kit", "@remix-run/react", "react-router", "astro", "gatsby", "expo"];
const BUNDLERS = ["vite", "webpack", "parcel", "@rsbuild/core", "turbopack"];
// Places a frontend package.json commonly lives besides the root.
const PKG_PATHS = ["package.json", "frontend/package.json", "client/package.json", "web/package.json", "apps/web/package.json"];
const AGENT_FILES = ["CLAUDE.md", ".claude", "AGENTS.md", ".cursorrules", ".cursor", "GEMINI.md", ".windsurfrules", ".clinerules"];

function parse(text: string | undefined) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Returns the raw GraphQL repository objects keyed by the name we asked for.
// Repos that are gone (deleted/renamed/private) are simply missing from the result.
// revs maps a repo to the commit to read it at (default HEAD).
export async function fetchPackages(names: string[], revs: Record<string, string> = {}): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  let batch = 10;
  for (let i = 0; i < names.length; ) {
    const chunk = names.slice(i, i + batch);
    const fields = chunk
      .map((full, j) => {
        const [owner, name] = full.split("/");
        const rev = revs[full] ?? "HEAD";
        const pkgs = PKG_PATHS.map((p, k) => `p${k}: object(expression: "${rev}:${p}") { ... on Blob { text } }`).join("\n");
        return `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          stargazerCount homepageUrl createdAt isFork
          root: object(expression: "${rev}:") { ... on Tree { entries { name type } } }
          components: object(expression: "${rev}:components.json") { ... on Blob { text } }
          ${pkgs}
        }`;
      })
      .join("\n");
    let res;
    try {
      res = await graphql(`{ ${fields} }`);
    } catch (err) {
      // Big batches can time out (502). Halve and retry; skip a single repo that still fails.
      if (chunk.length > 1) {
        batch = Math.max(1, Math.floor(chunk.length / 2));
        continue;
      }
      i += 1;
      continue;
    }
    // Partial errors (deleted/renamed repos) come back alongside data; ignore them.
    chunk.forEach((full, j) => {
      if (res.data?.[`r${j}`]) out[full] = res.data[`r${j}`];
    });
    i += chunk.length;
  }
  return out;
}

export function analyze(repo: any) {
  if (repo.isFork) return null;
  let pkgPath: string | null = null;
  let deps: Record<string, string> = {};
  for (let k = 0; k < PKG_PATHS.length; k++) {
    const pkg = parse(repo[`p${k}`]?.text);
    if (!pkg) continue;
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    if (FRAMEWORKS.some((f) => f in all) || META.some((f) => f in all)) {
      pkgPath = PKG_PATHS[k];
      deps = all;
      break;
    }
  }
  if (!pkgPath) return null;

  const rootFiles: string[] = (repo.root?.entries ?? []).map((e: any) => e.name);
  const shadcn = parse(repo.components?.text);
  return {
    stars: repo.stargazerCount,
    homepage: repo.homepageUrl || null,
    createdAt: repo.createdAt,
    pkgPath,
    framework: FRAMEWORKS.filter((f) => f in deps),
    meta: META.filter((f) => f in deps),
    bundler: BUNDLERS.filter((f) => f in deps),
    typescript: "typescript" in deps,
    tailwind: deps.tailwindcss ?? deps["@tailwindcss/vite"] ?? null,
    shadcn: shadcn ? { style: shadcn.style, baseColor: shadcn.tailwind?.baseColor } : null,
    lovable: "lovable-tagger" in deps,
    agentFiles: rootFiles.filter((f) => AGENT_FILES.includes(f)),
    deps: Object.keys(deps).sort(),
  };
}
