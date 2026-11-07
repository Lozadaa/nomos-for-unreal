import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * x10: ajustes de Claude Code para las sesiones que lanza Nomos (workers, revisores, director). Medido el 7 nov:
 * el primer turno de un worker cargaba 68 k tokens, 8,5 k de ellos de plugins del usuario que un juego no usa
 * (marketing, SEO, Vercel…); y el 60 % de los tokens de los workers de Herbalist se gastó en turnos con más de 300 k
 * de contexto. Se quedan los plugins que Nomos pide o el usuario quiere en los juegos; la sesión compacta a 200 k.
 * Los hooks, las skills del usuario y su MCP no se tocan.
 */
export const keepPlugins = ['superpowers', 'code-review', 'ponytail'];
export const compactWindow = 200_000;

export function leanSettings(user: {enabledPlugins?: Record<string, unknown>}): Record<string, unknown> {
  const off = Object.entries(user.enabledPlugins ?? {})
    .filter(([id, on]) => on === true && !keepPlugins.includes(id.split('@')[0])).map(([id]) => [id, false]);
  return {enabledPlugins: Object.fromEntries(off), autoCompactWindow: compactWindow};
}

/** El archivo para `--settings`, al día con `~/.claude/settings.json`; null con `NOMOS_LEAN=off` o si la ruta lleva
 *  espacios (Orca rechaza comillas en lo que escribe en el terminal). */
export function leanSettingsFile(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NOMOS_LEAN === 'off') return null;
  const file = (env.NOMOS_CLAUDE_SETTINGS ?? join(env.LOCALAPPDATA ?? join(homedir(), '.local', 'share'), 'nomos', 'claude-sesiones.json')).replace(/\\/g, '/');
  if (/\s/.test(file)) return null;
  let user = {};
  try { user = JSON.parse(readFileSync(join(env.CLAUDE_CONFIG_DIR ?? join(env.USERPROFILE ?? homedir(), '.claude'), 'settings.json'), 'utf8')); } catch { /* sin ajustes del usuario */ }
  const text = JSON.stringify(leanSettings(user), null, 2) + '\n';
  let current = '';
  try { current = readFileSync(file, 'utf8'); } catch { /* primera vez */ }
  if (current !== text) { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text); }
  return file;
}
