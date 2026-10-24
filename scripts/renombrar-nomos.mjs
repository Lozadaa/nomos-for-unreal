// Hito 11: renombra Kratos → Nomos for Unreal en rutas y textos de todo el repositorio.
// `node scripts/renombrar-nomos.mjs` desde la raíz; idempotente (una segunda pasada no cambia nada).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Hablan del nombre viejo a propósito (compatibilidad hasta el 2026-11-24): se escriben a mano. */
export const skip = new Set([
  'scripts/renombrar-nomos.mjs', 'tests/renombrar-nomos.test.ts', 'service/src/legacy.ts', 'tests/service/legacy.test.ts',
  'service/src/handlers/worker-markers.ts', 'skills/nomos/scripts/kratos.ts', 'panel/src/lib/brand.ts', 'docs/aceptacion-hito11.md',
  'panel/src/lib/brand.test.ts', 'panel/src/visual/art/AgentAvatar.test.tsx', 'panel/scripts/capturas-11.ts', 'scripts/aceptacion-hito11.ps1',
]);

/** Nombres reales (carpetas del usuario, ramas, contenido dentro de los juegos, el alias `kratos.ts`) y la nota histórica: se quedan. */
const keep = [
  /KratosFabTest/gi, /KratosJuegoH4/g, /orca([\\/]+)workspaces\1kratos\b/gi, /se llam(?:ó|aba) Kratos/g, /nomos\/scripts\/kratos\.ts/g, /`scripts\/kratos\.ts` es el alias/g,
  /\/Game\/Kratos\b/g, /Content([\\/]+)Kratos\b/g, /\bKratos(?:Anim|Camera2?|Reference|Probe)\b/g,
  /Docs\/README-kratos\.md/g, /Scripts\/kratos-hito3/g, /outputs\/kratos-fab-nivel1/g, /\bkratos[-/][0-9a-f]{8}\b/g,
];
const swaps = [[/Lozadaa\/kratos\b/g, 'Lozadaa/nomos-for-unreal'], [/KRATOS/g, 'NOMOS'], [/Kratos/g, 'Nomos'], [/kratos/g, 'nomos']];

export function renameText(text) {
  const saved = [];
  let out = text;
  for (const pattern of keep) out = out.replace(pattern, match => `\u0000${saved.push(match) - 1}\u0000`);
  for (const [pattern, to] of swaps) out = out.replace(pattern, to);
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)]);
}

/** Recorre `git ls-files`: reescribe el texto (los binarios no) y mueve con `git mv` lo que lleve el nombre en la ruta. */
export function renameRepo(root = process.cwd()) {
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8'});
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  let edited = 0, moved = 0;
  for (const file of files) {
    if (skip.has(file)) continue;
    const bytes = readFileSync(`${root}/${file}`);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8'), next = renameText(text);
    if (next !== text) { writeFileSync(`${root}/${file}`, next); edited++; }
  }
  for (const file of files) {
    const target = renameText(file);
    if (target === file || skip.has(file)) continue;
    mkdirSync(dirname(`${root}/${target}`), {recursive: true});
    git('mv', file, target); moved++;
    // git mv deja la carpeta vieja vacía en Windows: fuera, subiendo mientras quede vacía
    for (let dir = dirname(file); dir !== '.'; dir = dirname(dir)) try { rmdirSync(`${root}/${dir}`); } catch { break; }
  }
  return {edited, moved};
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) console.log(JSON.stringify(renameRepo()));
