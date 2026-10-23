import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';

type Item = {id?: unknown; name?: unknown; assetType?: unknown};
export function scan(config: AssetConfig): CatalogEntryInput[] {
  let items: Item[];
  try { items = JSON.parse(readFileSync(join(config.megascansDir, 'uassetsData.json'), 'utf8')).assets; }
  catch { return []; }
  if (!Array.isArray(items)) return [];
  return items.filter(a => typeof a.id === 'string' && /^[\w-]+$/.test(a.id)).map(a => {
    const id = a.id as string, dir = join(config.megascansDir, id), png = join(dir, `${id}.png`);
    return {source: 'megascans' as const, name: typeof a.name === 'string' ? a.name : id,
      category: typeof a.assetType === 'string' ? a.assetType : 'asset', description: 'Asset de Megascans Library (Bridge)',
      state: 'downloaded' as const, localPath: dir, thumbnailPath: existsSync(png) ? png : null, formats: ['uasset'], tags: [id]};
  });
}
