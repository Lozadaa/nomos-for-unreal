import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filtered } from '../../service/src/repo/rows.ts';
import { veredictoJugador } from '../../service/src/checks/map.ts';
import type { TestRun } from '../../service/src/model.ts';
import { checksFixture } from './checks-fixture.ts';

// harness: «el jugador apareció bien» y capturas magenta mientras compilan shaders
const rows = (f: {db: any; task: {id: string}}) => filtered<TestRun>(f.db, 'test_runs', {taskId: f.task.id});
const mapa = (modo: string) => async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel.umap']});
  process.env.NOMOS_FAKE = modo;
  try { await f.run(); const r = rows(f).find(x => x.checkId === 'map')!; return {r, log: readFileSync(r.reportPath!, 'utf8')}; }
  finally { process.env.NOMOS_FAKE = 'ok'; f.close(); }
};

test('harness: map falla si el jugador cae y pasa si está en el suelo', async () => {
  const cae = await mapa('cayendo')();
  assert.equal(cae.r.result, 'failed');
  assert.match(cae.log, /El jugador \(BP_Jugador_C\) está cayendo al capturar/);
  assert.equal((await mapa('ok')()).r.result, 'passed');
});

test('harness: una captura magenta se repite una vez y, si sigue magenta, no se manda a juzgar', async () => {
  const una = await mapa('magenta_once')();
  assert.equal(una.r.result, 'passed');
  assert.match(una.log, /captura magenta repetida/);
  const siempre = await mapa('magenta')();
  assert.equal(siempre.r.result, 'failed');
  assert.match(siempre.log, /Captura magenta dos veces: shaders sin compilar/);
});

test('harness: veredicto del jugador con números (flota, enterrado, sin pawn, log del GameMode, menú)', () => {
  const pawn = (base_z: number, suelo_z: number | null) => ({pawn: {clase: 'P', pos: [0, 0, 0], base_z, suelo_z, cayendo: false}, player_start: [[0, 0, 0]]});
  assert.deepEqual(veredictoJugador(pawn(2, 0), ''), []);
  assert.deepEqual(veredictoJugador(pawn(80, 0), ''), ['El jugador flota 80 cm sobre el suelo']);
  assert.deepEqual(veredictoJugador(pawn(-60, 0), ''), ['El jugador está 60 cm bajo el suelo']);
  assert.match(veredictoJugador(pawn(0, null), '')[0], /No hay suelo bajo el jugador/);
  assert.match(veredictoJugador({pawn: null, player_start: [[0, 0, 0]]}, '')[0], /ningún pawn poseído/);
  assert.deepEqual(veredictoJugador({pawn: null, player_start: []}, ''), [], 'un mapa de menú sin PlayerStart ni pawn no falla');
  assert.deepEqual(veredictoJugador(null, 'LogGameMode: FindPlayerStart: PATHS NOT DEFINED or NO PLAYERSTART with positive rating'),
    ['El juego no encontró PlayerStart al arrancar']);
});
