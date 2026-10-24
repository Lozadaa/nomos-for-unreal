import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTask, getTask } from '../../service/src/repo/tasks.ts';
import { listDecisions, resolveDecision } from '../../service/src/repo/decisions.ts';
import { upsertEntry } from '../../service/src/repo/catalog.ts';
import { assetFixture } from './asset-fixture.ts';

const commands = (f: {db: any}) => (f.db.prepare('select type, payload, idempotency_key key from commands order by rowid').all() as
  {type: string; payload: string; key: string}[]).map(c => ({type: c.type, key: c.key, payload: JSON.parse(c.payload)}));
const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

function hero(f: ReturnType<typeof assetFixture>) {
  return createTask(f.db, {title: 'Héroe con animación de ataque', area: 'animacion'});
}

test('tres candidatos del catálogo con miniatura, origen, licencia y coste; nunca nombres de archivo ni uuid', async () => {
  const f = assetFixture();
  try {
    const task = hero(f);
    const result = await f.run('asset.candidates', {taskId: task.id, query: 'héroe con ataque'}, 'cand-1');
    assert.equal(result.deferred, true);
    const [decision] = listDecisions(f.db, 'open');
    assert.equal(decision.taskId, task.id);
    assert.equal(decision.reason, 'Elegir personaje base: 3 candidatos del catálogo');
    assert.deepEqual(decision.options.map(o => o.label), ['Manny (maniquí UE5)', 'MetaHuman Hudson', 'Quinn (maniquí UE5)']);
    assert.deepEqual(decision.options.map(o => !!o.recommended), [true, false, false]);
    for (const o of decision.options) {
      assert.ok(o.label.split(/\s+/).length <= 4, o.label);
      assert.doesNotMatch(o.label + o.description, /SKM_|\.uasset|\.png/);
      assert.doesNotMatch(o.label + o.description, uuid);
      assert.match(o.description, / · coste 0$/);
    }
    assert.equal(decision.options[0].description, 'Plantilla del motor · Epic Content License (solo proyectos Unreal) · coste 0');
    const hudson = f.entry('Hudson');
    assert.equal(decision.options[1].thumbnail, `/catalog/${hudson.id}/thumbnail`);
    assert.equal(decision.options[0].thumbnail, undefined, 'sin miniatura propia la opción es una tarjeta de texto');
    // reintento de la misma orden mientras se decide: sigue en espera, sin otra Decisión
    assert.equal((await f.run('asset.candidates', {taskId: task.id, query: 'héroe con ataque'}, 'cand-1')).deferred, true);
    assert.equal(listDecisions(f.db).length, 1);
    assert.deepEqual(commands(f), []);
  } finally { f.close(); }
});

test('si la petición nombra MetaHuman, los presets van primero', async () => {
  const f = assetFixture();
  try {
    await f.run('asset.candidates', {taskId: hero(f).id, query: 'un héroe MetaHuman con ataque'});
    assert.deepEqual(listDecisions(f.db, 'open')[0].options.map(o => o.label), ['MetaHuman Hudson', 'Manny (maniquí UE5)', 'MetaHuman Emory']);
  } finally { f.close(); }
});

test('elegir Manny encola la migración de maniquíes y del clip y después character.setup; la tarea espera editor', async () => {
  const f = assetFixture();
  try {
    const task = hero(f);
    const payload = {taskId: task.id, query: 'héroe con ataque', animations: ['AM_ComboAttack', 'AM_Inexistente']};
    await f.run('asset.candidates', payload, 'cand-1');
    const [decision] = listDecisions(f.db, 'open');
    resolveDecision(f.db, decision.id, decision.options[0].id, 'usuario');
    const result = await f.run('asset.candidates', payload, 'cand-1');
    assert.equal(result.ok, true);
    assert.deepEqual(result.missingClips, ['AM_Inexistente']);
    const chars = f.entry('Maniquíes UE5 (Manny y Quinn)'), combat = f.entry('Animaciones de combate (plantilla Tercera persona)');
    assert.deepEqual(commands(f), [
      {type: 'asset.migrate', key: `migrate:${chars.id}:Juego`, payload: {entryId: chars.id}},
      {type: 'asset.migrate', key: `migrate:${combat.id}:Juego`, payload: {entryId: combat.id}},
      {type: 'character.setup', key: `character.setup:${task.id}:${chars.id}:SKM_Manny_Simple`, payload: {taskId: task.id,
        mesh: '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple', animations: ['/Game/Variant_Combat/Anims/AM_ComboAttack']}},
    ]);
    const after = getTask(f.db, task.id)!;
    assert.equal(after.state, 'preparada');
    assert.equal(after.waitReason, 'Esperando editor');
    // la misma orden otra vez no duplica nada
    await f.run('asset.candidates', payload, 'cand-1');
    assert.equal(commands(f).length, 3);
  } finally { f.close(); }
});

test('elegir un preset MetaHuman encadena character.setup con su Blueprint y targetSkeleton metahuman', async () => {
  const f = assetFixture();
  try {
    const task = hero(f);
    await f.run('asset.candidates', {taskId: task.id, query: 'héroe MetaHuman', animations: ['AM_ComboAttack']}, 'c');
    const [decision] = listDecisions(f.db, 'open');
    const hudson = f.entry('Hudson');
    resolveDecision(f.db, decision.id, hudson.id, 'usuario');
    await f.run('asset.candidates', {taskId: task.id, query: 'héroe MetaHuman', animations: ['AM_ComboAttack']}, 'c');
    const setup = commands(f).find(c => c.type === 'character.setup')!;
    assert.deepEqual(setup.payload, {taskId: task.id, mesh: '/Game/MetaHumans/Hudson/BP_Hudson', targetSkeleton: 'metahuman',
      animations: ['/Game/Variant_Combat/Anims/AM_ComboAttack']});
    assert.ok(commands(f).some(c => c.type === 'asset.migrate' && c.payload.entryId === hudson.id));
  } finally { f.close(); }
});

test('sin candidatos: Decisión con las dos salidas reales; «Usar maniquí del motor» sigue con Manny y «Buscar en Fab» bloquea con el motivo', async () => {
  const f = assetFixture();
  try {
    upsertEntry(f.db, {name: 'Pack sin esqueleto', category: 'pack', description: '', source: 'fab', license: 'Fab Standard License'});
    const task = hero(f);
    await f.run('asset.candidates', {taskId: task.id, query: 'dragón', kinds: ['pack']}, 'c');
    const [decision] = listDecisions(f.db, 'open');
    assert.equal(decision.reason, 'Elegir personaje base: ningún candidato en el catálogo');
    assert.deepEqual(decision.options.map(o => [o.id, o.label]), [['fab', 'Buscar en Fab'], ['engine', 'Usar maniquí del motor']]);
    assert.match(decision.options[0].description, /nivel 2, con clics/);
    resolveDecision(f.db, decision.id, 'engine', 'usuario');
    await f.run('asset.candidates', {taskId: task.id, query: 'dragón', kinds: ['pack']}, 'c');
    assert.equal(commands(f).find(c => c.type === 'character.setup')!.payload.mesh, '/Game/Characters/Mannequins/Meshes/SKM_Manny_Simple');

    const other = hero(f);
    await f.run('asset.candidates', {taskId: other.id, query: 'dragón', kinds: ['pack']}, 'd');
    resolveDecision(f.db, listDecisions(f.db, 'open')[0].id, 'fab', 'usuario');
    const fab = await f.run('asset.candidates', {taskId: other.id, query: 'dragón', kinds: ['pack']}, 'd');
    assert.equal(fab.ok, false);
    assert.equal(getTask(f.db, other.id)!.blockedReason, 'Buscar en Fab (nivel 2, con clics): no hay personaje en el catálogo');
  } finally { f.close(); }
});

test('orden inválida: tarea desconocida o sin consulta', async () => {
  const f = assetFixture();
  try {
    await assert.rejects(f.run('asset.candidates', {taskId: 'nope', query: 'x'}), /unknown_task/);
    await assert.rejects(f.run('asset.candidates', {taskId: hero(f).id, query: ' '}), /invalid_candidates/);
    await assert.rejects(f.run('asset.candidates', {taskId: hero(f).id, query: 'x', kinds: ['meshy']}), /invalid_candidates/);
  } finally { f.close(); }
});

test('un preset que ya se llama «MetaHuman …» no repite la palabra en la tarjeta', async () => {
  const f = assetFixture();
  try {
    upsertEntry(f.db, {name: 'MetaHuman Ada', category: 'metahuman-preset', description: '', source: 'megascans'});
    await f.run('asset.candidates', {taskId: hero(f).id, query: 'Ada', kinds: ['metahuman-preset']});
    const labels = listDecisions(f.db, 'open')[0].options.map(o => o.label);
    assert.ok(labels.includes('MetaHuman Ada'), labels.join());
  } finally { f.close(); }
});
