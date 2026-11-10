import { existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../config.ts';
import type { CatalogEntry } from '../model.ts';
import type { Input } from '../repo/rows.ts';
import { gameEngine } from '../engine-path.ts';

export type CatalogEntryInput = Input<CatalogEntry> & Pick<CatalogEntry, 'name' | 'category' | 'description' | 'source'>;
/** Rutas de las fuentes del catálogo; todas se pueden fijar en `<dataDir>/config.json` (las pruebas usan carpetas temporales). */
export type AssetConfig = {
  projectsDir: string; quarantineProject: string | null; unrealPath: string | null; blenderPath: string | null;
  megascansDir: string; launcherLogPath: string; vaultDir: string; listingsDb: string; fabCacheDirs: string[];
  assetCli: {enabled: boolean};
};

const str = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;

export function assetConfig(dataDir: string, overrides: Record<string, unknown> = {}): AssetConfig {
  const raw = {...readConfig(dataDir) as Record<string, unknown>, ...overrides};
  const docs = join(homedir(), 'Documents');
  const projectsDir = str(raw.projectsDir) ?? join(docs, 'Unreal Projects');
  const vaultDir = str(raw.vaultDir) ?? join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'VaultCache');
  const quarantine = str(raw.quarantineProject) ?? join(projectsDir, 'KratosFabTest');
  return {
    projectsDir, vaultDir,
    quarantineProject: str(raw.quarantineProject) ?? (existsSync(quarantine) ? quarantine : null),
    // jam 2026-11-10: unrealPath de config.json; si no, el motor que pide el .uproject
    unrealPath: str(raw.unrealPath) ?? (() => { const e = gameEngine(dataDir); return e && 'cmd' in e ? e.cmd : null; })(), blenderPath: str(raw.blenderPath) ?? null,
    megascansDir: str(raw.megascansDir) ?? join(docs, 'Megascans Library', 'Downloaded', 'UAssets'),
    launcherLogPath: str(raw.launcherLogPath)
      ?? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'EpicGamesLauncher', 'Saved', 'Logs', 'EpicGamesLauncher.log'),
    listingsDb: str(raw.listingsDb) ?? join(vaultDir, 'FabLibrary', 'listings_v1.db'),
    fabCacheDirs: Array.isArray(raw.fabCacheDirs) ? raw.fabCacheDirs.filter(d => typeof d === 'string') : [join(tmpdir(), 'FabLibrary')],
    assetCli: {enabled: false},
  };
}
