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
