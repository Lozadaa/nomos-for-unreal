import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acabadoCheck, touchesVisible } from '../../service/src/checks/acabado.ts';

// Canicas-6 (2026-11-10): HUD con la fuente del motor y texturas por ruta sin cocinar; en el editor se veía bien
function juego(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'acabado-'));
  for (const [ruta, texto] of Object.entries(archivos)) { mkdirSync(join(dir, ruta, '..'), {recursive: true}); writeFileSync(join(dir, ruta), texto); }
  return dir;
}
const correr = (worktree: string, files: string[], scope: string[] = []) => acabadoCheck({} as never,
  {task: {scope} as never, run: {} as never, implementer: {} as never, project: {} as never, files, worktree, dir: mkdtempSync(join(tmpdir(), 'acabado-log-'))}, {});

test('acabado: el diff con la fuente del motor y una ruta sin cocinar falla con la línea exacta', async () => {
  const dir = juego({'Source/J/Hud.cpp': 'UFont* F = GEngine->GetLargeFont();\nLoadObject<UMaterial>(nullptr, TEXT("/Game/Metras/M_Tierra.M_Tierra"));\n'});
  const out = await correr(dir, ['Source/J/Hud.cpp']);
  assert.equal(out.result, 'failed');
  assert.match(out.summary[0], /2 fallos/);
  assert.ok(out.summary.some(l => /Hud\.cpp:1: fuente del motor/.test(l)), out.summary.join('\n'));
  assert.ok(out.summary.some(l => /\/Game\/Metras se carga por ruta/.test(l)), out.summary.join('\n'));
});

test('acabado: solo cuenta el diff; sin empaquetar no exige pantalla de carga (la otra pista no bloquea)', async () => {
  const dir = juego({'Source/J/Reglas.cpp': 'int Turno = 0;\n', 'Source/J/Otra.cpp': 'DrawRect(C, 0, 0, 1, 1);\n'});
  const out = await correr(dir, ['Source/J/Reglas.cpp']);
  assert.equal(out.result, 'passed', out.summary.join('\n'));
});

test('acabado: la tarea que empaqueta exige la pantalla de carga', async () => {
  const dir = juego({'Source/J/Reglas.cpp': 'int Turno = 0;\n', 'Config/DefaultGame.ini': '[/Script/UnrealEd.ProjectPackagingSettings]\n'});
  const out = await correr(dir, ['Source/J/Reglas.cpp', 'Config/DefaultGame.ini']);
  assert.equal(out.result, 'failed');
  assert.ok(out.summary.some(l => /pantalla de carga/.test(l)), out.summary.join('\n'));
});

test('touchesVisible: código, assets, mapas y config de empaquetado sí; docs y scripts no', () => {
  assert.equal(touchesVisible(['Source/J/A.cpp']), true);
  assert.equal(touchesVisible(['Content/UI/WBP_Hud.uasset']), true);
  assert.equal(touchesVisible(['Config\\DefaultGame.ini']), true);
  assert.equal(touchesVisible(['docs/hecho.md', 'Scripts/x.py']), false);
});

test('lote: acabado va primero, también en modo rápido, y un fallo devuelve la tarea con la lista', async () => {
  const {checksFixture} = await import('./checks-fixture.ts');
  const f = checksFixture({files: ['Source/Juego/Hud.cpp'], deps: {acabado: true}});
  try {
    writeFileSync(join(f.dataDir, 'config.json'), JSON.stringify({rapido: true}));
    writeFileSync(join(f.projectDir, 'Source', 'Juego', 'Hud.cpp'), 'DrawRect(Color, 0, 0, 300, 70);\n');
    const result = await f.run();
    assert.equal(result.passed, false);
    const filas = f.db.prepare('select check_id, result from test_runs order by rowid').all() as {check_id: string; result: string}[];
    assert.deepEqual(filas.map(r => [r.check_id, r.result]), [['acabado', 'failed'], ['cpp', 'pending']], 'acabado antes que compilar; su fallo para el lote');
    assert.match(f.events('test.failed')[0].summary, /Hud\.cpp:1: HUD o indicador dibujado con Canvas/);
  } finally { f.close(); }
});
