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

test("tokens.json tiene todas las claves y 10 estados de tarea y 5 del director", () => {
  const expected = {
    color: ["primary", "primaryHover", "primaryText", "bgLayout", "bgContainer", "bgSubtle", "text", "textSecondary",
      "textTertiary", "border", "success", "warning", "error", "info", "neutral", "purple"],
    font: ["sans", "mono"],
    size: ["xs", "sm", "md", "lg", "xl", "xxl"],
    radius: ["sm", "md", "lg"],
    shadow: ["1", "2"],
    layout: ["sidebar", "sidebarCollapsed", "header", "drawer", "control"],
  };
  for (const [group, keys] of Object.entries(expected)) {
    for (const key of keys) assert.ok(key in tokens[group], `falta ${group}.${key}`);
  }
  assert.deepEqual(tokens.space, [4, 8, 12, 16, 24, 32, 48]);
  assert.equal(Object.keys(tokens.taskState).length, 10);
  assert.equal(Object.keys(tokens.directorState).length, 5);
  for (const target of [...Object.values(tokens.taskState), ...Object.values(tokens.directorState)]) {
    assert.ok(target in color, `el estado apunta a un color inexistente: ${target}`);
  }
});

test("tokens.css generado coincide con el JSON", () => {
  execFileSync(process.execPath, [join(root, "design/build-tokens.ts")]);
  const css = readFileSync(join(root, "design/tokens.css"), "utf8");
  assert.equal(css, buildCss(tokens));
  for (const line of [
    `--k-color-primary: ${color.primary};`,
    "--k-color-primary-hover: ",
    "--k-size-md: 14px;",
    "--k-radius-md: 8px;",
    `--k-shadow-1: ${tokens.shadow["1"]};`,
    "--k-space-3: 16px;",
    "--k-layout-sidebar: 248px;",
    "--k-layout-drawer: 720px;",
    ".k-state-pendiente { --k-state: var(--k-color-neutral);",
    ".k-director-escuchando { --k-state: var(--k-color-success);",
    ".k-director-vigilante-caido { --k-state: var(--k-color-warning);",
  ]) assert.ok(css.includes(line), `tokens.css no contiene: ${line}`);
});

test("contraste AA", () => {
  assert.ok(contrast(color.text, color.bgContainer) >= 4.5);
  assert.ok(contrast(color.textSecondary, color.bgContainer) >= 4.5);
  assert.ok(contrast(color.primaryText, color.primary) >= 4.5);
  for (const k of ["success", "warning", "error", "info", "purple", "neutral"]) {
    assert.ok(contrast(color[k], color.bgContainer) >= 3, `${k} < 3:1 sobre bgContainer`);
  }
});

test("contraste AA de los textos de apoyo y del hover del botón", () => {
  assert.ok(contrast(color.primaryText, color.primaryHover) >= 4.5);
  assert.ok(contrast(color.textTertiary, color.bgContainer) >= 4.5);
  assert.ok(contrast(color.textTertiary, color.bgLayout) >= 4.5, "textTertiary sobre el gris de fondo");
  assert.ok(contrast(color.textSecondary, color.bgLayout) >= 4.5);
  assert.ok(contrast(color.text, color.bgSubtle) >= 4.5);
  assert.ok(contrast(color.primary, color.bgContainer) >= 4.5, "enlaces y foco en azul");
});

function htmlFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return htmlFiles(path);
    return /\.(html|css)$/.test(name) && name !== "tokens.css" ? [path] : [];
  });
}

test("las maquetas y /estilo no llevan colores, tamaños de letra, radios ni sombras a mano", () => {
  const files = htmlFiles(join(root, "design"));
  assert.ok(files.some((f) => f.endsWith("componentes.css")), "la prueba debe revisar también los .css");
  const bad: string[] = [];
  for (const file of files) {
    const rel = relative(root, file).split(sep).join("/");
    // las etiquetas <link> (fuentes) pueden llevar cualquier cosa; el resto, no
    const source = readFileSync(file, "utf8").replace(/<link\b[^>]*>/gi, "");
    source.split("\n").forEach((line, i) => {
      const where = `${rel}:${i + 1}: ${line.trim().slice(0, 80)}`;
      if (/#[0-9a-fA-F]{3,8}\b/.test(line)) bad.push(`color hexadecimal · ${where}`);
      if (/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/i.test(line)) bad.push(`color funcional · ${where}`);
      if (/(^|[\s;:"'])(white|black|red|green|blue|gr[ae]y|orange|purple|yellow)\s*[;"'}]/i.test(line)) bad.push(`color con nombre · ${where}`);
      if (/box-shadow\s*:(?!\s*(var\(--k-shadow-[12]\)|none))/i.test(line)) bad.push(`sombra a mano · ${where}`);
      if (/font-size\s*:\s*[\d.]+(px|rem|em)/i.test(line)) bad.push(`tamaño de letra a mano · ${where}`);
      if (/border-radius\s*:\s*[\d.]+(px|rem|em)/i.test(line)) bad.push(`radio a mano · ${where}`);
    });
  }
  assert.deepEqual(bad, [], bad.join("\n"));
});
