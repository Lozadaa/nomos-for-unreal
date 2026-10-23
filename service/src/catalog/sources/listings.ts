import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';
import { packDir, subdirs } from './fs.ts';

type Row = {uid: string; title: string | null; entitlement: string | null; aiForbidden: number | null;
  category: string | null; thumbnail: string | null; vault: string | null};
/** `listings_v1.db` del Launcher: se copia a una carpeta temporal y se abre en solo lectura; nunca se toca el original. */
export function scan(config: AssetConfig): CatalogEntryInput[] {
  if (!existsSync(config.listingsDb)) return [];
  const dir = mkdtempSync(join(tmpdir(), 'kratos-listings-')), copy = join(dir, 'listings_v1.db');
  try {
    copyFileSync(config.listingsDb, copy);
    const db = new DatabaseSync(copy, {readOnly: true});
    try {
      const rows = db.prepare(`select l.uid, l.title, l.entitlement_uid entitlement, l.is_ai_forbidden aiForbidden,
        l.category_name category, l.thumbnail, (select path from download_meta d where d.listing_uid=l.uid order by id desc limit 1) vault
        from local_listing l order by l.uid`).all() as Row[];
      return rows.map(row => {
        const content = row.vault ? join(row.vault, 'data', 'Content') : null;
        const pack = content ? subdirs(content).find(packDir) : undefined;
        // la miniatura del Launcher es una URL remota: solo cuenta si apunta a un archivo en disco
        const thumbnail = row.thumbnail && !/^https?:/i.test(row.thumbnail) && existsSync(row.thumbnail) ? row.thumbnail : null;
        return {source: 'fab' as const, name: row.title || row.uid, category: row.category || 'pack',
          description: 'En tu biblioteca de Fab', state: 'owned' as const, fabUid: row.uid,
          entitlementUid: row.entitlement || null, aiForbidden: row.aiForbidden ? 1 as const : 0 as const,
          thumbnailPath: thumbnail, localPath: content && pack ? join(content, pack) : null};
      });
    } finally { db.close(); }
  } catch { return []; }
  finally { rmSync(dir, {recursive: true, force: true}); }
}
