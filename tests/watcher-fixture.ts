import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { fixture, token } from './helpers.ts';
import { cliPath, until } from './cli-helpers.ts';

export const defaultKey='["director",["command.failed","message.received","run.finished","worker.waiting"]]';
const cleanups=new Map<string,Array<()=>Promise<void>>>();
export async function setup(t: TestContext) {
  const stops: Array<()=>Promise<void>>=[];
  t.after(async()=>{for(const stop of stops) await stop();});
  const result=await fixture(t),dataDir=result.web;
  cleanups.set(dataDir,stops);
  t.after(()=>{cleanups.delete(dataDir);});
  writeFileSync(join(dataDir,'service.json'),JSON.stringify({pid:process.pid,token,
    port:(result.server.address() as {port:number}).port,startedAt:new Date().toISOString()}));
  return {...result,dataDir};
}
export function checkpoint(dataDir: string, seq: number) {
  writeFileSync(join(dataDir,'watcher-cursors.json'),JSON.stringify({version:1,cursors:{[defaultKey]:seq}}));
}
export function start(t: TestContext,dataDir: string,...flags: string[]) {
  const child=spawn(process.execPath,[cliPath,'vigila','--session','director','--data',dataDir,...flags],{windowsHide:true});
  let output='',error='';
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{error+=chunk;});
  const stop=async()=>{
    if(child.exitCode!==null || child.signalCode!==null) return;
    const exited=once(child,'exit');child.kill();await exited;
  };
  cleanups.get(dataDir)!.push(stop);
  return {child,stop,lines:()=>output.trim().split('\n').filter(Boolean).map(s=>JSON.parse(s)),
    error:()=>error,wait:async(seq:number)=>until(async()=>output.split('\n').some(s=>{
      try{return JSON.parse(s).seq===seq;}catch{return false;}
    })),saved:()=>{
      try{return JSON.parse(readFileSync(join(dataDir,'watcher-cursors.json'),'utf8'));}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT') return {cursors:{}};throw error;}
    }};
}
