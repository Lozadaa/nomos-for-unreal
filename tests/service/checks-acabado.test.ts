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

// 2026-11-11: Trompo con Nomos vistió protagonista, rivales y suelo con /Engine/BasicShapes; el agente solo los modeló
test('acabado: forma básica sin motivo falla; con `forma-basica: <motivo>` pasa y cuenta; nunca para protagonista, amenaza u objetivo', async () => {
  const dir = juego({'Source/J/Aspecto.cpp': [
    'Malla->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube")));',
    'Muro->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"))); // forma-basica: colisión invisible del borde',
    'if (Rol == TEXT("Protagonista")) M = TEXT("/Engine/BasicShapes/Sphere.Sphere"); // forma-basica: provisional',
    'Plano = TEXT("/Engine/EngineMeshes/Sphere.Sphere"); // acabado: ok',
  ].join('\n') + '\n', 'Config/DefaultGame.ini': '+DirectoriesToAlwaysCook=(Path="/Engine/BasicShapes")\n'});
  const out = await correr(dir, ['Source/J/Aspecto.cpp']);
  assert.equal(out.result, 'failed');
  const fallos = out.summary.filter(l => /forma básica/.test(l));
  assert.deepEqual(fallos.map(l => l.split(':')[1]), ['1', '3', '4'], out.summary.join('\n'));
  assert.ok(fallos.some(l => /Aspecto\.cpp:3: .*nunca para Protagonista/.test(l)), out.summary.join('\n'));
});

test('acabado: el marcador de la semilla falla hasta que el juego ponga su aspecto', async () => {
  const dir = juego({'Source/J/Aspecto.cpp': '// NOMOS_SIN_ASPECTO: sustituye este marcador\nint x;\n'});
  const out = await correr(dir, ['Source/J/Aspecto.cpp']);
  assert.ok(out.summary.some(l => /Aspecto\.cpp:1: .*marcador de la semilla/.test(l)), out.summary.join('\n'));
});

test('acabado: la tarea que empaqueta exige el plan de arte en docs/direccion.md, sin filas vacías', async () => {
  const base = {'Source/J/Carga.cpp': 'StreamAllResources(5.f);\n', 'Config/DefaultGame.ini': '+MapsToCook=(FilePath="/Game/M")\n'};
  const sin = await correr(juego(base), ['Source/J/Carga.cpp', 'Config/DefaultGame.ini']);
  assert.ok(sin.summary.some(l => /Plan de arte/.test(l)), sin.summary.join('\n'));
  const filas = ['Protagonista', 'Amenazas', 'Objetivos', 'Suelo', 'Fondo', 'Luz', 'Cámara', 'Efectos', 'Sonido'];
  const tabla = (vacia: string) => `## Plan de arte\n| Qué | Herramienta | Por qué | Detalle |\n|---|---|---|---|\n`
    + filas.map(f => f === vacia ? `| ${f} | | | |` : `| ${f} | malla procedural | se ve de cerca | alto |`).join('\n') + '\n';
  const hueca = await correr(juego({...base, 'docs/direccion.md': tabla('Fondo')}), ['Source/J/Carga.cpp', 'Config/DefaultGame.ini']);
  assert.ok(hueca.summary.some(l => /Plan de arte: la fila «Fondo» está vacía/.test(l)), hueca.summary.join('\n'));
  const llena = await correr(juego({...base, 'docs/direccion.md': tabla('')}), ['Source/J/Carga.cpp', 'Config/DefaultGame.ini']);
  assert.ok(!llena.summary.some(l => /Plan de arte/.test(l)), llena.summary.join('\n'));
});
