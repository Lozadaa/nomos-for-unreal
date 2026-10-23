import type { DatabaseSync } from 'node:sqlite';
import { normalizedPaths } from './handlers/worker-policy.ts';
import { decode, transaction } from './repo/rows.ts';
import { appendEvent } from './store.ts';

export type Lease = {path: string; runId: string; taskId: string; acquiredAt: string};
export type LeaseConflict = Pick<Lease,'path' | 'runId' | 'taskId'>;
export function acquire(db: DatabaseSync, runId: string, taskId: string, paths: string[]):
  {ok: true} | {ok: false; conflicts: LeaseConflict[]} {
  const unique=normalizedPaths(paths).filter((path,index,all)=>all.findIndex(p=>p.toLowerCase()===path.toLowerCase())===index);
  return transaction(db,()=>{
    // Obtain the SQLite writer lock before reading ownership, including across connections.
    db.exec('delete from leases where 0');
    const existing=listLeases(db),conflicts:LeaseConflict[]=[];
    for(const path of unique) {
      const lease=existing.find(l=>l.path.toLowerCase()===path.toLowerCase());
      if(lease && (lease.runId!==runId || lease.taskId!==taskId))
        conflicts.push({path:lease.path,runId:lease.runId,taskId:lease.taskId});
    }
    if(conflicts.length) {
      appendEvent(db,'lease.conflict',null,{runId,taskId,conflicts});return {ok:false,conflicts};
    }
    const acquiredAt=new Date().toISOString(),added:string[]=[];
    for(const path of unique) {
      if(existing.some(l=>l.path.toLowerCase()===path.toLowerCase())) continue;
      db.prepare('insert into leases(path,run_id,task_id,acquired_at) values(?,?,?,?)').run(path,runId,taskId,acquiredAt);
      added.push(path);
    }
    if(added.length) appendEvent(db,'lease.acquired',null,{runId,taskId,paths:added});
    return {ok:true};
  });
}
export function release(db: DatabaseSync, runId: string): void {
  transaction(db,()=>{
    const leases=listLeases(db).filter(l=>l.runId===runId);
    if(!leases.length) return;
    db.prepare('delete from leases where run_id=?').run(runId);
    appendEvent(db,'lease.released',null,{runId,taskId:leases[0].taskId,paths:leases.map(l=>l.path)});
  });
}
export function holders(db: DatabaseSync, path: string): Lease[] {
  const [normalized]=normalizedPaths([path]);
  return listLeases(db).filter(l=>l.path.toLowerCase()===normalized.toLowerCase());
}
export function listLeases(db: DatabaseSync): Lease[] {
  return db.prepare('select * from leases order by rowid').all().map(row=>decode<Lease>(row));
}
export function leaseWaitReason(conflicts: LeaseConflict[]): string {
  return 'Esperando reserva: '+conflicts.map(c=>`${c.path.split('/').at(-1)} (tarea ${c.taskId})`).join(', ');
}
