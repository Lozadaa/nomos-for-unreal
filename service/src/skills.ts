import { readdirSync, lstatSync, realpathSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';

const groups:Record<string,string[]>={
  // ue-oficio (skill propia): trampas de Python 5.8, importar, cámara, luz, PCG y crashes; la carga todo rol que toca el editor
  // set ampliado 2026-11-08: ue-* (quodsoler), unreal-*/disciplinas (awesome-gamedev-agent-skills, Apache-2.0), unreal-best-practices (maystudios, MIT)
  implementation:['ue-project-context','ue-cpp-foundations','ue-gameplay-framework','ue-actor-component-architecture','ue-module-build-system',
    'ue-input-system','ue-physics-collision','physics-tuning','camera-systems','game-feel','ue-testing-debugging','ue-oficio'],
  ability:['ue-gameplay-abilities','ue-niagara-effects','ue-animation-system','ue-audio-system','game-feel','ue-oficio'],
  vfx:['ue-niagara-effects','unreal-niagara','ue-materials-rendering','vfx-fx','lighting','ue-oficio'],
  ui:['game-ui-art-director','ue-ui-umg-slate','game-ui-design','game-ui-ux','ue-umg-ui','ux-writing','ue-visual-qa','ue-oficio'],
  assets:['blender-director','asset-optimization','collision-proxy','lod-pipeline','unreal-export','qa-review','ue-asset-intake','ue-oficio'],
  animation:['rigging','ue-animation-system','ue-oficio'],
  world:['environment-artist','set-dressing','level-design','ue-procedural-generation','ue-world-level-streaming','lighting','ue-oficio'],
  camera:['camera-systems','camera-cinematography','ue-sequencer-cinematics','ue-oficio'],
  ai:['ue-ai-navigation','ue-state-trees','unreal-behavior-trees','game-ai','ue-oficio'],
  audio:['ue-audio-system','audio-design'],
  qa:['ue-testing-debugging','ue-visual-qa','unreal-packaging','performance-optimization','ue-oficio'],
  review:['code-review','superpowers:requesting-code-review'],
  scope:['game-jam','prototype-fast','unreal-best-practices']
};
const aliases:Record<string,string>={
  implementacion:'implementation',implementation:'implementation',programmer:'implementation',cpp:'implementation',blueprint:'implementation',
  habilidad:'ability','habilidad-jugable':'ability',ability:'ability',
  ui:'ui',umg:'ui','ui-del-juego':'ui',
  arte:'assets',assets:'assets',asset:'assets',art:'assets',
  personaje:'animation',animacion:'animation',animation:'animation',character:'animation',
  escenarios:'world',nivel:'world',mundo:'world',environment:'world',world:'world',
  vfx:'vfx',efectos:'vfx',materiales:'vfx',material:'vfx',niagara:'vfx',
  camara:'camera',camera:'camera',cinematica:'camera',
  ia:'ai',ai:'ai',enemigos:'ai',npc:'ai',
  audio:'audio',sonido:'audio',qa:'qa',builds:'qa',testing:'qa',
  revisor:'review',reviewer:'review',review:'review',
  alcance:'scope',jam:'scope','game-jam':'scope'
};
const normalize=(value:string)=>value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[ _/]+/g,'-');
const groupOf=(role:string,area:string)=>{
  const roleGroup=aliases[normalize(role)],areaKey=normalize(area);
  return roleGroup && roleGroup!=='implementation' ? roleGroup : aliases[areaKey] ?? (areaKey==='gameplay' ? 'implementation' : roleGroup);
};
/** El rol especialista prevalece; el área orienta únicamente al rol genérico o desconocido. */
export function skillsForRole(role:string,area:string):string[] {
  const group=groupOf(role,area),areaKey=normalize(area);
  const result=[...(groups[group] ?? [])];
  if(group==='ability' && areaKey==='ui') result.push('ue-ui-umg-slate');
  if(group==='review' && ['arquitectura','architecture'].includes(areaKey)) result.push('architect-review');
  return [...new Set(result)];
}
/** Jam 2026-11-10 (la 4.ª vuelta de las metras cargó 12 skills y fue 19 min más lenta): en modo rápido solo `core` es
 *  obligatoria; `extra`, si hace falta. Los grupos sin núcleo van enteros en `core`. */
const cores:Record<string,string[]>={implementation:['ue-oficio','ue-cpp-foundations','game-feel'],ability:['ue-oficio','ue-gameplay-abilities','game-feel'],
  vfx:['ue-oficio','ue-niagara-effects','ue-materials-rendering'],ui:['ue-oficio','ue-umg-ui','game-ui-art-director'],
  world:['ue-oficio','level-design','lighting'],camera:['ue-oficio','camera-systems'],ai:['ue-oficio','game-ai']};
export function skillSplit(role:string,area:string):{core:string[];extra:string[]} {
  const all=skillsForRole(role,area),core=cores[groupOf(role,area)]?.filter(s=>all.includes(s)) ?? all;
  return {core,extra:all.filter(s=>!core.includes(s))};
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
