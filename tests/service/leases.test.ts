import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../service/src/db.ts';
import { acquire, release, holders, listLeases } from '../../service/src/leases.ts';
import { listEvents } from '../../service/src/store.ts';

// Detecta una adquisición parcial, identidad sensible a mayúsculas o liberación de otro run.
test('reserva rutas normalizadas sin duplicados y rechaza conflicto atómicamente',()=>{
  const db=openDb(':memory:');
  try {
    assert.deepEqual(acquire(db,'r1','t1',['Content\\UI\\WBP_HUD.uasset','content/UI/wbp_hud.uasset']),{ok:true});
    assert.equal(listLeases(db).length,1);
    assert.deepEqual(acquire(db,'r2','t2',['Content/New.uasset','CONTENT/UI/WBP_HUD.uasset']),{
      ok:false,conflicts:[{path:'Content/UI/WBP_HUD.uasset',runId:'r1',taskId:'t1'}]});
    assert.equal(holders(db,'Content/New.uasset').length,0);
    assert.equal(holders(db,'CONTENT\\UI/wbp_hud.uasset')[0].runId,'r1');
    acquire(db,'r1','t1',['Content/Other.uasset']);
    acquire(db,'r3','t3',['Content/Keep.uasset']);
    release(db,'r1');release(db,'r1');
    assert.deepEqual(listLeases(db).map(l=>l.runId),['r3']);
    assert.deepEqual(listEvents(db,0).filter(e=>e.type.startsWith('lease.')).map(e=>e.type),
      ['lease.acquired','lease.conflict','lease.acquired','lease.acquired','lease.released']);
    for(const path of ['../outside','Content/../outside','C:\\outside','/absolute'])
      assert.throws(()=>acquire(db,'bad','t',[path]),/invalid_worker_scope/);
    assert.equal(listLeases(db).length,1);
  } finally {db.close();}
});
