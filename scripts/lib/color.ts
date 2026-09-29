// Turn any CSS colour we come across into a coarse hue bucket ("purple", "neutral", ...).

export type Bucket = "neutral" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "indigo" | "purple" | "pink";

// Tailwind palette family -> bucket.
export const TW_FAMILY: Record<string, Bucket> = {
  slate: "neutral", gray: "neutral", zinc: "neutral", neutral: "neutral", stone: "neutral",
  red: "red", rose: "red",
  orange: "orange",
  amber: "yellow", yellow: "yellow",
  lime: "green", green: "green", emerald: "green",
  teal: "teal", cyan: "teal",
  sky: "blue", blue: "blue",
  indigo: "indigo",
  violet: "purple", purple: "purple",
  fuchsia: "pink", pink: "pink",
};

function hueBucket(h: number, s: number, l: number): Bucket {
  if (s < 0.15 || l < 0.18 || l > 0.95) return "neutral";
  if (h < 15 || h >= 345) return "red";
  if (h < 40) return "orange";
  if (h < 65) return "yellow";
  if (h < 160) return "green";
  if (h < 195) return "teal";
  if (h < 235) return "blue";
  if (h < 250) return "indigo";
  if (h < 300) return "purple";
  return "pink";
}

function rgbToHsl(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function oklchToRgb(L: number, C: number, H: number) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gamma = (x: number) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
    return Math.min(1, Math.max(0, v));
  };
  return [
    gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const num = (v: string, scale = 1) => (v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v) / scale);

// Accepts "#8b5cf6", "rgb(...)", "hsl(...)", "oklch(...)", or shadcn's bare "262.1 83.3% 57.8%" HSL triplet.
export function toBucket(raw: string): Bucket | null {
  const v = raw.trim().toLowerCase();
  let hex = v.match(/^#([0-9a-f]{3,8})\b/)?.[1];
  if (hex) {
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16) / 255);
    const { h, s, l } = rgbToHsl(r, g, b);
    return hueBucket(h, s, l);
  }
  const fn = v.match(/^(rgba?|hsla?|oklch)\(([^)]*)\)/);
  const parts = (fn ? fn[2] : v).split(/[\s,/]+/).filter(Boolean);
  const kind = fn?.[1] ?? (/^[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%/.test(v) ? "hsl" : null);
  if (!kind || parts.length < 3 || parts.slice(0, 3).some((p) => isNaN(parseFloat(p)))) return null;
  if (kind.startsWith("rgb")) {
    const { h, s, l } = rgbToHsl(num(parts[0], 255), num(parts[1], 255), num(parts[2], 255));
    return hueBucket(h, s, l);
  }
  if (kind.startsWith("hsl")) {
    return hueBucket(parseFloat(parts[0]), num(parts[1], 100), num(parts[2], 100));
  }
  // oklch: chroma under ~0.03 is visually grey regardless of hue.
  const C = parseFloat(parts[1]);
  if (C < 0.03) return "neutral";
  const [r, g, b] = oklchToRgb(num(parts[0]), C, parseFloat(parts[2]));
  const { h, s, l } = rgbToHsl(r, g, b);
  return hueBucket(h, s, l);
}
