import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb } from '../../service/src/db.ts';
import { createTask } from '../../service/src/repo/tasks.ts';
import { enqueue, complete, fail } from '../../service/src/commands.ts';
import { createOrca } from '../../service/src/adapters/orca.ts';
import { createGit } from '../../service/src/adapters/git.ts';
import { createWorkerHandlers } from '../../service/src/handlers/worker.ts';
import { read, filtered } from '../../service/src/repo/rows.ts';
import type { Run, Worktree } from '../../service/src/model.ts';

export function fixture(t: any, env: Record<string,string> = {}) {
  const dir=mkdtempSync(join(tmpdir(),'kratos-worker-')), projectDir=join(dir,'game'),dataDir=join(projectDir,'.kratos');
  mkdirSync(dataDir,{recursive:true});
  // Codex viene apagado por defecto (hito 7): estas pruebas lo arrancan, así que lo habilitan explícitamente
  writeFileSync(join(dataDir,'config.json'),JSON.stringify({concurrency:{codex:2,claude:2}}));
  const git=(...args:string[])=>execFileSync('git',['-C',projectDir,...args],{encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']});
  git('init');git('config','core.autocrlf','false');git('config','user.name','Kratos test');git('config','user.email','test@example.invalid');
  writeFileSync(join(projectDir,'Game.uproject'),'{"FileVersion":3}\n');
  writeFileSync(join(projectDir,'base.txt'),'base\n');git('add','base.txt','Game.uproject');git('commit','-m','Base');
  const db=openDb(join(dataDir,'kratos.db')), file=join(dir,'orca.json');
  const state=()=>JSON.parse(readFileSync(file,'utf8'));
  const output=(...lines:string[])=>{const data=state();data.tail.push(...lines);writeFileSync(file,JSON.stringify(data));};
  writeFileSync(file,JSON.stringify({repos:[],tail:[],realRepo:projectDir,treePath:join(dir,'worker tree')}));
  const orcaOptions={bin:process.execPath,args:[fileURLToPath(new URL('../fakes/orca.ts',import.meta.url))],
    env:{FAKE_ORCA_STATE:file,...env},timeoutMs:env.FAKE_ORCA_HANG==='1' ? 500 : 5000};
  const ctx={db,dataDir,projectDir,orca:createOrca(orcaOptions),git:createGit()};
  const task=createTask(db,{title:'Documentar juego',area:'qa',spec:'Crear README',acceptance:['Existe README','Prueba verde'],scope:['Docs','Scripts']});
  const handlers=createWorkerHandlers();
  const invoke=async (type:string,payload:object,key=type+':'+crypto.randomUUID())=>{
    const cmd=enqueue(db,type,payload,key);
    db.prepare("update commands set state='running',attempts=attempts+1 where id=?").run(cmd.id);
    try {const result=await handlers[type](cmd,ctx);complete(db,cmd.id,result||undefined);return result;}
    catch(error) {fail(db,cmd.id,String(error),{retry:false});throw error;}
  };
  const start=()=>invoke('worker.start',{taskId:task.id,provider:'codex',role:'programmer',skills:['tdd']});
  const run=()=>filtered<Run>(db,'runs',{taskId:task.id})[0];
  const tree=()=>read<Worktree>(db,'worktrees',run().metadata.worktreeId!)!;
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
  return {dir,db,projectDir,dataDir,ctx,task,handlers,invoke,start,run,tree,state,output,file,git,orcaOptions};
}
