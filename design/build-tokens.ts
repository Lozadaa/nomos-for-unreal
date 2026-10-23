// Genera design/tokens.css desde design/tokens.json: `node design/build-tokens.ts`
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const jsonPath = fileURLToPath(new URL("./tokens.json", import.meta.url));
const cssPath = fileURLToPath(new URL("./tokens.css", import.meta.url));

const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

export function buildCss(tokens: any): string {
  const vars: string[] = [];
  for (const [k, v] of Object.entries(tokens.color)) vars.push(`--k-color-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(tokens.font)) vars.push(`--k-font-${k}: ${v};`);
  for (const [k, v] of Object.entries(tokens.size)) vars.push(`--k-size-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(tokens.radius)) vars.push(`--k-radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(tokens.shadow)) vars.push(`--k-shadow-${k}: ${v};`);
  (tokens.space as number[]).forEach((v, i) => vars.push(`--k-space-${i}: ${v}px;`));
  for (const [k, v] of Object.entries(tokens.layout)) vars.push(`--k-layout-${kebab(k)}: ${v}px;`);

  // --k-state-soft: fondo suave del color del estado, mezclado con la superficie
  const state = (prefix: string, map: Record<string, string>): string[] =>
    Object.entries(map).map(([name, colorKey]) =>
      `.k-${prefix}-${kebab(name)} { --k-state: var(--k-color-${kebab(colorKey)}); ` +
      `--k-state-soft: color-mix(in srgb, var(--k-state) 12%, var(--k-color-bg-container)); }`);

  return [
    "/* Generado por design/build-tokens.ts desde design/tokens.json. No editar a mano. */",
    ":root {",
    ...vars.map((v) => `  ${v}`),
    "}",
    "",
    ...state("state", tokens.taskState),
    "",
    ...state("director", tokens.directorState),
    "",
  ].join("\n");
}

/** Canales sRGB lineales (0-1) de un color #RRGGBB u `oklch(L C H [/ A])` (L como número o porcentaje). */
function linearRgb(color: string): [number, number, number] {
  const m = color.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/i);
  if (m) {
    const L = Number(m[1]) / (m[2] ? 100 : 1), C = Number(m[3]), h = (Number(m[4]) * Math.PI) / 180;
    const a = C * Math.cos(h), b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [
      clamp(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
      clamp(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
      clamp(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
    ];
  }
  const h = color.replace("#", "");
  return [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

function luminance(color: string): number {
  const [r, g, b] = linearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Relación de contraste WCAG 2.x entre dos colores (#RRGGBB u oklch sin transparencia). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

if (import.meta.main) {
  writeFileSync(cssPath, buildCss(JSON.parse(readFileSync(jsonPath, "utf8"))));
}
