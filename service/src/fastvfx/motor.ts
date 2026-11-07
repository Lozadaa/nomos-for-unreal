import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { UnrealCmd } from '../adapters/unreal-cmd.ts';
import { acquire, release } from '../leases.ts';
import { decodePng } from '../checks/png.ts';
import { probeMachine, type MachineProbe } from '../machine.ts';
import { acierto, guardar, leer } from './cache.ts';
import { defectos, escenario, plantillas, type Plantilla } from './plantillas.ts';
import { archivoAsset, clasificar, claveAsset, claveEstructura, claveSalida, estaticos, validar, type Clase, type RecetaValida } from './receta.ts';

const scripts = join(import.meta.dirname, '..', '..', 'unreal');
/** Por debajo de esto no se abre Unreal (disco único casi lleno: shaders y DDC crecen al abrir el editor). */
export const discoMinimoGb = 3;

export type Opciones = {
  db: DatabaseSync; unreal: UnrealCmd; uproject: string; preview?: boolean;
  probe?: MachineProbe; discoLibreGb?: () => number; timeoutMs?: number; lote?: string;
};
export type ResultadoReceta = {
  receta: string; ruta: string; plantilla: string; clase: Clase; ok: boolean; error?: string;
  ms_editor: number; ms_compilacion: number; ms_guardado: number; estadisticas?: Record<string, number>;
  usuario?: Record<string, unknown>; preview?: string | null; pixeles_efecto?: number;
};
export type Lote = {
  lote: string; ok: boolean; recetas: ResultadoReceta[]; aperturas: number; ms_total: number; ms_generacion: number; ms_preview: number;
  ms_primer_preview: number | null; aciertos: number; errores: string[]; acciones: number;
};

type Accion = Record<string, unknown> & {tipo: string; ruta: string; receta?: string};
const ahora = () => performance.now();
const libre = (dir: string) => { const f = statfsSync(dir); return f.bavail * f.bsize / 2 ** 30; };

/** Materiales de los emisores de un sistema base (MIs del maestro con lo que fija cada rol). */
const matsBase = (p: Plantilla) => Object.fromEntries(Object.keys(p.roles ?? {}).map(rol => [rol, `${p.base}_Mats/MI_${rol}`]));
const matsVariante = (r: RecetaValida) => Object.fromEntries(Object.keys(r.plantilla.roles ?? {}).map(rol => [rol, `${r.ruta}_Mats/MI_${rol}`]));
/** Fracción de píxeles «de efecto» en una captura del escenario (gris y negro): muy saturados o casi blancos.
 *  Por debajo de `previewVacia` la captura no muestra el efecto (sistema que no pinta, shader sin compilar). */
export function pixelesEfecto(png: Uint8Array): number {
  const {data} = decodePng(png);
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]), min = Math.min(data[i], data[i + 1], data[i + 2]);
    if (max - min > 60 || min > 200) n++;
  }
  return n / (data.length / 4);
}
export const previewVacia = 0.0005;
const usuario = (r: RecetaValida) => Object.fromEntries(Object.entries(r.parametros).filter(([k]) => r.plantilla.parametros[k].destino === 'usuario'));

/** Acciones que construyen la estructura de una plantilla: maestro, o maestro + MIs de rol + sistema base. */
function estructura(p: Plantilla, dir: string, ue: string, db: DatabaseSync, hechas: Set<string>, borrar: string[]): Accion[] {
  if (hechas.has(p.id) || lista(p, dir, ue, db)) return [];
  hechas.add(p.id);
  if (p.tipo === 'material') return [{tipo: 'maestro', plantilla: p.id, ruta: p.base, defectos: defectos(p)}];
  const maestro = Object.values(plantillas).find(m => m.base === p.maestro)!;
  // un sistema Niagara cargado no se rehace en la misma sesión: se borra del disco con el editor cerrado
  if (existsSync(archivoAsset(dir, p.base))) borrar.push(archivoAsset(dir, p.base));
  return [...estructura(maestro, dir, ue, db, hechas, borrar),
    ...Object.entries(p.roles!).map(([rol, def]) => ({tipo: 'mi', ruta: matsBase(p)[rol], padre: maestro.base, medir: false,
      escalares: {...def.escalares, Intensidad: def.intensidad}, switches: def.switches ?? {}})),
    {tipo: 'niagara', ruta: p.base, defectos: defectos(p), materiales: matsBase(p)}];
}

function lista(p: Plantilla, dir: string, ue: string, db: DatabaseSync): boolean {
  const fila = leer(db, p.base);
  const maestro = p.maestro ? Object.values(plantillas).find(m => m.base === p.maestro) : undefined;
  return !!fila && fila.clave === claveEstructura(p, ue) && existsSync(archivoAsset(dir, p.base))
    && Object.values(matsBase(p)).every(m => existsSync(archivoAsset(dir, m))) && (!maestro || lista(maestro, dir, ue, db));
}

function accionesReceta(r: RecetaValida, clase: Clase): Accion[] {
  const st = estaticos(r), medir = clase !== 'parametros';
  const vectores = Object.fromEntries(Object.entries(r.parametros).filter(([k]) => r.plantilla.parametros[k].tipo === 'color'));
  if (r.plantilla.tipo === 'material') {
    const escalares = Object.fromEntries(Object.entries(r.parametros).filter(([k]) => r.plantilla.parametros[k].tipo === 'escalar'));
    return [{tipo: 'mi', receta: r.nombre, ruta: r.ruta, padre: r.plantilla.base, escalares, vectores, switches: st, medir}];
  }
  const roles = r.plantilla.roles!, intensidad = r.parametros.Intensidad as number;
  const mis: Accion[] = Object.entries(roles).map(([rol, def]) => ({tipo: 'mi', receta: r.nombre, ruta: matsVariante(r)[rol],
    padre: matsBase(r.plantilla)[rol], vectores, escalares: {Intensidad: def.intensidad * intensidad},
    switches: st, medir}));
  // la copia del sistema solo se hace una vez: los cambios de valores van a sus MIs, que el sistema ya usa
  return clase === 'parametros' || clase === 'estaticos' ? mis
    : [...mis, {tipo: 'variante', receta: r.nombre, ruta: r.ruta, base: r.plantilla.base, materiales: matsVariante(r)}];
}

/** Ejecuta un lote de recetas: valida, consulta la caché, construye lo que falte en UNA apertura del editor
 *  (y, con preview, otra en modo juego para las capturas) y deja medida de todo en la base. */
export async function ejecutar(recetas: unknown[], o: Opciones): Promise<Lote> {
  const t0 = ahora(), reloj0 = Date.now(), lote = o.lote ?? `fx-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}`;
  const validas: RecetaValida[] = [];
  const errores: string[] = [];
  recetas.forEach((r, i) => {
    const v = validar(r);
    if (v.ok) validas.push(v.receta); else errores.push(...v.errores.map(e => `receta ${i + 1}: ${e}`));
  });
  if (errores.length) throw new Error(`Recetas no válidas:\n${errores.join('\n')}`);
  const dir = dirname(o.uproject), ue = o.unreal.engineVersion() ?? 'desconocida';
  const hechas = new Set<string>(), borrar: string[] = [], acciones: Accion[] = [];
  const plan = validas.map(r => {
    const previa = leer(o.db, r.ruta);
    const clase = clasificar(r, ue, lista(r.plantilla, dir, ue, o.db), previa && previa.tipo === 'salida'
      ? {clave: previa.clave, asset: previa.asset ?? '', estructura: previa.estructura ?? '', estaticos: previa.estaticos ?? '', existe: existsSync(archivoAsset(dir, r.ruta))}
      : undefined);
    acciones.push(...estructura(r.plantilla, dir, ue, o.db, hechas, borrar));
    if (r.plantilla.tipo === 'niagara' && (clase === 'nuevo' || clase === 'estructural') && existsSync(archivoAsset(dir, r.ruta)))
      borrar.push(archivoAsset(dir, r.ruta));  // copia hecha desde una base anterior: se vuelve a copiar
    if (clase !== 'acierto' && clase !== 'usuario') acciones.push(...accionesReceta(r, clase));
    return {r, clase, previa};
  });
  const necesitaEscenario = o.preview && (!existsSync(archivoAsset(dir, escenario).replace(/\.uasset$/, '.umap')) || !leer(o.db, escenario));
  if (necesitaEscenario) acciones.push({tipo: 'escenario', ruta: escenario});
  const conPreview = o.preview ? plan.filter(({r, clase, previa}) => clase !== 'acierto' || !previa?.preview || !existsSync(previa.preview)) : [];

  const res = new Map<string, ResultadoReceta>(plan.map(({r, clase, previa}) => [r.nombre, {receta: r.nombre, ruta: r.ruta, plantilla: r.plantilla.id,
    clase, ok: true, ms_editor: 0, ms_compilacion: 0, ms_guardado: 0, ...(r.plantilla.tipo === 'niagara' ? {usuario: usuario(r)} : {}),
    preview: clase === 'acierto' && previa?.preview && existsSync(previa.preview) ? previa.preview : null}]));
  let aperturas = 0, msGeneracion = 0, msPreview = 0, primerPreview: number | null = null;
  const fallos: string[] = [];

  if (acciones.length || conPreview.length) {
    const gb = o.discoLibreGb ? o.discoLibreGb() : libre(dir);
    if (gb < discoMinimoGb) throw new Error(`Solo quedan ${gb.toFixed(1)} GB libres en disco (mínimo ${discoMinimoGb}): no se abre Unreal`);
    const m = (o.probe ?? probeMachine)();
    if (m.editors > 0) throw new Error(`Ya hay ${m.editors} editor(es) de Unreal abiertos: FASTVFX espera a que se cierren (un editor a la vez)`);
    const recurso = `editor/${dirname(o.uproject).split(/[\\/]/).at(-1)}`;
    const reserva = acquire(o.db, lote, 'fastvfx', [recurso]);
    if (!reserva.ok) throw new Error(`Editor ocupado por la tarea ${reserva.conflicts[0].taskId}: FASTVFX no abre otro`);
    const tmp = mkdtempSync(join(tmpdir(), 'nomos-fastvfx-'));
    try {
      for (const f of borrar) rmSync(f, {force: true});
      if (acciones.length) {
        const job = join(tmp, 'trabajo.json');
        writeFileSync(job, JSON.stringify({acciones}));
        const t = ahora();
        const {reportJson, exitCode} = await o.unreal.runPython(o.uproject, join(scripts, 'nomos_fastvfx.py'), {NOMOS_FASTVFX_JOB: job},
          o.timeoutMs ?? 900_000, {offscreen: true});
        msGeneracion = ahora() - t; aperturas++;
        const informe = reportJson as {acciones?: Record<string, unknown>[]} | undefined;
        if (!informe?.acciones) fallos.push(`El editor terminó con código ${exitCode} sin informe de FASTVFX`);
        for (const a of informe?.acciones ?? []) {
          const quien = a.receta ? res.get(String(a.receta)) : undefined;
          if (!a.ok) fallos.push(`${a.ruta}: ${a.error}`);
          if (!quien) continue;
          quien.ms_editor += Number(a.ms_total ?? 0); quien.ms_compilacion += Number(a.ms_compilacion ?? 0); quien.ms_guardado += Number(a.ms_guardado ?? 0);
          if (a.estadisticas && a.tipo === 'mi' && !quien.estadisticas) quien.estadisticas = a.estadisticas as Record<string, number>;
          if (a.parametros_usuario) quien.usuario = {...quien.usuario, defecto_en_asset: a.parametros_usuario};
          if (!a.ok) { quien.ok = false; quien.error = String(a.error); }
        }
        if (!informe?.acciones) for (const q of res.values()) if (q.clase !== 'acierto' && q.clase !== 'usuario') { q.ok = false; q.error = fallos[0]; }
        // la estructura queda en caché solo si todas sus acciones salieron bien
        for (const id of hechas) {
          const p = plantillas[id];
          const suyas = (informe?.acciones ?? []).filter(a => !a.receta && (a.ruta === p.base || String(a.ruta).startsWith(`${p.base}_Mats/`)));
          if (suyas.length && suyas.every(a => a.ok)) guardar(o.db, {ruta: p.base, tipo: 'estructura', plantilla: p.id, clave: claveEstructura(p, ue),
            asset: null, estructura: null, estaticos: null, parametros: null, preview: null, ue});
        }
        if (necesitaEscenario && (informe?.acciones ?? []).some(a => a.tipo === 'escenario' && a.ok))
          guardar(o.db, {ruta: escenario, tipo: 'estructura', plantilla: 'escenario', clave: 'escenario', asset: null, estructura: null,
            estaticos: null, parametros: null, preview: null, ue});
      }
      const capturar = conPreview.filter(({r}) => res.get(r.nombre)!.ok);
      if (capturar.length && leer(o.db, escenario)) {
        const carpeta = join(dir, 'Saved', 'FastVfx', 'previews');
        mkdirSync(carpeta, {recursive: true});
        const tipado = (r: RecetaValida) => Object.fromEntries(Object.entries(usuario(r)).map(([k, v]) =>
          [k, [r.plantilla.parametros[k].tipo === 'entero' ? 'int' : 'float', v]]));
        const items = capturar.map(({r}) => ({tipo: r.plantilla.tipo, asset: r.ruta, frame: r.frame, usuario: r.plantilla.tipo === 'niagara' ? tipado(r) : undefined,
          png: join(carpeta, `${r.nombre}-${claveSalida(r, ue).slice(0, 8)}.png`).replace(/\\/g, '/')}));
        const job = join(tmp, 'preview.json');
        writeFileSync(job, JSON.stringify({calentar: 6, items}));
        const t = ahora();
        const {reportJson} = await o.unreal.runPython(o.uproject, join(scripts, 'nomos_fastvfx_preview.py'), {NOMOS_FASTVFX_PREVIEW: job},
          o.timeoutMs ?? 600_000, {render: {width: 960, height: 540, map: escenario}});
        msPreview = ahora() - t; aperturas++;
        const capturas = ((reportJson as {items?: {asset: string; png: string | null}[]})?.items ?? []);
        for (const {r} of capturar) {
          const png = capturas.find(c => c.asset === r.ruta && c.png && existsSync(c.png))?.png ?? null;
          res.get(r.nombre)!.preview = png;
          if (png) {
            const efecto = pixelesEfecto(readFileSync(png));
            res.get(r.nombre)!.pixeles_efecto = Math.round(efecto * 1e5) / 1e5;
            if (efecto < previewVacia) {
              const q = res.get(r.nombre)!;
              q.ok = false; q.error = `La captura no muestra el efecto (${(efecto * 100).toFixed(3)} % de píxeles de efecto)`;
              fallos.push(`${r.ruta}: ${q.error}`);
            }
          }
          if (png) primerPreview = Math.min(primerPreview ?? Infinity, statSync(png).mtimeMs - reloj0);
          else fallos.push(`${r.ruta}: sin captura de preview`);
        }
      }
    } finally {
      release(o.db, lote);
      rmSync(tmp, {recursive: true, force: true});
    }
  }

  for (const {r, clase} of plan) {
    const q = res.get(r.nombre)!;
    if (clase === 'acierto') acierto(o.db, r.ruta);
    if (q.ok) guardar(o.db, {ruta: r.ruta, tipo: 'salida', plantilla: r.plantilla.id, clave: claveSalida(r, ue), asset: claveAsset(r, ue),
      estructura: claveEstructura(r.plantilla, ue), estaticos: JSON.stringify(estaticos(r)), parametros: JSON.stringify(r.parametros),
      preview: q.preview ?? null, ue});
    o.db.prepare(`insert into fastvfx_log(lote,receta,ruta,plantilla,clase,ok,ms_editor,ms_compilacion,ms_guardado,preview,error,creado)
      values(?,?,?,?,?,?,?,?,?,?,?,?)`).run(lote, r.nombre, r.ruta, r.plantilla.id, clase, q.ok ? 1 : 0, q.ms_editor, q.ms_compilacion,
      q.ms_guardado, q.preview ?? null, q.error ?? null, new Date().toISOString());
  }
  const salida: Lote = {lote, ok: !fallos.length && [...res.values()].every(q => q.ok), recetas: [...res.values()], aperturas,
    ms_total: Math.round(ahora() - t0), ms_generacion: Math.round(msGeneracion), ms_preview: Math.round(msPreview),
    ms_primer_preview: primerPreview === null ? null : Math.round(primerPreview), aciertos: plan.filter(p => p.clase === 'acierto').length,
    errores: fallos, acciones: acciones.length};
  o.db.prepare(`insert into fastvfx_lotes(id,creado,recetas,aperturas,ms_total,ms_generacion,ms_preview,ms_primer_preview,ok,detalle)
    values(?,?,?,?,?,?,?,?,?,?)`).run(lote, new Date().toISOString(), plan.length, aperturas, salida.ms_total, salida.ms_generacion,
    salida.ms_preview, salida.ms_primer_preview, salida.ok ? 1 : 0, JSON.stringify(salida));
  return salida;
}
