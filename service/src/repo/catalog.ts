import type { DatabaseSync } from 'node:sqlite';
import type { CatalogEntry } from '../model.ts';
import { decode, filtered, insert, read, transaction, type Input } from './rows.ts';
type Filter = {
    source?: CatalogEntry['source'];
    state?: CatalogEntry['state'];
    category?: string;
};
function fts(db: DatabaseSync): void {
    if (db.prepare("select 1 from sqlite_master where type='table' and name='catalog_fts'").get())
        return;
    db.exec(`create virtual table if not exists catalog_fts using fts5(name, description, tags, content='catalog_entries', content_rowid='rowid');
 create trigger if not exists catalog_ai after insert on catalog_entries begin
 insert into catalog_fts(rowid,name,description,tags) values(new.rowid,new.name,new.description,new.tags);end;
 create trigger if not exists catalog_ad after delete on catalog_entries begin
 insert into catalog_fts(catalog_fts,rowid,name,description,tags) values('delete',old.rowid,old.name,old.description,old.tags);end;
 create trigger if not exists catalog_au after update on catalog_entries begin
 insert into catalog_fts(catalog_fts,rowid,name,description,tags) values('delete',old.rowid,old.name,old.description,old.tags);
 insert into catalog_fts(rowid,name,description,tags) values(new.rowid,new.name,new.description,new.tags);end;`);
    // Rebuild also covers pre-existing rows when this repository first opens an old database.
    db.exec("insert into catalog_fts(catalog_fts) values('rebuild')");
}
export function upsertEntry(db: DatabaseSync, input: Input<CatalogEntry> & Pick<CatalogEntry, 'name' | 'category' | 'description' | 'source'>): CatalogEntry {
    return transaction(db, () => {
        fts(db);
        const old = input.id ? read<CatalogEntry>(db, 'catalog_entries', input.id) : undefined;
        if (old) {
            db.prepare('delete from catalog_entries where id=?').run(old.id);
        }
        return insert<CatalogEntry>(db, 'catalog_entries', { sourceUrl: null, fabUid: null, entitlementUid: null, state: 'owned', projects: [], formats: [], engineVersions: [], license: null, aiForbidden: 0, thumbnailPath: null, localPath: null, tags: [], ...old, ...input, updatedAt: new Date().toISOString() });
    });
}
/** Clave natural del indexador: primero el listado de Fab, después la ruta en disco. */
export function findEntry(db: DatabaseSync, source: CatalogEntry['source'], key: { fabUid?: string | null; localPath?: string | null }): CatalogEntry | undefined {
    for (const [column, value] of [['fab_uid', key.fabUid], ['local_path', key.localPath]] as const) {
        if (!value) continue;
        const row = db.prepare(`select * from catalog_entries where source=? and ${column}=? collate nocase order by rowid limit 1`).get(source, value);
        if (row) return decode<CatalogEntry>(row);
    }
    return undefined;
}
export const listCatalog =(db: DatabaseSync, filter: Filter = {}) => filtered<CatalogEntry>(db, 'catalog_entries', filter);
export function searchCatalog(db: DatabaseSync, q: string, filter: Filter = {}): CatalogEntry[] {
    fts(db);
    const words = q.match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (!words.length)
        return [];
    // prefijo: «tennis» encuentra Free_Tennisball (FTS5 parte por guion bajo, no dentro de la palabra)
    const query = words.map(w => '"' + w + '"*').join(' AND ');
    const rows = db.prepare('select c.* from catalog_entries c join catalog_fts f on f.rowid=c.rowid where catalog_fts match ? order by rank').all(query).map(r => decode<CatalogEntry>(r));
    return rows.filter(row => Object.entries(filter).every(([k, v]) => v === undefined || row[k as keyof CatalogEntry] === v));
}
