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

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return 0.2126 * channel(h, 0) + 0.7152 * channel(h, 2) + 0.0722 * channel(h, 4);
}

/** Relación de contraste WCAG 2.x entre dos colores #RRGGBB. */
export function contrast(hexA: string, hexB: string): number {
  const [hi, lo] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

if (import.meta.main) {
  writeFileSync(cssPath, buildCss(JSON.parse(readFileSync(jsonPath, "utf8"))));
}
