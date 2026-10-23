import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { skillsForRole, installedSkills } from '../../service/src/skills.ts';

const ui=['game-ui-art-director','ue-ui-umg-slate','game-ui-design','game-ui-ux','ue-umg-ui','ux-writing','ue-visual-qa'];
test('tabla §4: UI, rol especialista precede área y resultado independiente',()=>{
  assert.deepEqual(skillsForRole('ui','ui'),ui);
  assert.deepEqual(skillsForRole('programmer','ui'),ui);
  assert.deepEqual(skillsForRole('audio','ui'),['ue-audio-system']);
  assert.deepEqual(skillsForRole('revisor','ui'),['code-review','superpowers:requesting-code-review']);
  assert.deepEqual(skillsForRole('reviewer','arquitectura'),['code-review','superpowers:requesting-code-review','architect-review']);
  const result=skillsForRole('ui','ui');result.push('mutada');assert.deepEqual(skillsForRole('ui','ui'),ui);
});
test('tabla §4: implementación, habilidades, assets, animación, mundo, QA y alcance',()=>{
  assert.deepEqual(skillsForRole('implementacion','gameplay'),[
    'ue-project-context','ue-cpp-foundations','ue-gameplay-framework','ue-module-build-system']);
  assert.deepEqual(skillsForRole('habilidad','ui'),[
    'ue-gameplay-abilities','ue-niagara-effects','ue-animation-system','ue-audio-system','ue-ui-umg-slate']);
  assert.equal(skillsForRole('habilidad','gameplay').includes('ue-ui-umg-slate'),false);
  assert.deepEqual(skillsForRole('arte','ui'),[
    'blender-director','asset-optimization','collision-proxy','lod-pipeline','unreal-export','qa-review','ue-asset-intake']);
  assert.deepEqual(skillsForRole('personaje','assets'),['rigging','ue-animation-system']);
  assert.deepEqual(skillsForRole('implementation','escenarios'),[
    'environment-artist','set-dressing','ue-procedural-generation','ue-world-level-streaming','lighting']);
  assert.deepEqual(skillsForRole('qa','audio'),['ue-testing-debugging','ue-visual-qa','ue-test-package','unreal-packaging']);
  assert.deepEqual(skillsForRole('alcance','qa'),['ue-jam-director','game-jam']);
  assert.deepEqual(skillsForRole('desconocido','desconocida'),[]);
});
test('installedSkills enumera solo SKILL.md locales por fuente y nombre deterministas',t=>{
  const dir=mkdtempSync(join(tmpdir(),'kratos-skills-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
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
