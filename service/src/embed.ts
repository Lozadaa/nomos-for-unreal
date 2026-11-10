import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { nomosSkills } from './skills-install.ts';

/** Hito 30: Nomos viaja dentro del repo del juego (`Tools/Nomos`, `.claude/skills`, envoltorios y sección en CLAUDE.md). */
const own = resolve(import.meta.dirname, '..', '..');
// jam 2026-11-10: con la semilla, un Nomos embebido también puede hacer `nomos nuevo`
const parts = ['service', 'panel/dist', 'plantillas', 'scripts/instalar-arranque.ps1', 'package.json', 'LICENSE'];
export const embeddedSkills = ['nomos', 'game-ui-art-director', 'ue-umg-ui', 'ue-visual-qa'];
export const claudeSection = `## Nomos

Nomos for Unreal viaja en este repo: servicio y panel en \`Tools/Nomos/\` (versión en \`Tools/Nomos/VERSION\`), skills en \`.claude/skills/\`.
- \`/nomos\` carga la skill del director: «levanta el entorno», «/nomos estado», «/nomos cerrar».
- Donde la skill dice \`nomos …\`, usa el envoltorio de la raíz: \`.\\nomos.cmd …\` (PowerShell/cmd) o \`./nomos.sh …\` (Git Bash); ejecutan \`node Tools/Nomos/service/src/cli.ts …\`.
- Arranque: \`nomos start --data .nomos\`; \`nomos doctor --data .nomos\` dice qué falta (Git, Node ≥ 25, Claude Code, Unreal).
- \`.nomos/\` son datos locales de cada persona y quedan fuera de Git.
- No edites \`Tools/Nomos/\` a mano: se renueva con \`nomos embed <juego> --update\` desde el repo de Nomos.
`;

/** Copia Nomos al juego; no hace commit. Sin `update`, un `Tools/Nomos` existente es un error. */
export function embed(game: string, {update = false, source = own, skills = nomosSkills} = {}): string[] {
  const tools = join(game, 'Tools', 'Nomos');
  if (existsSync(tools) && !update) throw new Error('Tools/Nomos ya existe: usa --update');
  if (!existsSync(join(source, 'panel', 'dist', 'index.html'))) throw new Error('Falta panel/dist: ejecuta npm run build en Nomos');
  rmSync(tools, {recursive: true, force: true});
  for (const part of parts) cpSync(join(source, part), join(tools, part), {recursive: true});
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {cwd: source, encoding: 'utf8', windowsHide: true}).trim();
  writeFileSync(join(tools, 'VERSION'), `${commit} ${new Date().toISOString().slice(0, 10)}\n`);
  for (const name of embeddedSkills) {
    const dest = join(game, '.claude', 'skills', name);
    rmSync(dest, {recursive: true, force: true});
    cpSync(join(skills, name), dest, {recursive: true, filter: path => !/[\/]node_modules$/.test(path)});
  }
  writeFileSync(join(game, 'nomos.cmd'), '@echo off\r\nnode "%~dp0Tools\\Nomos\\service\\src\\cli.ts" %*\r\n');
  writeFileSync(join(game, 'nomos.sh'), '#!/bin/sh\nexec node "$(dirname "$0")/Tools/Nomos/service/src/cli.ts" "$@"\n', {mode: 0o755});
  const claude = join(game, 'CLAUDE.md'), text = existsSync(claude) ? readFileSync(claude, 'utf8') : '';
  const section = /^## Nomos[ \t]*\r?\n[\s\S]*?(?=^## |(?![\s\S]))/m;
  writeFileSync(claude, section.test(text) ? text.replace(section, claudeSection + '\n').replace(/\n+$/, '\n')
    : (text ? text.replace(/\s*$/, '\n\n') : '') + claudeSection);
  const ignore = join(game, '.gitignore'), lines = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  if (!/^\/?\.nomos\/?\s*$/m.test(lines)) writeFileSync(ignore, (lines ? lines.replace(/\s*$/, '\n') : '') + '.nomos/\n');
  return ['Tools/Nomos', ...embeddedSkills.map(name => `.claude/skills/${name}`), 'nomos.cmd', 'nomos.sh', 'CLAUDE.md', '.gitignore'];
}

/** `nomos embed <juego> [--update]`. */
export function embedCli(argv: string[]): boolean {
  if (argv[0] !== 'embed') return false;
  const {values, positionals} = parseArgs({args: argv.slice(1), allowPositionals: true,
    options: {update: {type: 'boolean', default: false}, data: {type: 'string'}}});
  if (positionals.length !== 1) throw new Error('Uso: nomos embed <juego> [--update]');
  const game = resolve(positionals[0]);
  if (!existsSync(game)) throw new Error(`No existe ${game}`);
  for (const path of embed(game, {update: values.update})) console.log(path);
  console.log('Listo para commit en el juego (Nomos no hace commit).');
  return true;
}
