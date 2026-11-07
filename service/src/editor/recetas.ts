import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { acierto, guardar, leer } from '../fastvfx/cache.ts';
import { archivoAsset } from '../fastvfx/receta.ts';

/**
 * acelera C: recetas de editor al estilo FASTVFX para lo que los workers de Herbalist reescribían en Python una y otra vez
 * (docs/x10/acelera.md): `escena` (montar o colocar actores en un mapa: 13 scripts, 40 escrituras), `sondeo` (inventario
 * de assets, componentes y actores: 25 scripts) y `bp_datos` (Blueprint hijo y DataAsset con propiedades: 14 scripts).
 * La receta solo trae datos; service/unreal/nomos_recetas.py los vuelve a comprobar y elige la función por `plantilla`.
 * Mismo editor caliente que `ue py` y misma caché que FASTVFX (tabla fastvfx_cache, plantilla = la de la receta).
 */
export const generadorRecetas = 1;
export const plantillasRecetas = {
  escena: 'Monta o actualiza actores en un mapa: borra los que llevan la etiqueta de la receta y vuelve a ponerlos (repetible). '
    + 'Campos: mapa, etiqueta, nuevo?, base? (suelo, sol, cielo y cámara si el mapa es nuevo), actores: [{nombre, clase|bp|malla, pos, rot?, escala?, material?, carpeta?, apoyar?, texto?, propiedades?}]',
  sondeo: 'Inventario de solo lectura, en JSON: assets de unas carpetas (clase, ruta; con componentes: los de cada Blueprint con su malla y materiales) '
    + 'y, con mapa, sus actores. Campos: carpetas?, clases?, componentes?, mapa?, limite?',
  bp_datos: 'Crea o actualiza un Blueprint hijo (componentes y valores por defecto) y, opcional, un DataAsset con sus propiedades. '
    + 'Campos: ruta, padre, componentes?: [{nombre, clase, malla?, material?, pos?, rot?, escala?}], propiedades?, datos?: {ruta, clase, propiedades}',
} as const;
export type PlantillaReceta = keyof typeof plantillasRecetas;

const ruta = (v: unknown, raices = 'Game|Engine') => typeof v === 'string' && new RegExp(`^/(${raices})(/[A-Za-z0-9_.-]+)+$`).test(v);
const vec = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));
const texto = (v: unknown, max = 128) => typeof v === 'string' && v.length <= max && !/[\0\r\n]/.test(v);
const nombreProp = /^[A-Za-z_][A-Za-z0-9_ ]{0,63}$/;
/** Clases de actor y de componente por nombre corto (`unreal.<Clase>`); cualquier otra, como /Script/Modulo.Clase. */
const claseNativa = (v: unknown) => typeof v === 'string' && (/^[A-Z][A-Za-z0-9_]{1,63}$/.test(v) || /^\/Script\/[A-Za-z0-9_]+\.[A-Za-z0-9_]+$/.test(v));

/** Un valor de propiedad: número, booleano, texto (una ruta /Game/… o /Engine/… se carga como asset) o
 *  {vector}, {rotador}, {color}, {transform: {pos, rot, escala}}. */
function valor(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'boolean') return true;
  if (typeof v === 'string') return texto(v, 512);
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const [k, x] = Object.entries(v)[0] ?? [];
  if (Object.keys(v).length !== 1) return false;
  if (k === 'vector' || k === 'rotador') return vec(x);
  if (k === 'color') return Array.isArray(x) && [3, 4].includes(x.length) && x.every(n => typeof n === 'number' && Number.isFinite(n));
  if (k === 'transform') return !!x && typeof x === 'object' && Object.entries(x).every(([c, w]) => ['pos', 'rot', 'escala'].includes(c) && vec(w));
  return false;
}
function propiedades(v: unknown, donde: string, e: string[]): void {
  if (v === undefined) return;
  if (!v || typeof v !== 'object' || Array.isArray(v)) { e.push(`${donde}: objeto {propiedad: valor}`); return; }
  for (const [k, x] of Object.entries(v)) {
    if (!nombreProp.test(k)) e.push(`${donde}.${k}: nombre de propiedad no válido`);
    else if (!valor(x)) e.push(`${donde}.${k}: número, booleano, texto, {vector}, {rotador}, {color} o {transform}`);
  }
}
function claves(o: Record<string, unknown>, validas: string[], donde: string, e: string[]): void {
  for (const k of Object.keys(o)) if (!validas.includes(k)) e.push(`${donde}: campo desconocido ${k}`);
}
const objeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Esquema, tipos y rutas. Solo datos: nada de la receta se ejecuta. */
export function validarReceta(r: unknown): {ok: true; receta: Record<string, unknown> & {plantilla: PlantillaReceta}} | {ok: false; errores: string[]} {
  const e: string[] = [];
  if (!objeto(r)) return {ok: false, errores: ['La receta tiene que ser un objeto JSON']};
  if (r.receta !== 1) e.push('receta tiene que ser 1 (versión del formato)');
  const p = r.plantilla as PlantillaReceta;
  if (!(typeof p === 'string' && p in plantillasRecetas)) return {ok: false, errores: [...e, `plantilla desconocida: ${String(p)} (hay ${Object.keys(plantillasRecetas).join(', ')})`]};
  if (p === 'escena') {
    claves(r, ['receta', 'plantilla', 'mapa', 'etiqueta', 'nuevo', 'base', 'actores'], 'escena', e);
    if (!ruta(r.mapa, 'Game')) e.push('mapa: ruta /Game/... del nivel');
    if (typeof r.etiqueta !== 'string' || !/^[A-Za-z0-9_.-]{1,32}$/.test(r.etiqueta)) e.push('etiqueta: 1-32 letras, números, _ . -');
    for (const k of ['nuevo', 'base']) if (r[k] !== undefined && typeof r[k] !== 'boolean') e.push(`${k}: true o false`);
    if (!Array.isArray(r.actores) || r.actores.length > 500) e.push('actores: lista (máx. 500)');
    else r.actores.forEach((a, i) => {
      const d = `actores[${i}]`;
      if (!objeto(a)) { e.push(`${d}: objeto`); return; }
      claves(a, ['nombre', 'clase', 'bp', 'malla', 'pos', 'rot', 'escala', 'material', 'carpeta', 'apoyar', 'texto', 'propiedades'], d, e);
      if (!texto(a.nombre, 64) || !a.nombre) e.push(`${d}.nombre: texto de 1-64`);
      if (['clase', 'bp', 'malla'].filter(k => a[k] !== undefined).length !== 1) e.push(`${d}: exactamente uno de clase, bp o malla`);
      if (a.clase !== undefined && !claseNativa(a.clase)) e.push(`${d}.clase: nombre de clase (PointLight) o /Script/Modulo.Clase`);
      for (const k of ['bp', 'malla', 'material']) if (a[k] !== undefined && !ruta(a[k])) e.push(`${d}.${k}: ruta /Game/... o /Engine/...`);
      if (!vec(a.pos)) e.push(`${d}.pos: [x, y, z] en cm`);
      if (a.rot !== undefined && !vec(a.rot)) e.push(`${d}.rot: [pitch, yaw, roll]`);
      if (a.escala !== undefined && !vec(a.escala) && !(typeof a.escala === 'number' && a.escala > 0)) e.push(`${d}.escala: número o [x, y, z]`);
      if (a.carpeta !== undefined && !texto(a.carpeta)) e.push(`${d}.carpeta: texto`);
      if (a.texto !== undefined && !texto(a.texto, 512)) e.push(`${d}.texto: texto`);
      if (a.apoyar !== undefined && typeof a.apoyar !== 'boolean') e.push(`${d}.apoyar: true o false`);
      propiedades(a.propiedades, `${d}.propiedades`, e);
    });
  } else if (p === 'sondeo') {
    claves(r, ['receta', 'plantilla', 'carpetas', 'clases', 'componentes', 'mapa', 'limite'], 'sondeo', e);
    if (r.carpetas !== undefined && !(Array.isArray(r.carpetas) && r.carpetas.length <= 20 && r.carpetas.every(c => ruta(c, 'Game|Engine'))))
      e.push('carpetas: lista de rutas /Game/... (máx. 20)');
    if (r.clases !== undefined && !(Array.isArray(r.clases) && r.clases.every(c => typeof c === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(c))))
      e.push('clases: lista de nombres de clase de asset (Blueprint, StaticMesh…)');
    if (r.componentes !== undefined && typeof r.componentes !== 'boolean') e.push('componentes: true o false');
    if (r.mapa !== undefined && !ruta(r.mapa, 'Game')) e.push('mapa: ruta /Game/... del nivel');
    if (r.limite !== undefined && !(Number.isInteger(r.limite) && (r.limite as number) > 0 && (r.limite as number) <= 5000)) e.push('limite: entero entre 1 y 5000');
    if (r.carpetas === undefined && r.mapa === undefined) e.push('sondeo: carpetas, mapa o los dos');
  } else {
    claves(r, ['receta', 'plantilla', 'ruta', 'padre', 'componentes', 'propiedades', 'datos'], 'bp_datos', e);
    if (!ruta(r.ruta, 'Game')) e.push('ruta: /Game/.../BP_Nombre');
    if (!ruta(r.padre, 'Game') && !claseNativa(r.padre)) e.push('padre: Blueprint /Game/... o clase /Script/Modulo.Clase');
    if (r.componentes !== undefined && !Array.isArray(r.componentes)) e.push('componentes: lista');
    else (r.componentes as unknown[] ?? []).forEach((c, i) => {
      const d = `componentes[${i}]`;
      if (!objeto(c)) { e.push(`${d}: objeto`); return; }
      claves(c, ['nombre', 'clase', 'malla', 'material', 'pos', 'rot', 'escala'], d, e);
      if (typeof c.nombre !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(c.nombre)) e.push(`${d}.nombre: letras, números y _`);
      if (!claseNativa(c.clase)) e.push(`${d}.clase: StaticMeshComponent, PointLightComponent… o /Script/Modulo.Clase`);
      for (const k of ['malla', 'material']) if (c[k] !== undefined && !ruta(c[k])) e.push(`${d}.${k}: ruta /Game/... o /Engine/...`);
      for (const k of ['pos', 'rot', 'escala']) if (c[k] !== undefined && !vec(c[k])) e.push(`${d}.${k}: [x, y, z]`);
    });
    propiedades(r.propiedades, 'propiedades', e);
    if (r.datos !== undefined) {
      if (!objeto(r.datos)) e.push('datos: {ruta, clase, propiedades}');
      else {
        claves(r.datos, ['ruta', 'clase', 'propiedades'], 'datos', e);
        if (!ruta(r.datos.ruta, 'Game')) e.push('datos.ruta: /Game/.../DA_Nombre');
        if (!ruta(r.datos.clase, 'Game') && !claseNativa(r.datos.clase)) e.push('datos.clase: Blueprint de DataAsset /Game/... o /Script/Modulo.Clase');
        propiedades(r.datos.propiedades, 'datos.propiedades', e);
      }
    }
  }
  return e.length ? {ok: false, errores: e} : {ok: true, receta: r as Record<string, unknown> & {plantilla: PlantillaReceta}};
}

/** Lo que guarda la caché: un nivel por mapa y etiqueta, un Blueprint por ruta. El sondeo no se cachea (lee el estado). */
export function claveCache(receta: Record<string, unknown> & {plantilla: PlantillaReceta}, ue: string): {ruta: string; clave: string; archivos: string[]} | null {
  if (receta.plantilla === 'sondeo') return null;
  const clave = createHash('sha256').update(JSON.stringify({receta, ue, generador: generadorRecetas})).digest('hex').slice(0, 24);
  if (receta.plantilla === 'escena') return {ruta: `${receta.mapa}#${receta.etiqueta}`, clave, archivos: [`${receta.mapa}.umap`]};
  return {ruta: String(receta.ruta), clave, archivos: [String(receta.ruta), ...objeto(receta.datos) ? [String(receta.datos.ruta)] : []]};
}

/** ¿Ya se hizo esta misma receta y su resultado sigue en disco? Entonces no hace falta abrir el editor. */
export function enCache(db: DatabaseSync, uproject: string, receta: Record<string, unknown> & {plantilla: PlantillaReceta}, ue: string): boolean {
  const c = claveCache(receta, ue);
  if (!c || leer(db, c.ruta)?.clave !== c.clave) return false;
  const dir = dirname(uproject);
  if (!c.archivos.every(a => existsSync(a.endsWith('.umap') ? archivoAsset(dir, a.slice(0, -5)).replace(/\.uasset$/, '.umap') : archivoAsset(dir, a)))) return false;
  acierto(db, c.ruta);
  return true;
}

export function recordar(db: DatabaseSync, receta: Record<string, unknown> & {plantilla: PlantillaReceta}, ue: string): void {
  const c = claveCache(receta, ue);
  if (c) guardar(db, {ruta: c.ruta, tipo: 'salida', plantilla: receta.plantilla, clave: c.clave, asset: null, estructura: null, estaticos: null,
    parametros: JSON.stringify(receta), preview: null, ue});
}
