import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { createTask } from '../../service/src/repo/tasks.ts';

for(const provider of ['claude','opencode']) test(`HTTP acepta ${provider}, preserva idempotencia y exige token`,async()=>{
  const f=await fixture(true);
  try {
    const task=createTask(f.db,{title:'Cambio',area:'qa',spec:'Crear',acceptance:['Existe'],scope:['Docs']});
    f.db.prepare("update tasks set state='preparada' where id=?").run(task.id);
    const path='/tasks/'+task.id+'/worker',payload={provider,role:'implementacion',skills:['qa'],attempt:2};
    assert.equal((await f.request(path,payload,false)).status,401);
    const first=await f.request(path,payload);assert.equal(first.status,202);const result=await first.json();
    assert.deepEqual(await (await f.request(path,payload)).json(),result);
    const command=f.db.prepare('select * from commands').get()!;
    assert.equal(JSON.parse(command.payload as string).provider,provider);
    assert.equal(command.idempotency_key,`worker.start:${task.id}:2`);
    assert.equal(f.db.prepare('select count(*) n from runs').get()!.n,0);
  } finally {await f.close();}
});
