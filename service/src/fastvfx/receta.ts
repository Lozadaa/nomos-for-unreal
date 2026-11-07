import { createHash } from 'node:crypto';
import { calidades, generador, plantillas, raiz, type Plantilla } from './plantillas.ts';

/** Receta FASTVFX versión 1 (ver skills/nomos/references/fastvfx.md). Solo datos: nada de ella se ejecuta. */
export type Receta = {
  fastvfx: 1; nombre: string; plantilla: string; version_plantilla?: number; carpeta?: string;
  calidad?: 'alta' | 'media' | 'baja'; parametros?: Record<string, unknown>; preview?: {frame?: number};
};
export type RecetaValida = {
  nombre: string; plantilla: Plantilla; carpeta: string; ruta: string; calidad: 'alta' | 'media' | 'baja';
  /** Todos los parámetros de la plantilla, con los de la receta encima */
  parametros: Record<string, number | boolean | number[]>; frame: number;
};

const claves = new Set(['fastvfx', 'nombre', 'plantilla', 'version_plantilla', 'carpeta', 'calidad', 'parametros', 'preview']);
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Comprueba esquema, tipos, rangos y que la plantilla existe. Devuelve la receta completa o la lista de errores. */
export function validar(r: unknown): {ok: true; receta: RecetaValida} | {ok: false; errores: string[]} {
  const e: string[] = [];
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {ok: false, errores: ['La receta tiene que ser un objeto JSON']};
  const o = r as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!claves.has(k)) e.push(`Campo desconocido: ${k}`);
  if (o.fastvfx !== 1) e.push('fastvfx tiene que ser 1 (versión del formato de receta)');
  if (typeof o.nombre !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(o.nombre)) e.push('nombre: letras, números y _, empieza por letra, máx. 64');
  const p = typeof o.plantilla === 'string' ? plantillas[o.plantilla] : undefined;
  if (!p) e.push(`plantilla desconocida: ${String(o.plantilla)} (hay ${Object.keys(plantillas).join(', ')})`);
  if (p && o.version_plantilla !== undefined && o.version_plantilla !== p.version)
    e.push(`version_plantilla ${String(o.version_plantilla)} no existe: ${p.id} va por la ${p.version}`);
  if (o.carpeta !== undefined && (typeof o.carpeta !== 'string' || !/^\/Game(\/[A-Za-z0-9_]+)+$/.test(o.carpeta)))
    e.push('carpeta: ruta /Game/... con letras, números y _');
  if (o.calidad !== undefined && !(typeof o.calidad === 'string' && o.calidad in calidades)) e.push('calidad: alta, media o baja');
  const pv = o.preview as Record<string, unknown> | undefined;
  if (pv !== undefined && (typeof pv !== 'object' || pv === null || Object.keys(pv).some(k => k !== 'frame')
    || (pv.frame !== undefined && !(numero(pv.frame) && pv.frame >= 0 && pv.frame <= 30)))) e.push('preview: {"frame": segundos entre 0 y 30}');
  const dados = o.parametros ?? {};
  if (typeof dados !== 'object' || dados === null || Array.isArray(dados)) e.push('parametros tiene que ser un objeto');
  const parametros: Record<string, number | boolean | number[]> = {};
  if (p) {
    for (const [k, def] of Object.entries(p.parametros)) parametros[k] = Array.isArray(def.defecto) ? [...def.defecto] : def.defecto;
    for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
      const def = p.parametros[k];
      if (!def) { e.push(`${p.id} no tiene el parámetro ${k}`); continue; }
      if (def.tipo === 'switch') { if (typeof v !== 'boolean') e.push(`${k}: true o false`); else parametros[k] = v; }
      else if (def.tipo === 'color') {
        if (!Array.isArray(v) || ![3, 4].includes(v.length) || !v.every(x => numero(x) && x >= 0 && x <= 50))
          e.push(`${k}: [r, g, b] o [r, g, b, a] con valores entre 0 y 50`);
        else parametros[k] = v.length === 3 ? [...v, 1] : [...v];
      } else if (!numero(v) || v < def.min || v > def.max || (def.tipo === 'entero' && !Number.isInteger(v)))
        e.push(`${k}: ${def.tipo === 'entero' ? 'entero' : 'número'} entre ${def.min} y ${def.max}`);
      else parametros[k] = v;
    }
  }
  if (e.length || !p) return {ok: false, errores: e};
  const carpeta = (o.carpeta as string | undefined) ?? `${raiz}/Generado`;
  const calidad = (o.calidad as RecetaValida['calidad'] | undefined) ?? 'alta';
  return {ok: true, receta: {nombre: o.nombre as string, plantilla: p, carpeta, ruta: `${carpeta}/${o.nombre}`, calidad, parametros,
    frame: (pv?.frame as number | undefined) ?? (p.tipo === 'niagara' ? 0.2 : 0.5)}};
}

const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);

/** Clave de la estructura (maestro o sistema base): plantilla + versión, generador, dependencias y versión de UE. */
export const claveEstructura = (p: Plantilla, ue: string) =>
  hash({plantilla: p.id, version: p.version, generador, dependencias: p.dependencias, ue});

/** Lo estático de una receta (switches y calidad): si cambia, la MI compila otra permutación de shader. */
export function estaticos(r: RecetaValida): Record<string, boolean> {
  const s = Object.fromEntries(Object.entries(r.parametros).filter(([k]) => r.plantilla.parametros[k].tipo === 'switch')) as Record<string, boolean>;
  return {...s, ...calidades[r.calidad]};
}

/** Clave de la salida: la estructura más todo lo que la receta fija. Igual clave y asset en disco = acierto. */
export const claveSalida = (r: RecetaValida, ue: string) =>
  hash({estructura: claveEstructura(r.plantilla, ue), ruta: r.ruta, calidad: r.calidad, parametros: r.parametros});

/** Lo que cambia el asset: la salida sin los parámetros de usuario de Niagara (esos viajan al lanzar el sistema). */
export const claveAsset = (r: RecetaValida, ue: string) =>
  hash({estructura: claveEstructura(r.plantilla, ue), ruta: r.ruta, calidad: r.calidad,
    parametros: Object.fromEntries(Object.entries(r.parametros).filter(([k]) => r.plantilla.parametros[k].destino !== 'usuario'))});

export type Clase = 'acierto' | 'usuario' | 'parametros' | 'estaticos' | 'nuevo' | 'estructural';
export type Previa = {clave: string; asset: string; estructura: string; estaticos: string; existe: boolean} | undefined;

/** Qué hace falta para una receta según lo que hay en caché:
 *  acierto (nada), usuario (solo parámetros de usuario de Niagara: el asset no cambia, no se abre el editor), parametros (solo valores dinámicos de la MI), estaticos (MI con otra permutación de shader),
 *  nuevo (asset nuevo sobre una estructura ya construida) o estructural (hay que construir el maestro o el sistema base). */
export function clasificar(r: RecetaValida, ue: string, estructuraLista: boolean, previa: Previa): Clase {
  if (!estructuraLista) return 'estructural';
  if (!previa || !previa.existe || previa.estructura !== claveEstructura(r.plantilla, ue)) return 'nuevo';
  if (previa.clave === claveSalida(r, ue)) return 'acierto';
  if (previa.asset === claveAsset(r, ue)) return 'usuario';
  return previa.estaticos === JSON.stringify(estaticos(r)) ? 'parametros' : 'estaticos';
}

/** /Game/X/Y → <proyecto>/Content/X/Y.uasset (el editor no hace falta para saber si un asset está en disco). */
export function archivoAsset(dirProyecto: string, ruta: string): string {
  return `${dirProyecto.replace(/[\\/]+$/, '')}/Content/${ruta.replace(/^\/Game\//, '')}.uasset`;
}
