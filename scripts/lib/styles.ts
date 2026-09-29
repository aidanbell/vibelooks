// Styling extraction: pick a repo's CSS, Tailwind config and component files,
// then pull out colours, gradients, radii, fonts, icons and "vibe" effects.

import { gh, graphql } from "./github.ts";
import { TW_FAMILY, toBucket, type Bucket } from "./color.ts";

// ---- 1. Choose which files to read ----

const SKIP_DIR = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|coverage|vendor|public|static|__tests__|__mocks__|e2e|tests?|\.storybook|storybook-static|docs?)\//;
const SKIP_FILE = /\.(test|spec|stories|d)\.|\.min\./;
const STYLE_EXT = /\.(css|scss)$/;
const SOURCE_EXT = /\.(tsx|jsx|vue|svelte|astro|html)$/;
const TW_CONFIG = /(^|\/)tailwind\.config\.(js|cjs|mjs|ts)$/;

function score(path: string): number {
  const name = path.split("/").pop()!;
  if (/^(globals?|index|app|main|styles?|tailwind)\.css$/.test(name)) return 100;
  if (TW_CONFIG.test(path)) return 90;
  if (STYLE_EXT.test(name)) return 60;
  if (/^(layout|page|App|index|main|_app|_document|Home|Landing|Hero)\.(tsx|jsx|vue|svelte|astro)$/.test(name)) return 50;
  if (name === "index.html") return 45;
  if (/\/(components|app|pages|routes|views|sections|layouts)\//.test(path)) return 30;
  return 10;
}

function pickFiles(tree: { path: string; type: string; size?: number }[], maxFiles: number): string[] {
  return tree
    .filter((e) => e.type === "blob" && (e.size ?? 0) < 60_000)
    .filter((e) => !SKIP_DIR.test(e.path) && !SKIP_FILE.test(e.path))
    .filter((e) => STYLE_EXT.test(e.path) || SOURCE_EXT.test(e.path) || TW_CONFIG.test(e.path))
    // Skip shadcn's untouched primitives; they'd make every shadcn repo look identical.
    .filter((e) => !/\/components\/ui\//.test(e.path))
    .sort((a, b) => score(b.path) - score(a.path) || a.path.length - b.path.length)
    .slice(0, maxFiles)
    .map((e) => e.path);
}

// ---- 2. Fetch file contents in GraphQL batches ----

async function fetchFiles(full: string, rev: string, paths: string[]): Promise<Record<string, string>> {
  const [owner, name] = full.split("/");
  const out: Record<string, string> = {};
  let batch = 20;
  for (let i = 0; i < paths.length; ) {
    const chunk = paths.slice(i, i + batch);
    const fields = chunk
      .map((p, k) => `f${k}: object(expression: ${JSON.stringify(`${rev}:${p}`)}) { ... on Blob { text } }`)
      .join("\n");
    try {
      const res = await graphql(`{ repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} } }`);
      chunk.forEach((p, k) => {
        const text = res.data?.repository?.[`f${k}`]?.text;
        if (text) out[p] = text;
      });
      i += chunk.length;
    } catch (err) {
      if (chunk.length === 1) { i += 1; continue; }
      batch = Math.max(1, Math.floor(chunk.length / 2));
    }
  }
  return out;
}

// ---- 3. Extract ----

const inc = (m: Record<string, number>, k: string, n = 1) => (m[k] = (m[k] ?? 0) + n);
const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

const TW_COLOR = /\b(?:bg|text|from|via|to|border|ring|fill|stroke|shadow|outline|decoration|accent|divide|placeholder)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;
const RADIUS = /\brounded(-(?:none|sm|md|lg|xl|2xl|3xl|4xl|full))?(?![\w-])/g;
const STATUS = /error|danger|destructive|delete|remove|warn|success|invalid|alert|status|toast|badge|severity|priority|chart|syntax|hljs|shiki|prism/i;
const CSS_COLOR = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|oklch)\([^)]*\)/g;

// Block comments anywhere, and whole-line // comments (not the // in URLs).
// Otherwise "see #2166" in a comment reads as a hex colour.
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function gradientStop(text: string, stop: "from" | "to"): string | null {
  // Lookbehind rather than \b so "bg-gradient-to-r" doesn't read as a "to-" stop.
  for (const m of text.matchAll(new RegExp(`(?<![\\w-])${stop}-([a-z]+)`, "g"))) {
    if (TW_FAMILY[m[1]]) return TW_FAMILY[m[1]];
    if (["white", "black", "transparent"].includes(m[1])) return "neutral";
    if (["primary", "secondary", "accent", "brand", "background", "foreground", "muted", "card"].includes(m[1])) return "theme";
  }
  return null;
}

const GENERIC_FONTS = new Set(["system-ui", "-apple-system", "blinkmacsystemfont", "sans-serif", "serif", "monospace", "ui-sans-serif", "ui-serif", "ui-monospace", "segoe ui", "inherit", "initial", "cursive"]);

function cleanFont(raw: string): string | null {
  const first = raw.split(",")[0].trim().replace(/^["']|["']$/g, "").trim();
  if (!first || first.startsWith("var(") || first.startsWith("theme(") || first.startsWith("$")) return null;
  if (GENERIC_FONTS.has(first.toLowerCase())) return "(system stack)";
  return first.replace(/_/g, " ").replace(/\s+Variable$/, "");
}

export function extract(files: Record<string, string>, deps: string[]) {
  const twFamilies: Record<string, number> = {};
  const accent: Record<string, number> = {};
  const radius: Record<string, number> = {};
  const gradientPairs: Record<string, number> = {};
  const fonts = new Set<string>();
  const icons = new Set<string>();
  const emoji: Record<string, number> = {};
  let gradients = 0, gradientText = 0, darkClasses = 0, blur = 0, glow = 0, animate = 0;
  let primary: Bucket | null = null, cssRadius: string | null = null, darkCss = false;

  for (const [path, raw] of Object.entries(files)) {
    const isStyle = STYLE_EXT.test(path);
    const text = stripComments(raw);

    const lines = text.split("\n");
    lines.forEach((line, n) => {
      // Colours from Tailwind classes (also picks up @apply in CSS). Lines about
      // errors/success/etc. are status colours, not the site's palette, so they
      // don't count towards the accent.
      const status = STATUS.test(line);
      for (const m of line.matchAll(TW_COLOR)) {
        inc(twFamilies, m[1]);
        if (!status && TW_FAMILY[m[1]] !== "neutral") inc(accent, TW_FAMILY[m[1]]);
      }
      // Literal colours in CSS count towards the accent too, at lower weight.
      if (isStyle && !status) {
        for (const c of line.matchAll(CSS_COLOR)) {
          const b = toBucket(c[0]);
          if (b && b !== "neutral") inc(accent, b, 0.5);
        }
      }

      // Gradients: count them and record the from→to pair. Class lists often
      // wrap, so look at this line and the next two.
      if (/bg-(gradient|linear|radial|conic)-|linear-gradient\(|radial-gradient\(/.test(line)) {
        gradients++;
        const window = lines.slice(n, n + 3).join(" ");
        const from = gradientStop(window, "from");
        const to = gradientStop(window, "to");
        if (from && to) inc(gradientPairs, `${from} → ${to}`);
      }
      if (/bg-clip-text/.test(line) && /text-transparent/.test(line)) gradientText++;
    });

    for (const m of text.matchAll(RADIUS)) inc(radius, m[1] ? `rounded${m[1]}` : "rounded");
    darkClasses += text.match(/\bdark:/g)?.length ?? 0;
    blur += text.match(/\bbackdrop-blur|backdrop-filter/g)?.length ?? 0;
    glow += text.match(/shadow-\[0_0_|shadow-[a-z]+-\d{3}\/|box-shadow:\s*0 0 \d+px/g)?.length ?? 0;
    animate += text.match(/\banimate-(?!none)|@keyframes/g)?.length ?? 0;

    if (isStyle) {
      if (/\.dark\s*[{,]|@custom-variant\s+dark|prefers-color-scheme:\s*dark/.test(text)) darkCss = true;
      // shadcn theme vars: first --primary is the light-mode one.
      const p = text.match(/--(?:color-)?(?:primary|brand|accent)(?:-500|-600)?\s*:\s*([^;]+);/);
      if (p && !primary) primary = toBucket(p[1]);
      const r = text.match(/--radius\s*:\s*([^;]+);/);
      if (r && !cssRadius) cssRadius = r[1].trim();
    }

    // Fonts: next/font, geist, Google Fonts links, CSS declarations, Tailwind config.
    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/google["']/g))
      for (const f of m[1].split(",")) { const n = cleanFont(f.split(/\s+as\s+/)[0]); if (n) fonts.add(n); }
    if (/from\s*["']geist\/font/.test(text)) fonts.add("Geist");
    for (const m of text.matchAll(/fonts\.googleapis\.com\/css2?\?[^"')\s]+/g))
      for (const f of m[0].matchAll(/family=([^&:;]+)/g)) fonts.add(decodeURIComponent(f[1]).replace(/\+/g, " "));
    for (const m of text.matchAll(/(?:font-family|--font-(?:sans|heading|display|body))\s*:\s*([^;}\n]+)/g)) {
      const n = cleanFont(m[1]); if (n) fonts.add(n);
    }
    for (const m of text.matchAll(/(?:sans|display|heading)\s*:\s*\[\s*["']([^"']+)["']/g)) {
      const n = cleanFont(m[1]); if (n) fonts.add(n);
    }

    for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g))
      for (const i of m[1].split(",")) {
        const n = i.split(/\s+as\s+/)[0].trim().replace(/Icon$/, "").replace(/^type\s+/, "");
        if (n) icons.add(n);
      }

    if (!isStyle) for (const m of text.matchAll(/\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/gu)) inc(emoji, m[0].replace("\uFE0F", ""));
  }

  for (const d of deps) {
    const m = d.match(/^@fontsource(?:-variable)?\/(.+)$/);
    if (m) fonts.add(m[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  // Drop font names that are really CSS var references we couldn't resolve.
  const fontList = [...fonts].filter((f) => !/^--|^var/.test(f));

  const emojiTotal = Object.values(emoji).reduce((a, b) => a + b, 0);
  return {
    // A declared primary/brand colour is the strongest signal we have.
    accent: primary && primary !== "neutral" ? primary : top(accent),
    primary,
    twFamilies,
    gradients,
    gradientPair: top(gradientPairs),
    gradientText: gradientText > 0,
    radius: top(radius),
    cssRadius,
    fonts: fontList,
    icons: [...icons],
    emoji: { total: emojiTotal, top: Object.entries(emoji).sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => e[0]) },
    darkMode: darkCss || darkClasses > 5 || deps.includes("next-themes"),
    effects: { blur: blur > 0, glow: glow > 0, animate: animate > 0 },
  };
}

// Scan one repo. Returns null if the repo is gone or has nothing to read.
export async function scanRepo(r: { repo: string; rev?: string; pkgPath: string; deps: string[] }, maxFiles = 40) {
  const rev = r.rev ?? "HEAD";
  let tree;
  try {
    tree = await gh(`https://api.github.com/repos/${r.repo}/git/trees/${rev}?recursive=1`);
  } catch {
    return null; // empty, deleted or renamed
  }
  // In a monorepo, stay inside the app whose package.json made it a frontend repo.
  const dir = r.pkgPath.includes("/") ? r.pkgPath.slice(0, r.pkgPath.lastIndexOf("/") + 1) : "";
  const paths = pickFiles(tree.tree.filter((e: any) => e.path.startsWith(dir)), maxFiles);
  const files = await fetchFiles(r.repo, rev, paths);
  if (!Object.keys(files).length) return null;
  return { filesScanned: Object.keys(files).length, ...extract(files, r.deps) };
}
