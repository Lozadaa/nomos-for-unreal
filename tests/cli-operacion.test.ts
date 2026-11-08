import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, cliFixture, api, until, cliPath } from './cli-helpers.ts';

const prepared=async (dataDir:string,title='Cambio')=>{
  const task=await api(dataDir,'/tasks',{title,area:'qa',spec:'Crear',acceptance:['Existe'],scope:['Docs']});
  await api(dataDir,'/tasks/'+task.id+'/spec',{spec:'Crear',acceptance:['Existe'],area:'qa',scope:['Docs']});
  return task;
};

test('CLI task reconcile encola la reconciliación de la tarea y la ejecuta el servicio',{timeout:30_000},async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const task=await prepared(dataDir);
  const result=cli(dataDir,'task','reconcile',task.id);assert.equal(result.status,0,result.stderr);
  const {commandId}=JSON.parse(result.stdout);
  await until(async ()=>(await api(dataDir,'/commands')).find((c:any)=>c.id===commandId)?.state==='done');
  const command=(await api(dataDir,'/commands')).find((c:any)=>c.id===commandId);
  assert.equal(command.type,'task.reconcile');assert.deepEqual(command.payload,{taskId:task.id});
  assert.equal(cli(dataDir,'task','reconcile').status,1);
});

test('CLI task create --priority y task priority TAREA N',{timeout:30_000},async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const created=cli(dataDir,'task','create','--title','Urgente','--area','qa','--priority','4');
  assert.equal(created.status,0,created.stderr);const task=JSON.parse(created.stdout);assert.equal(task.priority,4);
  const changed=cli(dataDir,'task','priority',task.id,'-1');assert.equal(changed.status,0,changed.stderr);
  assert.equal(JSON.parse(changed.stdout).priority,-1);
  assert.equal(cli(dataDir,'task','priority',task.id,'alta').status,1);
  assert.equal(cli(dataDir,'task','create','--title','X','--area','qa','--priority','1.5').status,1);
});

test('vigila encadenado: cada evento llega por la tubería al lector en cuanto ocurre, sin esperar a llenar un búfer',{timeout:30_000},async t=>{
  const {dataDir,port}=await cliFixture(t);cli(dataDir,'start','--port',String(port),'--no-open');
  const watcher=spawn(process.execPath,[cliPath,'vigila','--session','tuberia','--data',dataDir],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  // `vigila | lector`: el lector no es un TTY y apunta cada línea al recibirla, como haría cut o grep
  const out=join(dataDir,'lineas.txt');
  const reader=spawn(process.execPath,['-e',`process.stdin.on('data',d=>require('fs').appendFileSync(${JSON.stringify(out)},d))`],
    {windowsHide:true,stdio:[watcher.stdout,'ignore','ignore']});
  const lines=()=>existsSync(out) ? readFileSync(out,'utf8').split('\n').filter(Boolean) : [];
  try {
    for(const text of ['uno','dos','tres']) {
      const sent=await api(dataDir,'/messages',{text});
      await until(async ()=>lines().some(l=>JSON.parse(l).seq===sent.seq),10_000);
    }
    assert.deepEqual(lines().map(l=>JSON.parse(l).text),['uno','dos','tres']);
  } finally {
    // antes del desmontaje del fixture: en Windows un proceso vivo impide borrar la carpeta de datos
    const exited=Promise.all([watcher,reader].map(c=>c.exitCode===null ? new Promise(r=>c.once('exit',r)) : null));
    watcher.kill();reader.kill();await exited;
  }
});

test('CLI task create con un área inválida lista las válidas sin llamar al servicio',async ()=>{
  const {directorCli}=await import('../service/src/cli-director.ts');
  await assert.rejects(directorCli(['task','create','--title','HUD','--area','interfaz']),
    {message:'Uso: área inválida «interfaz»; válidas: gameplay, ui, escenarios, assets, animacion, audio, qa, builds'});
});
