import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { legacySkillMark } from './legacy.ts';

/** Skills propias que el juego necesita para la UI (hito 5); la del director se queda en Nomos. */
/** `ue-oficio`: lo que un agente tarda horas en redescubrir en UE 5.8 (destilado de per-simmons/unreal-agent-harness). */
export const gameSkills = ['game-ui-art-director', 'ue-umg-ui', 'ue-visual-qa', 'ue-oficio'];
// hito 30: embebido en el juego (`Tools/Nomos`), las skills están en `<juego>/.claude/skills`
const ownSkills = resolve(import.meta.dirname, '..', '..', 'skills');
export const nomosSkills = existsSync(ownSkills) ? ownSkills : resolve(import.meta.dirname, '..', '..', '..', '..', '.claude', 'skills');
export type InstallResult = {name: string; action: 'installed' | 'unchanged' | 'updated' | 'kept-local'; path: string; message?: string};

const own = (name: string) => name.startsWith('.nomos-skill') || name.startsWith(legacySkillMark);
function files(dir: string, base = dir): string[] {
  return readdirSync(dir, {withFileTypes: true}).filter(e => !own(e.name))
    .flatMap(e => e.isDirectory() ? files(join(dir, e.name), base) : [relative(base, join(dir, e.name)).replaceAll('\\', '/')]).sort();
}
function hashOf(dir: string): string {
  const hash = createHash('sha256');
  for (const file of files(dir)) hash.update(file + '\0').update(readFileSync(join(dir, file))).update('\0');
  return hash.digest('hex');
}
function copy(source: string, dest: string): void {
  mkdirSync(dest, {recursive: true});
  for (const file of files(source)) cpSync(join(source, file), join(dest, file), {force: true});
  writeFileSync(join(dest, '.nomos-skill.json'), JSON.stringify({hash: hashOf(source)}) + '\n');
  rmSync(join(dest, legacySkillMark + '.json'), {force: true});
}

/** Copia las skills al juego (`<juego>/.claude/skills`); una copia modificada a mano se conserva y la nueva queda en `.nomos-skill.new`. */
export function installSkills(gameDir: string, sourceDir = nomosSkills): InstallResult[] {
  return gameSkills.map(name => {
    const source = join(sourceDir, name), dest = join(gameDir, '.claude', 'skills', name);
    if (!existsSync(dest)) { copy(source, dest); return {name, action: 'installed', path: dest}; }
    const current = hashOf(dest), wanted = hashOf(source);
    if (current === wanted) return {name, action: 'unchanged', path: dest};
    let installed: string | undefined;
    for (const mark of ['.nomos-skill', legacySkillMark])
      try { installed ??= JSON.parse(readFileSync(join(dest, mark + '.json'), 'utf8')).hash; } catch { /* sin esa marca */ }
    if (installed === current) {
      for (const file of files(dest)) rmSync(join(dest, file), {force: true});
      copy(source, dest);
      return {name, action: 'updated', path: dest};
    }
    const fresh = join(dest, '.nomos-skill.new');
    rmSync(fresh, {recursive: true, force: true});
    for (const file of files(source)) cpSync(join(source, file), join(fresh, file));
    return {name, action: 'kept-local', path: dest,
      message: `${name} tiene cambios locales: se conservan; la versión de Nomos queda en ${fresh}`};
  });
}

/** `nomos skills install [--data .nomos]`: instala en el juego (carpeta padre de los datos). */
export function skillsCli(argv: string[]): boolean {
  if (argv[0] !== 'skills') return false;
  const {values, positionals} = parseArgs({args: argv.slice(1), allowPositionals: true, options: {data: {type: 'string', default: '.nomos'}}});
  if (positionals.join(' ') !== 'install') throw new Error('Uso: nomos skills install [--data CARPETA]');
  const results = installSkills(dirname(resolve(values.data!)));
  for (const result of results) if (result.message) console.error(result.message);
  console.log(JSON.stringify(results));
  return true;
}
