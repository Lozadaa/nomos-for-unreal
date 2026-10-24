import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { engineDirOf } from '../../adapters/unreal-build.ts';
import type { AssetConfig, CatalogEntryInput } from '../paths.ts';

export const engineLicense = 'Epic Content License (solo proyectos Unreal)';
/** Carpetas de contenido de las plantillas del motor con personajes y animaciones (UE 5.8). */
const templates = [
  {name: 'Maniquíes UE5 (Manny y Quinn)', category: 'character', skeleton: 'UE5_Mannequin', path: 'TemplateResources/High/Characters/Content'},
  {name: 'Animaciones de combate (plantilla Tercera persona)', category: 'animation', skeleton: 'UE5_Mannequin', path: 'TP_ThirdPerson/Content/Variant_Combat/Anims'},
  {name: 'Maniquí UE4', category: 'character', skeleton: 'UE4_Mannequin', path: 'TemplateResources/High/Mannequin/Content'},
];
/** Clips y mallas por convención de nombre; los ABP, rigs y materiales no se listan. */
const named = /^(AM|A|BS|MM|SK|SKM)_/;

function assets(dir: string): string[] | null {
  try {
    return readdirSync(dir, {recursive: true, withFileTypes: true})
      .filter(d => d.isFile() && d.name.toLowerCase().endsWith('.uasset')).map(d => basename(d.name, '.uasset'));
  } catch { return null; }
}

/** «5.8» de `Engine/Build/Build.version`; vacío si no se puede leer. */
function engineVersions(engineDir: string): string[] {
  try {
    const v = JSON.parse(readFileSync(join(engineDir, 'Build', 'Build.version'), 'utf8'));
    return [`${v.MajorVersion}.${v.MinorVersion}`];
  } catch { return []; }
}

export function scan(config: AssetConfig): CatalogEntryInput[] {
  const engineDir = engineDirOf(config.unrealPath), root = join(engineDir, '..', 'Templates');
  const versions = engineVersions(engineDir);
  return templates.flatMap(t => {
    const localPath = join(root, ...t.path.split('/')), found = assets(localPath);
    if (!found) return [];
    const clips = [...new Set(found.filter(name => named.test(name)))].sort();
    return [{source: 'engine' as const, name: t.name, category: t.category, description: `Plantilla del motor${versions[0] ? ` (UE ${versions[0]})` : ''}`,
      state: 'downloaded' as const, localPath, formats: ['uasset'], engineVersions: versions, license: engineLicense,
      aiForbidden: 0 as const, tags: [`skeleton:${t.skeleton}`, ...clips]}];
  });
}
