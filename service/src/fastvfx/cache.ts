import type { DatabaseSync } from 'node:sqlite';

/** FASTVFX en el SQLite de Nomos: caché de estructuras y salidas, lotes y una fila de medida por receta. */
export function migrateFastVfx(db: DatabaseSync): void {
  db.exec(`
    create table if not exists fastvfx_cache(
      ruta text primary key collate nocase, tipo text not null, plantilla text not null, clave text not null,
      asset text, estructura text, estaticos text, parametros text, preview text, ue text,
      creado text not null, usado text not null, aciertos integer not null default 0);
    create table if not exists fastvfx_lotes(
      id text primary key, creado text not null, recetas integer not null, aperturas integer not null,
      ms_total real not null, ms_generacion real, ms_preview real, ms_primer_preview real, ok integer not null, detalle text not null);
    create table if not exists fastvfx_log(
      id integer primary key autoincrement, lote text not null, receta text not null, ruta text not null, plantilla text not null,
      clase text not null, ok integer not null, ms_editor real, ms_compilacion real, ms_guardado real, preview text, error text,
      creado text not null);
  `);
}

export type Fila = {ruta: string; tipo: 'estructura' | 'salida'; plantilla: string; clave: string; asset: string | null;
  estructura: string | null; estaticos: string | null; parametros: string | null; preview: string | null; ue: string | null; aciertos: number};

export const leer = (db: DatabaseSync, ruta: string) =>
  db.prepare('select * from fastvfx_cache where ruta = ?').get(ruta) as Fila | undefined;

export function guardar(db: DatabaseSync, f: Omit<Fila, 'aciertos'>): void {
  const ahora = new Date().toISOString();
  db.prepare(`insert into fastvfx_cache(ruta,tipo,plantilla,clave,asset,estructura,estaticos,parametros,preview,ue,creado,usado)
    values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(ruta) do update set tipo=excluded.tipo, plantilla=excluded.plantilla, clave=excluded.clave,
    asset=excluded.asset, estructura=excluded.estructura, estaticos=excluded.estaticos, parametros=excluded.parametros,
    preview=coalesce(excluded.preview, fastvfx_cache.preview), ue=excluded.ue, usado=excluded.usado`)
    .run(f.ruta, f.tipo, f.plantilla, f.clave, f.asset, f.estructura, f.estaticos, f.parametros, f.preview, f.ue, ahora, ahora);
}

export function acierto(db: DatabaseSync, ruta: string): void {
  db.prepare('update fastvfx_cache set aciertos = aciertos + 1, usado = ? where ruta = ?').run(new Date().toISOString(), ruta);
}

export function olvidar(db: DatabaseSync, filtro: {plantilla?: string} = {}): number {
  return Number((filtro.plantilla ? db.prepare('delete from fastvfx_cache where plantilla = ?').run(filtro.plantilla)
    : db.prepare('delete from fastvfx_cache').run()).changes);
}
