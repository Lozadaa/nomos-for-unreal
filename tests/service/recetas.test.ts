import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validarReceta } from '../../service/src/editor/recetas.ts';
import { stopWarm } from '../../service/src/editor/caliente.ts';

// acelera C: recetas de editor (escena, sondeo, bp_datos) con el editor caliente y la caché de FASTVFX
const escena = {receta: 1, plantilla: 'escena', mapa: '/Game/Pruebas/L_Prueba', etiqueta: 'H3.1', nuevo: true, base: true,
  actores: [{nombre: 'Maceta', bp: '/Game/Jugador/BP_Maceta', pos: [10, 0, 0], apoyar: true},
    {nombre: 'Luz', clase: 'PointLight', pos: [0, 0, 300], propiedades: {intensity: 5000, light_color: {color: [1, 0.8, 0.6]}}},
    {nombre: 'Caja', malla: '/Engine/BasicShapes/Cube', pos: [0, 0, 50], escala: [2, 1, 0.5], material: '/Game/M/MI_Madera', carpeta: 'Bloques'}]};

test('acelera: la receta se valida antes de abrir el editor (esquema, rutas, clases y valores)', () => {
  assert.equal(validarReceta(escena).ok, true);
  assert.equal(validarReceta({receta: 1, plantilla: 'sondeo', carpetas: ['/Game/Jugador'], clases: ['Blueprint'], componentes: true}).ok, true);
  assert.equal(validarReceta({receta: 1, plantilla: 'bp_datos', ruta: '/Game/J/BP_Pincel', padre: '/Game/J/BP_GrabBase',
    componentes: [{nombre: 'Malla', clase: 'StaticMeshComponent', malla: '/Engine/BasicShapes/Cylinder', escala: [0.1, 0.1, 0.5]}],
    datos: {ruta: '/Game/J/DA_Pincel', clase: '/Game/J/DA_Base', propiedades: {'Equip Item Position': {transform: {pos: [40, 18, -14]}}, 'Primary Text': '[ G ] Soltar'}}}).ok, true);
  const mal = validarReceta({receta: 1, plantilla: 'escena', mapa: 'C:/x', etiqueta: 'a b', actores: [
    {nombre: 'X', clase: 'PointLight', bp: '/Game/B', pos: [0, 0]}, {nombre: 'Y', clase: 'import os', pos: [0, 0, 0], propiedades: {k: [1, 2]}, raro: 1}]});
  assert.equal(mal.ok, false);
  assert.deepEqual((mal as {errores: string[]}).errores, ['mapa: ruta /Game/... del nivel', 'etiqueta: 1-32 letras, números, _ . -',
    'actores[0]: exactamente uno de clase, bp o malla', 'actores[0].pos: [x, y, z] en cm', 'actores[1]: campo desconocido raro',
    'actores[1].clase: nombre de clase (PointLight) o /Script/Modulo.Clase',
    'actores[1].propiedades.k: número, booleano, texto, {vector}, {rotador}, {color} o {transform}']);
  assert.match((validarReceta({receta: 1, plantilla: 'nada'}) as {errores: string[]}).errores[0], /plantilla desconocida: nada \(hay escena, sondeo, bp_datos, importar_malla, camara_tercera_persona, post_exterior, poblar_pcg\)/);
  assert.match((validarReceta({receta: 1, plantilla: 'sondeo'}) as {errores: string[]}).errores[0], /carpetas, mapa o los dos/);
});

test('harness: importar_malla, camara_tercera_persona, post_exterior y poblar_pcg se validan antes de abrir el editor', () => {
  const ok = (r: object) => assert.equal(validarReceta({receta: 1, ...r}).ok, true, JSON.stringify(r));
  ok({plantilla: 'importar_malla', fuente: 'C:/arte/roca.fbx', destino: '/Game/Arte', modulo: true, alto_cm: [10, 400]});
  ok({plantilla: 'camara_tercera_persona', bp: '/Game/J/BP_Jugador', brazo: 560, offset: [0, 60, 170], fov: 75, lag: 8});
  ok({plantilla: 'post_exterior', mapa: '/Game/J/L', exposicion: 0, sol: {pitch: -28, kelvin: 5200}, niebla: {opacidad_max: 0.7}});
  ok({plantilla: 'poblar_pcg', mapa: '/Game/J/L', etiqueta: 'rocas', pos: [0, 0, 0], extension: [2000, 700, 100],
    paleta: [{malla: '/Engine/BasicShapes/Cone', peso: 2, material: '/Engine/BasicShapes/BasicShapeMaterial'}], escala: [0.7, 2.2], semilla: 7});
  ok({plantilla: 'poblar_pcg', mapa: '/Game/J/L', etiqueta: 'g', pos: [0, 0, 0], extension: [1, 1, 1], grafo: '/PCG/X/PCG_Grafo'});
  const errores = (r: object) => (validarReceta({receta: 1, ...r}) as {errores: string[]}).errores;
  assert.deepEqual(errores({plantilla: 'importar_malla', fuente: 'roca.exe', destino: 'C:/'}),
    ['fuente: ruta absoluta a un .fbx, .glb, .gltf u .obj', 'destino: carpeta /Game/...']);
  assert.deepEqual(errores({plantilla: 'camara_tercera_persona', bp: '/Game/J/BP', fov: 400, sigue_raton: 'si'}),
    ['fov: número entre 30 y 140', 'sigue_raton: true o false']);
  assert.deepEqual(errores({plantilla: 'post_exterior', mapa: '/Game/J/L', sol: {pitch: -200, luna: 1}}),
    ['sol: campo desconocido luna', 'sol.pitch: número entre -90 y 90']);
  assert.deepEqual(errores({plantilla: 'poblar_pcg', mapa: '/Game/J/L', etiqueta: 'r', pos: [0, 0, 0], extension: [0, 1, 1]}),
    ['extension: [x, y, z] semiejes en cm, positivos', 'poblar_pcg: paleta o grafo (uno de los dos)']);
});

test('acelera: nomos ue receta la ejecuta en el editor caliente y, repetida sin cambios, sale de la caché sin abrir el editor', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'nomos-receta-')), uproject = join(dir, 'Juego.uproject');
  writeFileSync(uproject, '{}'); writeFileSync(join(dir, 'escena.json'), JSON.stringify(escena));
  writeFileSync(join(dir, 'mala.json'), JSON.stringify({...escena, etiqueta: ''}));
  const cli = join(import.meta.dirname, '..', '..', 'service', 'src', 'cli.ts');
  const env = {...process.env, NOMOS_UE_FAKE: join(import.meta.dirname, '..', 'fakes', 'unreal-caliente.mjs')};
  const ue = (...args: string[]) => spawnSync(process.execPath, [cli, 'ue', ...args, '--data', join(dir, '.nomos')], {cwd: dir, env, encoding: 'utf8'});
  try {
    const v = ue('receta', 'mala.json', '--validar');
    assert.equal(v.status, 1); assert.match(v.stdout, /etiqueta: 1-32/);
    assert.notEqual(ue('receta', 'mala.json').status, 0, 'no válida: ni se abre el editor');
    const r = ue('receta', 'escena.json');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(r.stdout).ok, true);
    assert.equal(JSON.parse(r.stdout).acierto, undefined);
    // el nivel quedó en disco: la misma receta otra vez es un acierto de caché
    mkdirSync(join(dir, 'Content', 'Pruebas'), {recursive: true}); writeFileSync(join(dir, 'Content', 'Pruebas', 'L_Prueba.umap'), '');
    const otra = ue('receta', 'escena.json');
    assert.deepEqual([otra.status, JSON.parse(otra.stdout).acierto], [0, true]);
    const forzada = ue('receta', 'escena.json', '--forzar');
    assert.equal(JSON.parse(forzada.stdout).acierto, undefined, '--forzar la vuelve a ejecutar');
    assert.match(ue('recetas').stdout, /"bp_datos"/);
  } finally { await stopWarm(uproject); }
});
