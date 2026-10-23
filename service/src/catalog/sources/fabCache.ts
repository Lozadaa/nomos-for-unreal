import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';
import { files } from './fs.ts';
import { projectDirs } from './projects.ts';

/** `FabSettings.CacheDirectoryPath` de cada proyecto, además de las carpetas por defecto (`%TEMP%\FabLibrary`). */
export function cacheDirs(config: AssetConfig): string[] {
  const found = projectDirs(config).flatMap(project => {
    try {
      const ini = readFileSync(join(config.projectsDir, project, 'Saved/Config/WindowsEditor/EditorPerProjectUserSettings.ini'), 'utf8');
      const path = ini.match(/^CacheDirectoryPath=.*?Path="([^"]+)"/m)?.[1];
      return path ? [path] : [];
    } catch { return []; }
  });
  return [...new Set([...config.fabCacheDirs, ...found])];
}

export function scan(config: AssetConfig): CatalogEntryInput[] {
  return cacheDirs(config).flatMap(dir => files(dir, '.zip').map(zip => {
    const assetId = zip.slice(0, -4);
    return {source: 'fab' as const, name: assetId, category: 'pack', description: 'Pack en la caché del plugin Fab',
      state: 'cached' as const, fabUid: assetId, localPath: join(dir, zip), formats: ['zip']};
  }));
}
