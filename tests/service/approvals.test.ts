import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './route-fixture.ts';
import { createTask, requireTask } from '../../service/src/repo/tasks.ts';
import { startRun, finishRun } from '../../service/src/repo/runs.ts';
import { listEvents } from '../../service/src/store.ts';
import { needsApproval, requestApproval } from '../../service/src/approvals.ts';

// Hito 22, Tarea 4: «una sección por aprobar con imágenes y video por elemento para aprobar y yo viéndolo doy mi opinión o mi cierre».
async function setup(t: any, area = 'gameplay', extra: object = {}) {
  const f = await fixture(); t.after(() => f.close());
  const task = createTask(f.db, {title: 'J1.6 Reacciones a los golpes', area: area as any, state: 'revisando',
    spec: '## Qué\nLos golpes hacen retroceder al rival.\n\n## Por qué\nSensación de juego.', acceptance: ['El rival retrocede', 'Hay sonido'], scope: ['Source'], ...extra});
  const worker = startRun(f.db, {taskId: task.id, role: 'implementacion', provider: 'claude', sessionRef: 'term_w', metadata: {focus: ['Mira el retroceso al tercer golpe', 'Escucha el impacto']}});
  finishRun(f.db, worker.id, 'done', 'NOMOS_DONE');
  f.db.prepare('update tasks set review_approved=1 where id=?').run(task.id);
  const post = async (path: string, data: object) => { const r = await f.request(path, data); return {status: r.status, body: await r.json()}; };
  const events = (type: string) => listEvents(f.db, 0).filter(e => e.type === type).map(e => e.payload as any);
  return {...f, task, worker, post, events};
}

test('qué entra: áreas de approval.areas y cierres de hito; el código puro no', () => {
  const base = {title: 'X', spec: '', assigneeRole: null} as any;
  assert.equal(needsApproval({...base, area: 'gameplay'}, {}), true);
  assert.equal(needsApproval({...base, area: 'animacion'}, {}), true);
  assert.equal(needsApproval({...base, area: 'qa'}, {}), false);
  assert.equal(needsApproval({...base, area: 'builds', assigneeRole: 'arte'}, {}), true);
  assert.equal(needsApproval({...base, area: 'qa', title: 'J1 Cierre de hito'}, {}), true);
  assert.equal(needsApproval({...base, area: 'gameplay'}, {approval: {areas: ['ui']}}), false);
});

test('pedida: la tarea queda retenida «Esperando tu aprobación», no se integra y aparece en la lista con su evidencia y en qué fijarse', async t => {
  const f = await setup(t);
  const approval = requestApproval(f.db, requireTask(f.db, f.task.id));
  assert.deepEqual(f.events('approval.requested'), [{approvalId: approval.id, taskId: f.task.id}]);
  assert.equal(requireTask(f.db, f.task.id).hold?.reason, 'Esperando tu aprobación');
  assert.equal((await f.post(`/tasks/${f.task.id}/integrate`, {})).status, 409);
  const list = await (await f.request('/approvals')).json();
  assert.equal(list.pending, 1);
  const [item] = list.items;
  assert.equal(item.title, 'J1.6 Reacciones a los golpes');
  assert.equal(item.summary, 'Los golpes hacen retroceder al rival.');
  assert.deepEqual(item.focus, ['Mira el retroceso al tercer golpe', 'Escucha el impacto']);
  const status = await (await f.request('/status')).json();
  assert.equal(status.approvals, 1);
});

test('aprobar cierra la aprobación, suelta la retención y la tarea sigue a integración', async t => {
  const f = await setup(t);
  const approval = requestApproval(f.db, requireTask(f.db, f.task.id));
  const answer = await f.post(`/approvals/${approval.id}/approve`, {});
  assert.equal(answer.status, 200);
  assert.equal(answer.body.state, 'approved');
  assert.equal(f.events('approval.approved').length, 1);
  assert.equal(requireTask(f.db, f.task.id).state, 'integrando');
  assert.ok(f.db.prepare("select 1 from commands where type='integrate.run'").get(), 'integración pedida');
});

test('pedir cambios exige comentario y manda el texto literal del usuario al mismo worker; la tarea vuelve a implementando', async t => {
  const f = await setup(t);
  const approval = requestApproval(f.db, requireTask(f.db, f.task.id));
  assert.equal((await f.post(`/approvals/${approval.id}/changes`, {text: '  '})).status, 400);
  const answer = await f.post(`/approvals/${approval.id}/changes`, {text: 'El retroceso es demasiado corto, que se note más'});
  assert.equal(answer.body.state, 'changes');
  const send = f.db.prepare("select payload from commands where type='worker.send'").get() as any;
  const payload = JSON.parse(send.payload);
  assert.equal(payload.runId, f.worker.id);
  assert.match(payload.text, /El retroceso es demasiado corto, que se note más/);
  const task = requireTask(f.db, f.task.id);
  assert.equal(task.state, 'implementando'); assert.equal(task.reviewApproved, 0); assert.equal(task.hold, null);
  assert.equal(f.events('approval.changes_requested')[0].text, 'El retroceso es demasiado corto, que se note más');
});

test('comentar no bloquea y llega al director como mensaje; también un comentario general y con imagen pegada', async t => {
  const f = await setup(t);
  const approval = requestApproval(f.db, requireTask(f.db, f.task.id));
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a1c80000000049454e44ae426082', 'hex');
  const upload = await fetch((await f.request('/health')).url.replace('/health', '/approvals/images'),
    {method: 'POST', headers: {Authorization: 'Bearer secret', 'Content-Type': 'image/png'}, body: png});
  assert.equal(upload.status, 201);
  const {imageId} = await upload.json();
  const answer = await f.post(`/approvals/${approval.id}/comment`, {text: 'Me gusta el destello', imageId});
  assert.equal(answer.status, 200);
  await f.post('/approvals/comment', {text: 'En general va muy bien'});
  const messages = listEvents(f.db, 0).filter(e => e.type === 'message.received').map(e => (e.payload as any).text);
  assert.equal(messages.length, 2);
  assert.match(messages[0], /J1\.6.*Me gusta el destello/s);
  assert.match(messages[1], /En general va muy bien/);
  assert.equal(requireTask(f.db, f.task.id).hold?.reason, 'Esperando tu aprobación', 'comentar no la suelta');
  const [item] = (await (await f.request('/approvals')).json()).items;
  assert.deepEqual(item.comments.map((c: any) => [c.text, !!c.imageId]), [['Me gusta el destello', true]]);
  assert.equal(f.events('approval.commented').length, 2);
});

test('el revisor aprobado de una tarea de código no la manda a Por aprobar', async t => {
  const {finishReviewApproval} = await import('../../service/src/approvals.ts');
  const f = await setup(t, 'qa');
  assert.equal(finishReviewApproval(f.db, requireTask(f.db, f.task.id), {}, undefined), null);
  assert.equal(f.events('approval.requested').length, 0);
});

test('el director puede pedir la aprobación a mano; dos veces es la misma', async t => {
  const f = await setup(t, 'qa');
  const first = await f.post(`/tasks/${f.task.id}/approval`, {}), again = await f.post(`/tasks/${f.task.id}/approval`, {});
  assert.equal(first.status, 201); assert.equal(again.body.id, first.body.id);
  assert.equal(f.events('approval.requested').length, 1);
});

test('hito 25: en jam, un cierre de hito con más de 24 h sin aprobar abre «Hoy no hay build jugable aprobada» una vez', async t => {
  const {jamSweep} = await import('../../service/src/approvals.ts');
  const {listDecisions} = await import('../../service/src/repo/decisions.ts');
  const f = await setup(t, 'qa');
  const cierre = createTask(f.db, {title: 'Cierre J1', area: 'qa', state: 'implementando', spec: 'x', acceptance: [], scope: []});
  const old = new Date(Date.now() - 25 * 3_600_000).toISOString();
  f.db.prepare('update tasks set created_at=? where id=?').run(old, cierre.id);
  jamSweep(f.db, {});
  assert.equal(listDecisions(f.db, 'open').length, 0, 'sin jam no hay Decisión');
  jamSweep(f.db, {jam: {enabled: true}} as any); jamSweep(f.db, {jam: {enabled: true}} as any);
  const open = listDecisions(f.db, 'open');
  assert.deepEqual(open.map(d => [d.taskId, d.reason, d.options.map(o => o.label)]), [[cierre.id, 'Hoy no hay build jugable aprobada', ['Recortar', 'Seguir']]]);
  assert.match(open[0].options[0].description, /plan-jam\.md/);
  assert.equal(f.events('decision.updated').length, 0, 'no se repite cada barrido');
  // una aprobación reciente sobre otro cierre lo deja tranquilo
  const otro = createTask(f.db, {title: 'Cierre J2', area: 'qa', state: 'implementando', spec: 'x', acceptance: [], scope: []});
  f.db.prepare('update tasks set created_at=? where id=?').run(old, otro.id);
  finishRun(f.db, startRun(f.db, {taskId: otro.id, role: 'implementacion', provider: 'claude', sessionRef: 'term_o'}).id, 'done', 'x');
  const {approve} = await import('../../service/src/approvals.ts');
  approve(f.db, requestApproval(f.db, requireTask(f.db, otro.id)).id);
  jamSweep(f.db, {jam: {enabled: true}} as any);
  assert.equal(listDecisions(f.db, 'open').filter(d => d.taskId === otro.id).length, 0);
});
