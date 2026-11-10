import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, buildCss } from "../design/build-tokens.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const tokens = JSON.parse(readFileSync(join(root, "design/tokens.json"), "utf8"));
const { color } = tokens;

test("tokens.json v2 tiene todas las claves, 10 estados de tarea y 5 del director", () => {
  const expected = {
    color: ["primary", "primaryHover", "primaryText", "bgLayout", "bgContainer", "bgSubtle", "text", "textSecondary",
      "textTertiary", "border", "borderDefault", "borderStrong", "focus", "success", "warning", "error", "info", "neutral", "purple"],
    font: ["sans", "serif", "mono"],
    size: ["xs", "sm", "md", "lg", "xl", "xxl"],
    radius: ["sm", "md", "lg"],
    layout: ["header", "drawer", "control", "tabs", "content"],
  };
  for (const [group, keys] of Object.entries(expected)) {
    for (const key of keys) assert.ok(key in tokens[group], `falta ${group}.${key}`);
  }
  assert.deepEqual(tokens.shadow, {}, "papel: sin sombras");
  assert.deepEqual(Object.keys(tokens.colorDark), Object.keys(color), "el oscuro tiene las mismas claves");
  assert.equal(tokens.font.sans, "Instrument Sans Variable");
  assert.equal(tokens.font.serif, "Newsreader Variable");
  assert.equal(tokens.font.mono, "Geist Mono Variable");
  assert.equal(tokens.radius.sm, 8);
  assert.equal(tokens.radius.md, 12);
  assert.deepEqual(tokens.space, [4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
  assert.equal(Object.keys(tokens.taskState).length, 10);
  assert.equal(Object.keys(tokens.directorState).length, 5);
  const permitidos = ["success", "warning", "error", "info", "neutral", "primary"];
  for (const target of [...Object.values(tokens.taskState), ...Object.values(tokens.directorState)] as string[]) {
    assert.ok(target in color, `el estado apunta a un color inexistente: ${target}`);
    assert.ok(permitidos.includes(target), `estado fuera de la paleta de puntos: ${target}`);
  }
});

test("tokens.css generado coincide con el JSON y lleva los colores exactos del logo", () => {
  const css = readFileSync(join(root, "design/tokens.css"), "utf8");
  assert.equal(css, buildCss(tokens), "design/tokens.css está desfasado: ejecuta `node design/build-tokens.ts`");
  execFileSync(process.execPath, [join(root, "design/build-tokens.ts")]);
  assert.equal(readFileSync(join(root, "design/tokens.css"), "utf8"), css);
  for (const line of [
    "--k-color-bg-layout: #F5F0E8;",
    "--k-color-text: #1F1E1D;",
    "--k-color-primary-hover: #C96442;",
    "--k-color-primary: #A9502F;",
    "--k-font-sans: Instrument Sans Variable;",
    "--k-size-md: 14px;",
    "--k-radius-sm: 8px;",
    "--k-radius-md: 12px;",
    "--k-space-9: 64px;",
    "--k-layout-header: 56px;",
    ".k-state-pendiente { --k-state: var(--k-color-neutral);",
    ".k-director-escuchando { --k-state: var(--k-color-success);",
    ".k-director-vigilante-caido { --k-state: var(--k-color-warning);",
  ]) assert.ok(css.includes(line), `tokens.css no contiene: ${line}`);
  assert.ok(!css.includes("--k-shadow"), "no hay sombras");
});

test("contraste AA en claro (principal) y en oscuro", () => {
  for (const c of [color, tokens.colorDark]) {
    assert.ok(contrast(c.text, c.bgLayout) >= 4.5, "text sobre surface-primary");
    assert.ok(contrast(c.textSecondary, c.bgLayout) >= 4.5, "textSecondary sobre surface-primary");
    assert.ok(contrast(c.text, c.bgSubtle) >= 4.5, "text sobre surface-secondary");
    assert.ok(contrast(c.textSecondary, c.bgSubtle) >= 4.5, "textSecondary sobre surface-secondary");
    assert.ok(contrast(c.textTertiary, c.bgSubtle) >= 4.5, "textTertiary sobre surface-secondary");
    assert.ok(contrast(c.primaryText, c.primary) >= 4.5, "texto de la acción primaria");
    assert.ok(contrast(c.focus, c.bgLayout) >= 3, "foco (indicador no textual, 3:1)");
    // la arcilla exacta del logo (#C96442, primaryHover en claro) solo pinta marcas y cifras grandes: 3:1
    assert.ok(contrast(c.primaryHover, c.bgLayout) >= 3, "acento de marca sobre el papel");
    for (const k of ["success", "warning", "error", "info", "neutral"]) {
      assert.ok(contrast(c[k], c.bgLayout) >= 4.5, `${k} < 4.5:1 sobre surface-primary`);
    }
  }
});
test("contrast acepta hex y oklch", () => {
  assert.ok(Math.abs(contrast("#000000", "#FFFFFF") - 21) < 0.01);
  assert.ok(Math.abs(contrast("oklch(0 0 0)", "oklch(1 0 0)") - 21) < 0.05);
  assert.ok(Math.abs(contrast("oklch(0.5 0 0)", "oklch(0 0 0)") - contrast("#636363", "#000000")) < 0.1);
});

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return /\.(html|css)$/.test(name) && name !== "tokens.css" ? [path] : [];
  });
}

const NOMBRES = "white|black|red|green|blue|gr[ae]y|orange|purple|yellow|tomato|navy|silver|pink|teal|maroon|olive|lime|aqua|cyan|magenta|gold|brown|coral|crimson|indigo|violet|salmon|khaki|beige|ivory|lavender|plum|orchid|turquoise";
const PROPIEDAD_COLOR = "color|background(?:-color)?|border(?:-[a-z]+)*|fill|stroke|outline(?:-color)?|accent-color|caret-color";
const reColorNombre = new RegExp(String.raw`\b(?:${PROPIEDAD_COLOR})\s*[:=]\s*["']?[^;}"']*(?<![-\w])(?:${NOMBRES})(?![-\w(])`, "i");

// Devuelve los motivos por los que una línea de HTML o CSS lleva valores de diseño a mano.
function handWritten(line: string): string[] {
  const out: string[] = [];
  if (/#[0-9a-fA-F]{3,8}\b/.test(line)) out.push("color hexadecimal");
  if (/\b(rgba?|hsla?|hwb|oklch|oklab|lab|lch|color)\(/i.test(line)) out.push("color funcional");
  if (reColorNombre.test(line)) out.push("color con nombre");
  for (const m of line.matchAll(/box-shadow\s*:([^;}"]*)/gi)) {
    const resto = m[1].replace(/!important/gi, "").replace(/var\(--k-shadow-[12]\)|none|,|\s/g, "");
    if (resto) out.push("sombra a mano");
  }
  for (const m of line.matchAll(/text-shadow\s*:([^;}"]*)/gi)) if (m[1].trim() !== "none") out.push("sombra a mano");
  if (/drop-shadow\(/i.test(line)) out.push("sombra a mano");
  if (/font-size\s*:(?!\s*(var\(|inherit|calc\(var))/i.test(line)) out.push("tamaño de letra a mano");
  if (/\bfont\s*:[^;}"]*[\d.]+(px|rem|em)\b/i.test(line)) out.push("tamaño de letra a mano");
  for (const m of line.matchAll(/radius\s*:([^;}"]*)/gi)) {
    const v = m[1].trim();
    if (v !== "50%" && /[\d.]+(px|rem|em|%)/.test(v)) out.push("radio a mano");
  }
  if (/(linear|radial|conic)-gradient\(/i.test(line)) out.push("degradado");
  if (/style\s*=\s*"[^"]*[\d.]+px/i.test(line)) out.push("tamaño en px dentro de style");
  return out;
}

test("el escáner de valores a mano detecta los casos que antes se le escapaban", () => {
  const casos: Record<string, string> = {
    "color: tomato;": "color con nombre",
    '<rect fill="navy"/>': "color con nombre",
    "background: silver !important;": "color con nombre",
    "color: hwb(200 10% 10%);": "color funcional",
    "color: color(srgb 1 0 0);": "color funcional",
    "font: 600 13px/1 sans-serif;": "tamaño de letra a mano",
    "font-size: small;": "tamaño de letra a mano",
    "font-size: calc(13px + 1px);": "tamaño de letra a mano",
    "border-radius: 9px;": "radio a mano",
    "border-top-left-radius: 9px;": "radio a mano",
    "border-radius: var(--k-radius-md) 4px;": "radio a mano",
    "border-radius: 40%;": "radio a mano",
    "box-shadow: var(--k-shadow-1), 0 0 0 4px var(--k-color-primary);": "sombra a mano",
    "box-shadow: inset 0 1px var(--k-color-border);": "sombra a mano",
    "text-shadow: 0 1px var(--k-color-text);": "sombra a mano",
    "filter: drop-shadow(0 2px var(--k-color-text));": "sombra a mano",
    "background: linear-gradient(var(--k-color-primary), var(--k-color-info));": "degradado",
    "background: repeating-linear-gradient(135deg, var(--k-color-border) 0 6px);": "degradado",
    '<div style="width:240px">': "tamaño en px dentro de style",
    '<div style="max-width: 1180px">': "tamaño en px dentro de style",
  };
  for (const [linea, motivo] of Object.entries(casos)) {
    assert.ok(handWritten(linea).includes(motivo), `debería detectar «${motivo}» en: ${linea} (detectó: ${JSON.stringify(handWritten(linea))})`);
  }
  // lo permitido no se marca
  for (const ok of [
    "box-shadow: var(--k-shadow-1);", "box-shadow: var(--k-shadow-2), var(--k-shadow-1);", "box-shadow: none;",
    "font-size: var(--k-size-sm);", "font: 600 var(--k-size-xs)/1 var(--k-font-mono);", "font-size: inherit;",
    "border-radius: var(--k-radius-md);", "border-radius: 50%;", "border: 1px solid var(--k-color-border);",
    "background: color-mix(in srgb, var(--k-color-primary) 8%, var(--k-color-bg-container));",
    "--card-h: 56px; --col-w: 176px;", '<div style="margin-top:var(--k-space-2)">', "width: 1px; height: 1px;",
  ]) assert.deepEqual(handWritten(ok), [], `no debería marcar: ${ok}`);
});

test("las maquetas y /estilo no llevan colores, tamaños de letra, radios ni sombras a mano", () => {
  const files = htmlFiles(join(root, "design"));
  assert.ok(files.some((f) => f.endsWith("componentes.css")), "la prueba debe revisar también los .css");
  const bad: string[] = [];
  for (const file of files) {
    const rel = relative(root, file).split(sep).join("/");
    // las etiquetas <link> (fuentes) pueden llevar cualquier cosa; el resto, no
    const source = readFileSync(file, "utf8").replace(/<link\b[^>]*>/gi, "");
    source.split("\n").forEach((line, i) => {
      for (const motivo of handWritten(line)) bad.push(`${motivo} · ${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
