import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gamePackage, selectChecks } from '../../service/src/checks/select.ts';

test('selectChecks por tipo de cambio, en el orden de ejecución', () => {
  assert.deepEqual(selectChecks(['Source/Juego/Vida.cpp', 'Source/Juego/Vida.h']), ['cpp']);
  assert.deepEqual(selectChecks(['Source/Juego.Build.cs']), ['cpp']);
  assert.deepEqual(selectChecks(['Content/Blueprints/BP_Puerta.uasset']), ['blueprint']);
  assert.deepEqual(selectChecks(['Content/Juego/BP_Jugador.uasset']), ['blueprint']);
  assert.deepEqual(selectChecks(['Content/UI/WBP_Vida.uasset']), ['umg']);
  assert.deepEqual(selectChecks(['Content/Juego/WBP_Menu.uasset']), ['umg']);
  assert.deepEqual(selectChecks(['Content/Props/SM_Caja.uasset', 'Content/Props/T_Caja_D.uasset', 'Content/Props/MI_Caja.uasset']), ['asset']);
  assert.deepEqual(selectChecks(['Content/Maps/Nivel1.umap']), ['map']);
  assert.deepEqual(selectChecks(['Config/DefaultGame.ini']), ['build']);
  assert.deepEqual(selectChecks(['docs/x.md'], ['build/empaquetar']), ['build'], 'scope con build exige empaquetar');
  assert.deepEqual(selectChecks(['Config\\DefaultEngine.ini', 'Content\\Maps\\Nivel1.umap', 'Content\\UI\\WBP_Vida.uasset', 'Source\\Juego\\A.cpp']),
    ['cpp', 'map', 'umg', 'build'], 'barras de Windows y orden cpp → blueprint → asset → map → umg → build');
});

test('el diff de la aceptación del hito 3 (scripts Node y docs) no toca Unreal', () => {
  assert.deepEqual(selectChecks(['Scripts/kratos-hito3/health.mjs', 'Scripts/kratos-hito3/health.test.mjs', 'README.md']), []);
  assert.deepEqual(selectChecks(['Config/DefaultInput.ini.bak', 'Content/notas.txt', 'Plugins/X/Source/X.h.orig']), []);
});

test('gamePackage convierte rutas de Content en paquetes /Game', () => {
  assert.equal(gamePackage('Content/UI/WBP_Vida.uasset'), '/Game/UI/WBP_Vida');
  assert.equal(gamePackage('Content\\Maps\\Nivel1.umap'), '/Game/Maps/Nivel1');
  assert.equal(gamePackage('Source/A.cpp'), null);
});

test('hito 5b: personajes y animaciones exigen animation, entre asset y map', () => {
  for (const file of ['Content/Characters/Mannequins/Meshes/SKM_Manny_Simple.uasset', 'Content/Variant_Combat/Anims/AM_ComboAttack.uasset',
    'Content/Anims/A_Salto.uasset', 'Content/Juego/ABP_Heroe.uasset', 'Content/Juego/BS_Andar.uasset', 'Content/Juego/MM_Idle.uasset',
    'Content/Rigs/IK_Heroe.uasset', 'Content/Rigs/RTG_Heroe.uasset', 'Content/Juego/SK_Heroe.uasset', 'Content/Animations/Golpe.uasset',
    'kratos-personaje.json'])
    assert.deepEqual(selectChecks([file]), ['animation'], file);
  assert.deepEqual(selectChecks(['Content/Props/SM_Caja.uasset', 'Content/Maps/Nivel1.umap', 'Content/Anims/AM_Golpe.uasset', 'Source/A.cpp']),
    ['cpp', 'asset', 'animation', 'map']);
  assert.deepEqual(selectChecks(['Content/Characters/Heroe/T_Piel.uasset']), ['asset', 'animation'], 'una textura del personaje: las dos');
});
