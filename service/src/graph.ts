import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { enqueue } from './commands.ts';
import { readConfig } from './config.ts';
import { runLogged } from './adapters/process.ts';
import type { Handler } from './runner.ts';

/** Hito 23: grafo de graphify de cada juego (`graphify-out/`), que workers y revisores consultan antes de leer archivos. */
const home = (env: NodeJS.ProcessEnv) => env.USERPROFILE ?? env.HOME ?? homedir();

/** `NOMOS_GRAPHIFY` (ruta o `off`, pruebas) y si no el CLI en PATH o en ~/.local/bin. */
export function findGraphify(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NOMOS_GRAPHIFY) return env.NOMOS_GRAPHIFY !== 'off' && existsSync(env.NOMOS_GRAPHIFY) ? env.NOMOS_GRAPHIFY : null;
  const dirs = [...(env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean), join(home(env), '.local', 'bin')];
  for (const dir of dirs) for (const name of ['graphify.exe', 'graphify.cmd', 'graphify']) if (existsSync(join(dir, name))) return join(dir, name);
  return null;
}

/** Ponytail es un plugin de Claude Code: `enabledPlugins["ponytail@ponytail"]` en ~/.claude/settings.json. */
export function ponytailEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  try { return JSON.parse(readFileSync(join(env.CLAUDE_CONFIG_DIR ?? join(home(env), '.claude'), 'settings.json'), 'utf8')).enabledPlugins?.['ponytail@ponytail'] === true; }
  catch { return false; }
}

// solo el texto del juego: nunca .uasset/.umap, ni Binaries, Intermediate, Saved o Plugins
const allow = '/*\n!Source/\n!Config/\n!docs/\n!Content/\n!Content/**/\nContent/**/*.*\n!Content/**/*.json\n!Content/**/*.ini\n!Content/**/*.md\n';

/** Hito 26: graphify solo indexa código; sin `.cpp`/`.h` bajo `Source/` (juego solo Blueprints) queda apagado. */
export function hasCode(projectDir: string): boolean {
  try { return readdirSync(join(projectDir, 'Source'), {recursive: true}).some(f => /\.(cpp|h)$/i.test(String(f))); } catch { return false; }
}

/** Encola `graph.update` (crea o actualiza el grafo) salvo `graphify.enabled:false`, sin graphify, fuera de un juego, sin C++ o con uno ya en cola. */
export function queueGraph(db: DatabaseSync, dataDir: string, projectDir = dirname(dataDir)): boolean {
  if ((readConfig(dataDir) as {graphify?: {enabled?: boolean}}).graphify?.enabled === false || !findGraphify()) return false;
  if (!readdirSync(projectDir).some(f => f.endsWith('.uproject')) || !hasCode(projectDir)) return false;
  if (db.prepare("select 1 from commands where type='graph.update' and state in ('pending','running')").get()) return false;
  const ignore = join(projectDir, '.gitignore'), ignored = existsSync(ignore) ? readFileSync(ignore, 'utf8') : '';
  const missing = ['graphify-out/', '.graphifyignore'].filter(line => !ignored.split(/\r?\n/).includes(line));
  if (missing.length) appendFileSync(ignore, (ignored && !ignored.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n');
  if (!existsSync(join(projectDir, '.graphifyignore'))) writeFileSync(join(projectDir, '.graphifyignore'), allow);
  enqueue(db, 'graph.update', {}, `graph.update:${randomUUID()}`);
  return true;
}

/** `graphify . [--update] --no-viz --code-only` desde el juego (el CLI parte las rutas con espacios y sale con 0 aunque falle). */
export const graphUpdate: Handler = async (_command, ctx) => {
  const bin = findGraphify();
  if (!bin) return {skipped: 'graphify no encontrado'};
  const update = existsSync(join(ctx.projectDir, 'graphify-out', 'graph.json'));
  const {exitCode, log} = await runLogged(bin, ['.', ...(update ? ['--update'] : []), '--no-viz', '--code-only'], {timeoutMs: 30 * 60_000, cwd: ctx.projectDir});
  if (exitCode !== 0 || !existsSync(join(ctx.projectDir, 'graphify-out', 'graph.json'))) throw new Error(`graphify_failed: ${log.trim().split('\n').at(-1) ?? exitCode}`);
  return {update};
};
