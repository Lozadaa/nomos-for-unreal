import { readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';

const groups:Record<string,string[]>={
  implementation:['ue-project-context','ue-cpp-foundations','ue-gameplay-framework','ue-module-build-system'],
  ability:['ue-gameplay-abilities','ue-niagara-effects','ue-animation-system','ue-audio-system'],
  ui:['game-ui-art-director','ue-ui-umg-slate','game-ui-design','game-ui-ux','ue-umg-ui','ux-writing','ue-visual-qa'],
  assets:['blender-director','asset-optimization','collision-proxy','lod-pipeline','unreal-export','qa-review','ue-asset-intake'],
  animation:['rigging','ue-animation-system'],
  world:['environment-artist','set-dressing','ue-procedural-generation','ue-world-level-streaming','lighting'],
  audio:['ue-audio-system'],
  qa:['ue-testing-debugging','ue-visual-qa','ue-test-package','unreal-packaging'],
  review:['code-review','superpowers:requesting-code-review'],
  scope:['ue-jam-director','game-jam']
};
const aliases:Record<string,string>={
  implementacion:'implementation',implementation:'implementation',programmer:'implementation',cpp:'implementation',blueprint:'implementation',
  habilidad:'ability','habilidad-jugable':'ability',ability:'ability',
  ui:'ui',umg:'ui','ui-del-juego':'ui',
  arte:'assets',assets:'assets',asset:'assets',art:'assets',
  personaje:'animation',animacion:'animation',animation:'animation',character:'animation',
  escenarios:'world',nivel:'world',mundo:'world',environment:'world',world:'world',
  audio:'audio',qa:'qa',builds:'qa',testing:'qa',
  revisor:'review',reviewer:'review',review:'review',
  alcance:'scope',jam:'scope','game-jam':'scope'
};
const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ _/]+/g,'-');
/** El rol especialista prevalece; el área orienta únicamente al rol genérico o desconocido. */
export function skillsForRole(role:string,area:string):string[] {
  const roleGroup=aliases[normalize(role)],areaKey=normalize(area);
  const group=roleGroup && roleGroup!=='implementation' ? roleGroup
    : aliases[areaKey] ?? (areaKey==='gameplay' ? 'implementation' : roleGroup);
  const result=[...(groups[group] ?? [])];
  if(group==='ability' && areaKey==='ui') result.push('ue-ui-umg-slate');
  if(group==='review' && ['arquitectura','architecture'].includes(areaKey)) result.push('architect-review');
  return [...new Set(result)];
}
export type InstalledSkill={name:string;path:string;source:'claude'|'agents'};
function missing(error:unknown):boolean {return ['ENOENT','ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');}
/** Inventario local; nunca consulta el catálogo global ni instala skills. */
export function installedSkills(workspaceDir:string):InstalledSkill[] {
  const root=resolve(workspaceDir),result:InstalledSkill[]=[];
  for(const source of ['claude','agents'] as const) {
    const folder=join(root,'.'+source,'skills');
    try {
      const inside=relative(realpathSync(root),realpathSync(folder));
      if(inside==='..'||inside.startsWith('..\\')||inside.startsWith('../')||isAbsolute(inside)) continue;
      for(const entry of readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)) {
        if(!entry.isDirectory()) continue;
        const path=join(folder,entry.name,'SKILL.md');
        try {if(lstatSync(path).isFile()) result.push({name:entry.name,path,source});}
        catch(error) {if(!missing(error)) throw error;}
      }
    } catch(error) {if(!missing(error)) throw error;}
  }
  return result;
}
