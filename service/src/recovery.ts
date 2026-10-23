import type { DatabaseSync } from 'node:sqlite';
import { fail } from './commands.ts';
import { appendEvent } from './store.ts';
import { transaction } from './repo/rows.ts';
import { workerFailure } from './handlers/worker-failure.ts';

export function recoverCommands(db: DatabaseSync): void {
  transaction(db,()=>{
    for(const row of db.prepare("select id,type,payload from commands where state='running'").all()) {
      if(row.type==='worker.poll'||row.type==='worker.stop') {
        db.prepare("update commands set state='pending',claimed_by=null,started_at=null,updated_at=? where id=?")
          .run(new Date().toISOString(),row.id);
        appendEvent(db,'command.recovered',null,{commandId:row.id,type:row.type,state:'pending'});
      } else {
        const cause='orca: resultado incierto tras reinicio';
        fail(db,row.id as string,cause,{retry:false});
        if(row.type==='worker.start'||row.type==='worker.send') workerFailure(db,JSON.parse(row.payload as string),cause);
      }
    }
  });
}
