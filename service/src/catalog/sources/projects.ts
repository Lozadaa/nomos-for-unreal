import { join } from 'node:path';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';
import { files, subdirs } from './fs.ts';

/** Proyectos Unreal de `projectsDir` (carpetas con un `.uproject`). */
export function projectDirs(config: AssetConfig): string[] {
  return subdirs(config.projectsDir).filter(name => files(join(config.projectsDir, name), '.uproject').length);
}

/** `Content/Fab/<pack>` de cada proyecto y `Content/<pack>` cuando coincide con un pack que bajó el Launcher. */
export function scan(config: AssetConfig, launcherPacks: Map<string, CatalogEntryInput> = new Map()): CatalogEntryInput[] {
  return projectDirs(config).flatMap(project => {
    const content = join(config.projectsDir, project, 'Content');
    const fab = subdirs(join(content, 'Fab')).map(pack => ({
      source: 'fab' as const, name: pack, category: 'pack', description: `Pack Fab importado en ${project}`,
      state: 'imported' as const, projects: [project], localPath: join(content, 'Fab', pack), formats: ['uasset'],
    }));
    const launcher = subdirs(content).filter(pack => launcherPacks.has(pack)).map(pack => ({
      ...launcherPacks.get(pack)!, state: 'imported' as const, projects: [project], localPath: join(content, pack),
    }));
    return [...fab, ...launcher];
  });
}
