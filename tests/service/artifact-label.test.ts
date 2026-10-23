import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listArtifacts } from '../../service/src/repo/artifacts.ts';
import { checkArtifactLabel, checkReportLabel } from '../../service/src/artifact-label.ts';
import { checksFixture } from './checks-fixture.ts';

test('nombres de artefactos derivados de la comprobación, el tipo y la resolución', () => {
  assert.equal(checkReportLabel('cpp'), 'Compilación C++ · registro');
  assert.equal(checkReportLabel('build'), 'Empaquetado · registro');
  assert.equal(checkArtifactLabel('build', 'build', 'C:/Builds/Windows/KratosFabTest.exe'), 'Empaquetado · KratosFabTest.exe');
  assert.equal(checkArtifactLabel('umg', 'screenshot', 'x/HighresScreenshot00000.png', {resolution: '1280x720'}), 'Captura UMG 1280×720');
  assert.equal(checkArtifactLabel('map', 'screenshot', 'x/shot.png', {resolution: '1280x720'}), 'Captura de control 1280×720');
});

test('checks.run guarda provenance.label en el registro y en la captura del mapa', async () => {
  const f = checksFixture({files: ['Content/Maps/Nivel1.umap']});
  try {
    process.env.KRATOS_FAKE = 'ok';
    await f.run();
    const labels = listArtifacts(f.db, {taskId: f.task.id}).map(a => (a.provenance as {label?: string}).label);
    assert.deepEqual(labels, ['Mapa · registro', 'Captura de control 1280×720']);
  } finally { f.close(); }
});
