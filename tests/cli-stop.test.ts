import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { cliPath, until } from './cli-helpers.ts';
import { start } from '../service/src/server.ts';
import { openDb } from '../service/src/db.ts';
import { enqueue } from '../service/src/commands.ts';
import { readServiceInfo, isAlive } from '../service/src/service-info.ts';
import { removeDir } from './remove-dir.ts';

function stopCli(dataDir: string) {
  const child=spawn(process.execPath,[cliPath,'stop','--data',dataDir],{windowsHide:true});
  let stdout='',stderr='';child.stdout.on('data',d=>{stdout+=d;});child.stderr.on('data',d=>{stderr+=d;});
  const done=new Promise<number|null>(accept=>child.once('close',accept));
  return {child,done,output:()=>({stdout,stderr})};
}

test('CLI stop espera drenaje real mayor que dos segundos con health vivo hasta terminar handler',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-cli-drain-'));
  const db=openDb(join(dir,'nomos.db'));enqueue(db,'hold',{},'hold');db.close();
  let entered=false,release!:()=>void,finished=false;
  const gate=new Promise<void>(accept=>{release=accept;});
  const info=await start({dataDir:dir,port:0,runner:{handlers:{hold:async(_,ctx)=>{
    entered=true;await gate;ctx.db.prepare("update director set session='finished' where id=1").run();finished=true;
  }}}});
  let cli: ReturnType<typeof stopCli> | undefined;
  try {
    await until(async()=>entered);cli=stopCli(dir);
    await delay(2500);
    assert.equal(await isAlive(info),true);assert.equal(finished,false);
    assert.equal(readServiceInfo(dir)?.token,info.token);
    assert.equal(cli.child.exitCode,null,cli.output().stderr);
    assert.doesNotMatch(cli.output().stdout,/DETENIDO/);
    release();assert.equal(await cli.done,0,cli.output().stderr);
    assert.equal(finished,true);assert.equal(await isAlive(info),false);assert.equal(readServiceInfo(dir),null);
    const reopened=openDb(join(dir,'nomos.db'));
    try {assert.equal(reopened.prepare('select session from director').get()!.session,'finished');} finally {reopened.close();}
  } finally {
    release();await cli?.done;
    await until(async()=>!existsSync(join(dir,'service.json')));
    removeDir(dir);
  }
});

test('CLI no borra service.json ni anuncia detenido cuando health cae antes de barrera del servidor',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'nomos-cli-barrier-')),file=join(dir,'service.json');
  let closed=false,retire!:()=>void;
  const barrier=new Promise<void>(accept=>{retire=accept;});
  const server=createServer((req,res)=>{
    res.writeHead(req.url==='/health' ? 200 : 202,{'Content-Type':'application/json',Connection:'close'});res.end('{}');
    if (req.url==='/admin/stop') server.close(()=>{closed=true;});
  });
  await new Promise<void>(accept=>server.listen(0,'127.0.0.1',accept));
  writeFileSync(file,JSON.stringify({pid:process.pid,port:(server.address() as any).port,token:'barrier-token',startedAt:new Date().toISOString()}));
  const retiring=barrier.then(()=>rmSync(file,{force:true})),cli=stopCli(dir);
  try {
    await until(async()=>closed);await delay(200);
    assert.equal(existsSync(file),true,'solo el servidor retira su token');
    assert.equal(cli.child.exitCode,null);assert.doesNotMatch(cli.output().stdout,/DETENIDO/);
    retire();await retiring;
    assert.equal(await cli.done,0,cli.output().stderr);assert.equal(cli.output().stdout.trim(),'DETENIDO');
  } finally {retire();await retiring;await cli.done;server.close();removeDir(dir);}
});
