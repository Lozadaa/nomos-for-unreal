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
    // hito 10: la del jugador, las tres del rig y la hoja de contactos
    assert.deepEqual(labels, ['Mapa · registro', 'Captura de control 1280×720', 'Vista 3/4 izquierda 1280×720', 'Vista 3/4 derecha 1280×720',
      'Vista picado 1280×720', 'Mapa · hoja de contactos']);
  } finally { f.close(); }
});
