import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createUnrealCmd } from '../adapters/unreal-cmd.ts';
import { openDb } from '../db.ts';
import { dbFile } from '../legacy.ts';
import { olvidar } from './cache.ts';
import { ejecutar, type Lote } from './motor.ts';
import { plantillas, raiz } from './plantillas.ts';
import { validar } from './receta.ts';

const uso = `Uso: nomos fastvfx plantillas
       nomos fastvfx validar RECETA.json...
       nomos fastvfx crear RECETA.json... [--proyecto JUEGO.uproject] [--preview]
       nomos fastvfx variar RECETA.json --nombre NUEVO --set Param=valor [--set ...] [--guardar NUEVA.json] [--preview]
       nomos fastvfx log [--lotes N]
       nomos fastvfx olvidar [--plantilla ID]
       nomos fastvfx bench --tareas docs/fastvfx/tareas.json --modo frio|repeticion|retoque|lote --salida F.json [--proyecto P]`;

const recetasDe = (archivos: string[]) => archivos.flatMap(f => { const j = JSON.parse(readFileSync(f, 'utf8')); return Array.isArray(j) ? j : [j]; });

function uprojectDe(opcion?: string): string {
  if (opcion) return resolve(opcion);
  const aqui = readdirSync('.').filter(f => f.endsWith('.uproject'));
  if (aqui.length !== 1) throw new Error('Falta --proyecto JUEGO.uproject (o ejecutar desde la carpeta del juego)');
  return resolve(aqui[0]);
}

/** Param=valor de --set: número, true/false o color «r,g,b[,a]». */
export function valorSet(texto: string): [string, unknown] {
  const at = texto.indexOf('=');
  if (at < 1) throw new Error(`--set ${texto}: se espera Param=valor`);
  const k = texto.slice(0, at), v = texto.slice(at + 1).trim();
  if (v === 'true' || v === 'false') return [k, v === 'true'];
  if (v.includes(',')) return [k, v.split(',').map(Number)];
  return [k, Number(v)];
}

function carga() {
  const out = spawnSync('tasklist', ['/FO', 'CSV', '/NH'], {encoding: 'utf8', windowsHide: true}).stdout ?? '';
  const n = (re: RegExp) => out.split(/\r?\n/).filter(l => re.test(l)).length;
  return {ffmpeg: n(/^"ffmpeg/i), chrome: n(/^"chrome/i), node: n(/^"node/i)};
}

/** Retoque del benchmark: el cambio pequeño de parámetro que pide un director tras ver la primera versión. */
function retoque(r: Record<string, unknown>) {
  const p = {...(r.parametros as Record<string, unknown>)};
  p.Intensidad = Math.round(((p.Intensidad as number | undefined) ?? (r.plantilla === 'FX_Energy_Base' ? 1 : 5)) * 1.1 * 1000) / 1000;
  return {...r, parametros: p};
}

export async function fastvfxCli(argv: string[]): Promise<boolean> {
  const at = argv.findIndex((a, i) => a === 'fastvfx' && argv[i - 1] !== '--data');
  if (at < 0) return false;
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {data: {type: 'string'}, proyecto: {type: 'string'},
    preview: {type: 'boolean'}, nombre: {type: 'string'}, set: {type: 'string', multiple: true}, guardar: {type: 'string'},
    lotes: {type: 'string'}, plantilla: {type: 'string'}, tareas: {type: 'string'}, modo: {type: 'string'}, salida: {type: 'string'},
    solo: {type: 'string'}}});
  const [, accion, ...archivos] = positionals;
  const abrir = () => { const dir = resolve(values.data ?? '.nomos'); mkdirSync(dir, {recursive: true}); return openDb(dbFile(dir)); };
  if (accion === 'plantillas') {
    console.log(JSON.stringify(Object.values(plantillas).map(p => ({id: p.id, version: p.version, tipo: p.tipo, base: p.base, descripcion: p.descripcion,
      parametros: p.parametros})), null, 2));
  } else if (accion === 'validar') {
    if (!archivos.length) throw new Error(uso);
    const r = recetasDe(archivos).map(validar);
    console.log(JSON.stringify(r.map(v => v.ok ? {ok: true, ruta: v.receta.ruta} : v)));
    if (r.some(v => !v.ok)) process.exitCode = 1;
  } else if (accion === 'crear' || accion === 'variar') {
    if (!archivos.length) throw new Error(uso);
    let recetas = recetasDe(archivos);
    if (accion === 'variar') {
      if (recetas.length !== 1 || !values.nombre || !values.set?.length) throw new Error(uso);
      const base = recetas[0] as Record<string, unknown>;
      recetas = [{...base, nombre: values.nombre, parametros: {...(base.parametros as object), ...Object.fromEntries(values.set.map(valorSet))}}];
      if (values.guardar) writeFileSync(values.guardar, JSON.stringify(recetas[0], null, 2));
    }
    const db = abrir();
    try {
      const lote = await ejecutar(recetas, {db, unreal: createUnrealCmd(), uproject: uprojectDe(values.proyecto), preview: values.preview});
      console.log(JSON.stringify(lote, null, 2));
      if (!lote.ok) process.exitCode = 1;
    } finally { db.close(); }
  } else if (accion === 'log') {
    const db = abrir();
    try {
      const filas = db.prepare('select id, creado, recetas, aperturas, ms_total, ms_generacion, ms_preview, ms_primer_preview, ok from fastvfx_lotes order by creado desc limit ?')
        .all(Number(values.lotes ?? 10));
      console.log(JSON.stringify(filas, null, 2));
    } finally { db.close(); }
  } else if (accion === 'olvidar') {
    const db = abrir();
    try { console.log(JSON.stringify({olvidadas: olvidar(db, {plantilla: values.plantilla})})); } finally { db.close(); }
  } else if (accion === 'bench') {
    if (!values.tareas || !values.salida || !['frio', 'repeticion', 'retoque', 'lote'].includes(values.modo ?? '')) throw new Error(uso);
    const uproject = uprojectDe(values.proyecto), dir = dirname(uproject);
    let tareas = JSON.parse(readFileSync(values.tareas, 'utf8')).tareas as {id: string; receta: Record<string, unknown>}[];
    if (values.solo) tareas = tareas.filter(t => values.solo!.split(',').includes(t.id));
    const db = abrir(), unreal = createUnrealCmd();
    const salida = {modo: values.modo, fecha: new Date().toISOString(), ue: unreal.engineVersion(), carga_inicio: carga(), tareas: [] as unknown[],
      lote: null as Lote | null};
    try {
      if (values.modo === 'frio' || values.modo === 'lote') {
        // frío de verdad: sin assets generados, sin capturas y sin caché de FASTVFX (la DDC del motor no se toca)
        rmSync(join(dir, 'Content', ...raiz.split('/').slice(2)), {recursive: true, force: true});
        rmSync(join(dir, 'Saved', 'FastVfx'), {recursive: true, force: true});
        olvidar(db);
      }
      if (values.modo === 'lote') {
        salida.lote = await ejecutar(tareas.map(t => t.receta), {db, unreal, uproject, preview: true, lote: `bench-lote-${Date.now()}`});
        console.log(JSON.stringify({ok: salida.lote.ok, ms_total: salida.lote.ms_total, aperturas: salida.lote.aperturas}));
      } else for (const t of tareas) {
        const receta = values.modo === 'retoque' ? retoque(t.receta) : t.receta;
        const c = carga();
        let fila: Record<string, unknown>;
        try {
          const l = await ejecutar([receta], {db, unreal, uproject, preview: true, lote: `bench-${values.modo}-${t.id}-${Date.now()}`});
          fila = {id: t.id, ok: l.ok, clase: l.recetas[0].clase, ms_total: l.ms_total, ms_generacion: l.ms_generacion, ms_preview: l.ms_preview,
            ms_primer_preview: l.ms_primer_preview, ms_compilacion: l.recetas[0].ms_compilacion, ms_guardado: l.recetas[0].ms_guardado,
            ms_editor_script: l.recetas[0].ms_editor, aperturas: l.aperturas, acciones: l.acciones, aciertos: l.aciertos, llamadas_llm: 0,
            estadisticas: l.recetas[0].estadisticas ?? null, preview: l.recetas[0].preview ?? null, errores: l.errores, carga: c};
        } catch (e) { fila = {id: t.id, ok: false, error: e instanceof Error ? e.message : String(e), carga: c}; }
        salida.tareas.push(fila);
        console.log(JSON.stringify(fila));
        writeFileSync(values.salida, JSON.stringify(salida, null, 2));
      }
    } finally { db.close(); writeFileSync(values.salida, JSON.stringify({...salida, carga_fin: carga()}, null, 2)); }
  } else throw new Error(uso);
  return true;
}

