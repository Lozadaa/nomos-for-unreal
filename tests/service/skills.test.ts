import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skillsForRole, installedSkills } from '../../service/src/skills.ts';
import { removeDir } from '../remove-dir.ts';

// ue-oficio (skill propia, oficio de UE 5.8) la carga todo rol que toca el editor; revisor, audio y alcance no
const ui=['game-ui-art-director','ue-ui-umg-slate','game-ui-design','game-ui-ux','ue-umg-ui','ux-writing','ue-visual-qa','ue-oficio'];
test('tabla §4: UI, rol especialista precede área y resultado independiente',()=>{
  assert.deepEqual(skillsForRole('ui','ui'),ui);
  assert.deepEqual(skillsForRole('programmer','ui'),ui);
  assert.deepEqual(skillsForRole('audio','ui'),['ue-audio-system','audio-design']);
  assert.deepEqual(skillsForRole('revisor','ui'),['code-review','superpowers:requesting-code-review']);
  assert.deepEqual(skillsForRole('reviewer','arquitectura'),['code-review','superpowers:requesting-code-review','architect-review']);
  const result=skillsForRole('ui','ui');result.push('mutada');assert.deepEqual(skillsForRole('ui','ui'),ui);
});
test('tabla §4: implementación, habilidades, assets, animación, mundo, QA y alcance',()=>{
  assert.deepEqual(skillsForRole('implementacion','gameplay'),[
    'ue-project-context','ue-cpp-foundations','ue-gameplay-framework','ue-actor-component-architecture','ue-module-build-system',
    'ue-input-system','ue-physics-collision','physics-tuning','camera-systems','game-feel','ue-testing-debugging','ue-oficio']);
  assert.deepEqual(skillsForRole('habilidad','ui'),[
    'ue-gameplay-abilities','ue-niagara-effects','ue-animation-system','ue-audio-system','game-feel','ue-oficio','ue-ui-umg-slate']);
  assert.equal(skillsForRole('habilidad','gameplay').includes('ue-ui-umg-slate'),false);
  assert.deepEqual(skillsForRole('arte','ui'),[
    'blender-director','asset-optimization','collision-proxy','lod-pipeline','unreal-export','qa-review','ue-asset-intake','ue-oficio']);
  assert.deepEqual(skillsForRole('personaje','assets'),['rigging','ue-animation-system','ue-oficio']);
  assert.deepEqual(skillsForRole('implementation','escenarios'),[
    'environment-artist','set-dressing','level-design','ue-procedural-generation','ue-world-level-streaming','lighting','ue-oficio']);
  assert.deepEqual(skillsForRole('qa','audio'),['ue-testing-debugging','ue-visual-qa','unreal-packaging','performance-optimization','ue-oficio']);
  assert.deepEqual(skillsForRole('alcance','qa'),['game-jam','prototype-fast','unreal-best-practices']);
  assert.deepEqual(skillsForRole('implementacion','cámara'),['camera-systems','camera-cinematography','ue-sequencer-cinematics','ue-oficio']);
  assert.deepEqual(skillsForRole('ia','gameplay'),['ue-ai-navigation','ue-state-trees','unreal-behavior-trees','game-ai','ue-oficio']);
  assert.deepEqual(skillsForRole('desconocido','desconocida'),[]);
});
test('installedSkills enumera solo SKILL.md locales por fuente y nombre deterministas',t=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-skills-'));
  t.after(()=>removeDir(dir));
  const add=(source:string,name:string,file='SKILL.md')=>{
    const folder=join(dir,source,'skills',name);mkdirSync(folder,{recursive:true});
    writeFileSync(join(folder,file),'---\nname: otro-nombre\n---\n');return join(folder,file);
  };
  const z=add('.claude','zeta'),a=add('.agents','alfa');
  add('.agents','incompleta','README.md');add('.global','ignorada');
  mkdirSync(join(dir,'.claude','skills','directorio','SKILL.md'),{recursive:true});
  const outside=join(dir,'externo');mkdirSync(outside);writeFileSync(join(outside,'SKILL.md'),'No local');
  symlinkSync(outside,join(dir,'.agents','skills','enlace'),process.platform==='win32'?'junction':'dir');
  assert.deepEqual(installedSkills(dir),[{name:'zeta',path:z,source:'claude'},{name:'alfa',path:a,source:'agents'}]);
  assert.deepEqual(installedSkills(join(dir,'no-existe')),[]);
});
