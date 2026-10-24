import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blueprintCheck } from '../../service/src/checks/blueprint.ts';

const run = (reportJson: object) => blueprintCheck({} as any, {project: {uproject: 'J.uproject'}, files: ['Content/Characters/Mannequins/Anims/MM_Attack_01.uasset']} as any,
  {unreal: () => ({runPython: async () => ({log: '', exitCode: 0, reportJson})}) as any});

test('hito 5b: una referencia blanda que falta (plantillas de Epic) avisa sin fallar; una dura falla', async () => {
  const soft = await run({ok: true, engine: '5.8.3', compiled: [], errors: [],
    warnings: ['/Game/Characters/Mannequins/Anims/MM_Attack_01: referencia blanda inexistente /Game/Characters/Mannequins/Meshes/SKM_Manny (no impide cargar)']});
  assert.equal(soft.result, 'passed');
  assert.match(soft.summary.join('\n'), /referencia blanda inexistente .*SKM_Manny/);
  const hard = await run({ok: false, engine: '5.8.3', compiled: [], errors: ['/Game/A: referencia inexistente /Game/B'], warnings: []});
  assert.deepEqual([hard.result, hard.summary], ['failed', ['/Game/A: referencia inexistente /Game/B']]);
});

test('hito 5b: asset acepta un plano (grosor 0) y las tarjetas de pelo de un Groom sin material propio; falla lo degenerado y el slot vacío normal', async () => {
  const {assetCheck} = await import('../../service/src/checks/asset.ts');
  const mesh = (name: string, extra: object) => ({package: `/Game/MetaHumans/${name}`, loaded: true, materials: ['/Game/M'], bounds_cm: [8.5, 0, 2.7], ...extra});
  const run = (assets: object[]) => assetCheck({} as any, {project: {uproject: 'J.uproject'}, files: ['Content/MetaHumans/A.uasset']} as any,
    {unreal: () => ({verifyPack: async () => ({ok: true, engine: '5.8.3', errors: [], missing_dependencies: [], assets})}) as any});
  const ok = await run([mesh('Common/Controls/faceboard_followGrp', {}), mesh('Hudson/Hair_Cards_LOD1', {materials: [null], groom_cards: true, bounds_cm: [20, 20, 10]})]);
  assert.equal(ok.result, 'passed', ok.summary.join('\n'));
  const bad = await run([mesh('Punto', {bounds_cm: [0, 0, 0]}), mesh('Roca', {materials: [null], bounds_cm: [50, 50, 50]})]);
  assert.deepEqual(bad.summary, ['/Game/MetaHumans/Punto: escala fuera de rango (0 × 0 × 0 cm)', '/Game/MetaHumans/Roca: material vacío']);
});

test('hito 5b: el escenario de animación de Nomos no es el mapa de juego de map ni de build', async () => {
  const {gameMap} = await import('../../service/src/checks/map.ts');
  assert.equal(gameMap(['Content/Kratos/Maps/AnimTest.umap', 'nomos-personaje.json']), undefined);
  assert.equal(gameMap(['Content/Kratos/Maps/AnimTest.umap', 'Content/Mapas/Arena.umap']), '/Game/Mapas/Arena');
});
