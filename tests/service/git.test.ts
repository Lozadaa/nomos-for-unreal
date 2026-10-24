import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createGit } from '../../service/src/adapters/git.ts';
export function repository(t: any) {
  const dir=mkdtempSync(join(tmpdir(),'nomos-git-'));
  const git=(...args:string[]) => execFileSync('git',['-C',dir,...args],{encoding:'utf8',windowsHide:true});
  git('init');git('config','core.autocrlf','false');git('config','user.name','Nomos test');git('config','user.email','test@example.invalid');
  writeFileSync(join(dir,'tracked.txt'),'antes\n');git('add','.');git('commit','-m','Base');
  t.after(()=>rmSync(dir,{recursive:true,force:true,maxRetries:3}));
  return {dir,git};
}
test('Git exige raíz exacta y muestra diferencias committeadas, pendientes, nuevas y binarias',async t=>{
  const {dir,git}=repository(t), adapter=createGit(); const base=git('rev-parse','HEAD').trim();
  mkdirSync(join(dir,'child'));
  assert.equal(await adapter.isRepo(dir),true);assert.equal(await adapter.isRepo(join(dir,'child')),false);
  writeFileSync(join(dir,'tracked.txt'),'commit\n');writeFileSync(join(dir,'tracked-binary.bin'),Buffer.from([0,1]));
  git('add','.');git('commit','-m','Cambio');
  writeFileSync(join(dir,'tracked.txt'),'pendiente\n');writeFileSync(join(dir,'new.txt'),'nueva\n');
  writeFileSync(join(dir,'tracked-binary.bin'),Buffer.from([0,2,3]));
  writeFileSync(join(dir,'binary.bin'),Buffer.from([0,1,2,3]));
  writeFileSync(join(dir,'.nomos-brief.md'),'secreto local');mkdirSync(join(dir,'.nomos-inbox'));writeFileSync(join(dir,'.nomos-inbox','a.md'),'local');
  const diff=await adapter.diff(dir,base);
  assert.match(diff.patch,/pendiente/);assert.match(diff.patch,/nueva/);assert.match(diff.stat,/binary.bin/);
  assert.match(diff.stat,/tracked-binary.bin/);
  assert.doesNotMatch(diff.patch,/secreto local|GIT binary patch|Binary files|binary\.bin|\.nomos-inbox/);
  assert.equal((await adapter.log(dir,base))[0].subject,'Cambio');
  await adapter.renameBranch(dir,'nomos/test');assert.equal(await adapter.currentBranch(dir),'nomos/test');
  assert.equal(await adapter.head(dir),git('rev-parse','HEAD').trim());
});

test('renombrar o cambiar modo de binario solo aparece en stat aunque Git no emita Binary files',async t=>{
  const {dir,git}=repository(t),adapter=createGit();
  writeFileSync(join(dir,'old.bin'),Buffer.from([0,1]));git('add','.');git('commit','-m','Binario base');
  const base=git('rev-parse','HEAD').trim();git('mv','old.bin','new.bin');
  const rename=await adapter.diff(dir,base);assert.match(rename.stat,/\.bin/);assert.doesNotMatch(rename.patch,/\.bin/);
  git('reset','--hard',base);git('update-index','--chmod=+x','old.bin');
  const mode=await adapter.diff(dir,base);assert.match(mode.stat,/old.bin/);assert.doesNotMatch(mode.patch,/old.bin/);
});
