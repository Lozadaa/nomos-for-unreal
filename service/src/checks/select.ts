import { legacySpecFile } from '../legacy.ts';
/** `acabado`, `imagen` y `arte` no las elige selectChecks: el lote de comprobaciones las añade cuando el diff toca algo visible (checks/acabado.ts). */
export type CheckId = 'acabado' | 'imagen' | 'arte' | 'cpp' | 'blueprint' | 'asset' | 'animation' | 'map' | 'umg' | 'build';
/** Orden de ejecución: compilar antes de abrir el editor; empaquetar, al final y solo si se pide. */
export const checkOrder: CheckId[] = ['cpp', 'blueprint', 'asset', 'animation', 'map', 'umg', 'build'];
/** Hito 5b: mallas con esqueleto, clips, Animation Blueprints, IK Rigs y retargeters, carpetas de personajes y la ficha del personaje. */
const animated = (file: string, name: string) => /^(SK|SKM|ABP|AM|A|BS|MM|IK|RTG)_/i.test(name) && /\.uasset$/i.test(file)
  || /(^|\/)Content\/(.+\/)?(Anims|Animations|Characters)\//i.test(file) && /\.uasset$/i.test(file) || name === 'nomos-personaje.json' || name === legacySpecFile;

const slash = (path: string) => path.replaceAll('\\', '/');

/** `Content/UI/WBP_Vida.uasset` → `/Game/UI/WBP_Vida`; fuera de Content, null. */
export function gamePackage(path: string): string | null {
  const match = /(?:^|\/)Content\/(.+)\.(uasset|umap)$/i.exec(slash(path));
  return match ? `/Game/${match[1]}` : null;
}

/** Comprobaciones que exige un diff (plan v1 §9); todas son obligatorias para pasar de probando a integrando. */
export function selectChecks(files: string[], scope: string[] = []): CheckId[] {
  const found = new Set<CheckId>();
  for (const file of files.map(slash)) {
    const name = file.split('/').at(-1)!;
    if (/\.(cpp|h|hpp|inl)$/i.test(file) || /\.(Build|Target)\.cs$/i.test(file)) found.add('cpp');
    if (/\.umap$/i.test(file)) found.add('map');
    if (/\.uasset$/i.test(file)) {
      if (/^WBP_/i.test(name) || /(^|\/)Content\/UI\//i.test(file)) found.add('umg');
      else if (/^BP_/i.test(name) || /\/Blueprints\//i.test(file)) found.add('blueprint');
      else if (/^(SM|T|M|MI)_/i.test(name)) found.add('asset');
    }
    if (animated(file, name)) found.add('animation');
    if (/(^|\/)Config\/Default[^/]*\.ini$/i.test(file)) found.add('build');
  }
  if (scope.some(path => /(^|\/)build/i.test(path))) found.add('build');
  return checkOrder.filter(id => found.has(id));
}

type Criterios = {acceptance: string[]; scope: string[]};
/** La tarea que empaqueta: alcance `build` o criterios que piden empaquetar, el .exe o la comprobación `imagen` (criterio fijo de lo visible). */
export const empaqueta = (task: Criterios) => task.scope.some(p => /(^|\/)build/i.test(p))
  || (task.acceptance ?? []).some(a => /empaquet|\.exe\b|`?imagen`? sin fallos/i.test(a));
/** La spec pide el juez de arte (criterio fijo de toda spec visible, skill nomos · Repartir). */
export const juezArte = (task: Criterios) => task.acceptance.some(a => /juez de arte/i.test(a));
/** 2026-11-11: el lote corría solo con criterios `check:`; en modo rápido nadie los escribe y acabado e imagen no corrían nunca. */
export const pideLote = (task: Criterios) => task.acceptance.some(a => a.startsWith('check:')) || empaqueta(task) || juezArte(task);
