import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { embed } from './embed.ts';

const own = resolve(import.meta.dirname, '..', '..');
const binary = /\.(uasset|umap|ttf|otf|png|jpg|wav)$/i;
const swap = (text: string, name: string) =>
  text.replace(/Semilla/g, name).replace(/SEMILLA/g, name.toUpperCase()).replace(/semilla/g, name.toLowerCase());

/**
 * Jam 2026-11-10: `nomos nuevo <Nombre>`. Copia `plantillas/semilla` (menú, HUD, carga, fuentes, mapa y scripts que todo
 * juego repetía) cambiando «Semilla» por el nombre, fija el motor, crea el repo con LFS y mete Nomos dentro (`embed`),
 * así un compañero solo clona. Valida todo antes de escribir nada.
 */
export function nuevo(name: string, opts: {dest?: string; engine?: string; source?: string} = {}): string[] {
  if (!/^[A-Z][A-Za-z0-9]{2,19}$/.test(name)) throw new Error(`Nombre no válido: «${name}». Empieza por mayúscula, 3-20 letras o cifras, sin espacios ni tildes`);
  const source = opts.source ?? own, template = join(source, 'plantillas', 'semilla');
  const dest = resolve(opts.dest ?? join(process.env.USERPROFILE ?? homedir(), 'Documents', 'Unreal Projects', name));
  if (existsSync(dest)) throw new Error(`Ya existe ${dest}`);
  if (!existsSync(template)) throw new Error(`Falta la semilla en ${template}`);
  const created: string[] = [];
  const copy = (from: string, to: string) => {
    for (const entry of readdirSync(from)) {
      // `gitattributes` sin punto: con punto, sus reglas de LFS valdrían dentro del repo de Nomos
      const src = join(from, entry), out = join(to, entry === 'gitattributes' ? '.gitattributes' : swap(entry, name));
      if (statSync(src).isDirectory()) { mkdirSync(out, {recursive: true}); copy(src, out); continue; }
      writeFileSync(out, binary.test(entry) ? readFileSync(src) : swap(readFileSync(src, 'utf8'), name));
      created.push(out.slice(dest.length + 1).replace(/\\/g, '/'));
    }
  };
  mkdirSync(dest, {recursive: true});
  copy(template, dest);
  const uproject = join(dest, `${name}.uproject`), json = JSON.parse(readFileSync(uproject, 'utf8'));
  writeFileSync(uproject, JSON.stringify({...json, EngineAssociation: opts.engine ?? '5.9'}, null, '\t') + '\n');
  const git = (...args: string[]) => execFileSync('git', args, {cwd: dest, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
  git('init', '-q', '-b', 'main');
  // ponytail: sin git-lfs los .uasset van como blobs normales; el doctor ya avisa de que falta
  try { git('lfs', 'install', '--local'); git('lfs', 'track', '*.uasset', '*.umap'); } catch { /* sin git-lfs */ }
  created.push(...embed(dest, {source, skills: join(source, 'skills')}));
  git('add', '-A');
  git('commit', '-q', '-m', `Proyecto ${name} desde la semilla de Nomos`);
  return created;
}

/** `nomos nuevo <Nombre> [--destino CARPETA] [--motor 5.9]`. */
export function nuevoCli(argv: string[]): boolean {
  if (argv[0] !== 'nuevo') return false;
  const {values, positionals} = parseArgs({args: argv.slice(1), allowPositionals: true,
    options: {destino: {type: 'string'}, motor: {type: 'string'}, data: {type: 'string'}}});
  if (positionals.length !== 1) throw new Error('Uso: nomos nuevo <Nombre> [--destino CARPETA] [--motor 5.9]');
  const dest = values.destino ? resolve(values.destino) : undefined;
  nuevo(positionals[0], {dest, engine: values.motor});
  const where = dest ?? join(process.env.USERPROFILE ?? homedir(), 'Documents', 'Unreal Projects', positionals[0]);
  console.log(`${where}\nListo: entra en la carpeta, compila con Scripts\\compilar.ps1 y abre /nomos.`);
  return true;
}
