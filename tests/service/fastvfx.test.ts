import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../../service/src/db.ts';
import { createUnrealCmd } from '../../service/src/adapters/unreal-cmd.ts';
import { acquire } from '../../service/src/leases.ts';
import { ejecutar } from '../../service/src/fastvfx/motor.ts';
import { clasificar, claveAsset, claveEstructura, claveSalida, estaticos, validar, type RecetaValida } from '../../service/src/fastvfx/receta.ts';
import { valorSet } from '../../service/src/fastvfx/cli.ts';

const fake = join(import.meta.dirname, '..', 'fakes', 'unreal-cmd.mjs');
const escudo = {fastvfx: 1, nombre: 'MI_Escudo', plantilla: 'M_Master_VFX', parametros: {Color: [0.1, 0.4, 1], Intensidad: 5, UsarFresnel: true}};
const azul = {fastvfx: 1, nombre: 'FX_Azul', plantilla: 'FX_Energy_Base', parametros: {Color: [0.1, 0.4, 1, 1], Particulas: 120}};
const ok = (r: unknown) => { const v = validar(r); assert.ok(v.ok, JSON.stringify(v)); return (v as {receta: RecetaValida}).receta; };

function entorno(version = '5.8.3') {
  const dir = mkdtempSync(join(tmpdir(), 'fastvfx-')), uproject = join(dir, 'Bench.uproject'), engine = join(dir, 'Engine');
  writeFileSync(uproject, '{}');
  mkdirSync(join(engine, 'Build'), {recursive: true});
  const ue = (v: string) => writeFileSync(join(engine, 'Build', 'Build.version'),
    JSON.stringify({MajorVersion: +v.split('.')[0], MinorVersion: +v.split('.')[1], PatchVersion: +v.split('.')[2]}));
  ue(version);
  const db = openDb(':memory:');
  const opciones = {db, uproject, unreal: createUnrealCmd({bin: process.execPath, baseArgs: [fake], engineDir: engine}),
    probe: () => ({freeGb: 16, editors: 0}), discoLibreGb: () => 50};
  return {dir, db, opciones, ue};
}

test('validar: esquema, tipos, rangos y plantilla; completa con los valores por defecto', () => {
  const r = ok(escudo);
  assert.equal(r.ruta, '/Game/FastVfx/Generado/MI_Escudo');
  assert.deepEqual(r.parametros.Color, [0.1, 0.4, 1, 1]);
  assert.equal(r.parametros.Opacidad, 1);
  assert.equal(r.calidad, 'alta');
  const malo = validar({fastvfx: 1, nombre: '1x', plantilla: 'M_Master_VFX', codigo: 'import os', parametros: {Intensidad: 900, UsarFresnel: 'si', Nada: 1, Color: [1, 2]}});
  assert.equal(malo.ok, false);
  assert.deepEqual((malo as {errores: string[]}).errores, ['Campo desconocido: codigo', 'nombre: letras, números y _, empieza por letra, máx. 64',
    'Intensidad: número entre 0 y 200', 'UsarFresnel: true o false', 'M_Master_VFX no tiene el parámetro Nada', 'Color: [r, g, b] o [r, g, b, a] con valores entre 0 y 50']);
  assert.deepEqual((validar({fastvfx: 1, nombre: 'X', plantilla: 'NS_Nada'}) as {errores: string[]}).errores,
    ['plantilla desconocida: NS_Nada (hay M_Master_VFX, M_Master_Hologram, FX_Energy_Base)']);
  assert.equal(validar({...azul, version_plantilla: 7}).ok, false);
  assert.equal(validar({...azul, parametros: {Particulas: 1.5}}).ok, false);
  assert.equal(validar({...azul, carpeta: '/Game/../Engine'}).ok, false);
});

test('clasificar: estructural, nuevo, acierto, usuario, parámetros y estáticos', () => {
  const ue = '5.8.3', r = ok(azul), previa = {clave: claveSalida(r, ue), asset: claveAsset(r, ue), estructura: claveEstructura(r.plantilla, ue),
    estaticos: JSON.stringify(estaticos(r)), existe: true};
  assert.equal(clasificar(r, ue, false, previa), 'estructural');
  assert.equal(clasificar(r, ue, true, undefined), 'nuevo');
  assert.equal(clasificar(r, ue, true, {...previa, existe: false}), 'nuevo');
  assert.equal(clasificar(r, ue, true, previa), 'acierto');
  assert.equal(clasificar(ok({...azul, parametros: {...azul.parametros, Particulas: 260}}), ue, true, previa), 'usuario');
  assert.equal(clasificar(ok({...azul, parametros: {...azul.parametros, Intensidad: 1.3}}), ue, true, previa), 'parametros');
  assert.equal(clasificar(ok({...azul, calidad: 'baja'}), ue, true, previa), 'estaticos');
  // otra versión de UE u otra versión de plantilla = otra estructura
  assert.notEqual(claveEstructura(r.plantilla, '5.8.4'), claveEstructura(r.plantilla, ue));
  assert.equal(clasificar(r, ue, true, {...previa, estructura: claveEstructura(r.plantilla, '5.8.2')}), 'nuevo');
});

test('variar: --set entiende números, booleanos y colores', () => {
  assert.deepEqual(valorSet('Intensidad=7'), ['Intensidad', 7]);
  assert.deepEqual(valorSet('UsarRuido=false'), ['UsarRuido', false]);
  assert.deepEqual(valorSet('Color=0,0.5,1,1'), ['Color', [0, 0.5, 1, 1]]);
  assert.throws(() => valorSet('Intensidad'), /Param=valor/);
});

test('lote en frío: construye maestro, sistema base, escenario y variantes en una apertura más otra de preview', async () => {
  const {dir, db, opciones} = entorno();
  const l = await ejecutar([escudo, azul], {...opciones, preview: true});
  assert.equal(l.ok, true, JSON.stringify(l.errores));
  assert.equal(l.aperturas, 2);
  assert.deepEqual(l.recetas.map(r => r.clase), ['estructural', 'estructural']);
  // maestro + 4 MIs de rol + sistema base + MI del escudo + 4 MIs de la variante + variante + escenario
  assert.equal(l.acciones, 13);
  for (const f of ['Maestros/M_Master_VFX', 'Sistemas/FX_Energy_Base', 'Generado/MI_Escudo', 'Generado/FX_Azul', 'Generado/FX_Azul_Mats/MI_Onda'])
    assert.ok(existsSync(join(dir, 'Content', 'FastVfx', `${f}.uasset`)), f);
  assert.ok(l.recetas.every(r => r.preview && existsSync(r.preview)));
  assert.deepEqual(l.recetas[1].usuario, {Particulas: 120, Vida: 1, Escala: 1, defecto_en_asset: {Particulas: 80, Vida: 1, Escala: 1}});
  assert.equal(db.prepare("select count(*) n from fastvfx_cache where tipo = 'estructura'").get()!.n, 3);
  assert.equal(db.prepare('select count(*) n from fastvfx_log').get()!.n, 2);
});

test('caché caliente: la misma receta no abre el editor; un cambio de parámetro solo toca la MI', async () => {
  const {db, opciones} = entorno();
  await ejecutar([escudo, azul], {...opciones, preview: true});
  const caliente = await ejecutar([escudo, azul], {...opciones, preview: true});
  assert.equal(caliente.aperturas, 0);
  assert.equal(caliente.aciertos, 2);
  assert.ok(caliente.recetas.every(r => r.preview));
  assert.equal(db.prepare("select aciertos from fastvfx_cache where ruta = '/Game/FastVfx/Generado/MI_Escudo'").get()!.aciertos, 1);
  const retoque = await ejecutar([{...escudo, parametros: {...escudo.parametros, Intensidad: 7}}], opciones);
  assert.deepEqual([retoque.recetas[0].clase, retoque.acciones, retoque.aperturas], ['parametros', 1, 1]);
  // solo parámetros de usuario: el asset no cambia y no hay nada que generar
  const usuario = await ejecutar([{...azul, parametros: {...azul.parametros, Particulas: 260}}], opciones);
  assert.deepEqual([usuario.recetas[0].clase, usuario.acciones, usuario.aperturas], ['usuario', 0, 0]);
  const niagara = await ejecutar([{...azul, parametros: {...azul.parametros, Intensidad: 1.3}}], opciones);
  assert.deepEqual([niagara.recetas[0].clase, niagara.acciones], ['parametros', 4]);  // las 4 MIs, sin volver a copiar el sistema
});

test('otra versión de UE: todo es estructural y el sistema base se borra del disco antes de rehacerlo', async () => {
  const {opciones, ue} = entorno();
  await ejecutar([azul], opciones);
  ue('5.8.4');
  const l = await ejecutar([azul], opciones);
  assert.equal(l.recetas[0].clase, 'estructural');
  assert.ok(l.ok, JSON.stringify(l.errores));
});

test('no abre Unreal sin disco, con otro editor abierto o con la reserva del editor ocupada', async () => {
  const {db, opciones} = entorno();
  await assert.rejects(ejecutar([escudo], {...opciones, discoLibreGb: () => 2.4}), /2\.4 GB libres/);
  await assert.rejects(ejecutar([escudo], {...opciones, probe: () => ({freeGb: 16, editors: 1})}), /un editor a la vez/);
  acquire(db, 'run-otro', 'tarea-otra', ['editor/' + opciones.uproject.split(/[\\/]/).at(-2)]);
  await assert.rejects(ejecutar([escudo], opciones), /ocupado por la tarea tarea-otra/);
  await assert.rejects(ejecutar([{...escudo, parametros: {Intensidad: -1}}], opciones), /Recetas no válidas/);
});

test('una acción que falla deja la receta en error y fuera de la caché', async () => {
  const {db, opciones} = entorno();
  process.env.NOMOS_FAKE = 'fastvfx_fail';
  try {
    const l = await ejecutar([escudo], opciones);
    assert.equal(l.ok, false);
    assert.equal(l.recetas[0].ok, false);
    assert.equal(db.prepare("select count(*) n from fastvfx_cache where tipo = 'salida'").get()!.n, 0);
    assert.equal(db.prepare('select ok from fastvfx_log').get()!.ok, 0);
  } finally { delete process.env.NOMOS_FAKE; }
});
