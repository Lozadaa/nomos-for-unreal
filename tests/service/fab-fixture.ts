import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const celUid = 'ff0ac933-a621-4541-9efc-24f09c6a39e2';
const touch = (file: string, data: string | Buffer = '') => { mkdirSync(join(file, '..'), {recursive: true}); writeFileSync(file, data); };

/** Réplica mínima de este equipo según docs/fab-pruebas (informe nivel 2): 5 packs Fab, 1 pack del Launcher, 2 Megascans. */
export function fabFixture() {
  const root = mkdtempSync(join(tmpdir(), 'kratos-fab-'));
  const projectsDir = join(root, 'Unreal Projects'), vaultDir = join(root, 'VaultCache');
  const megascansDir = join(root, 'Megascans', 'UAssets'), dataDir = join(root, '.kratos');
  const project = (name: string, packs: string[], launcher: string[] = []) => {
    touch(join(projectsDir, name, `${name}.uproject`), '{"EngineAssociation":"5.8"}');
    for (const pack of packs) touch(join(projectsDir, name, 'Content', 'Fab', pack, 'scene.uasset'), 'x');
    for (const pack of launcher) touch(join(projectsDir, name, 'Content', pack, 'M_Cel.uasset'), 'x');
  };
  project('CrazyPadel', ['Free_Tennisball', 'Nude_Tennis_Racket_🎾', 'Skybox_Fantasy___View_2']);
  project('KratosFabTest', ['Free_Tennisball'], ['AdvancedCelShader', 'StarterContent']);
  project('unknowncall', ['Phone']);
  mkdirSync(join(projectsDir, 'NoEsProyecto', 'Content', 'Fab', 'Fantasma'), {recursive: true});
  const app = join(vaultDir, 'Advanceddffcefa302e4V2');
  touch(join(app, 'manifest'), Buffer.concat([Buffer.from([0x0c, 0xc0, 0xbe, 0x44, 0, 0]),
    Buffer.from(`Advanceddffcefa302e4V2\0https://www.fab.com/listings/${celUid}\0UE_5.4\0AssetPack`, 'latin1')]));
  for (const dir of ['AdvancedCelShader', 'StarterContent', '__ExternalActors__']) touch(join(app, 'data', 'Content', dir, 'a.uasset'), 'x');
  mkdirSync(join(vaultDir, 'FabLibrary'), {recursive: true});
  const listingsDb = join(vaultDir, 'FabLibrary', 'listings_v1.db');
  const db = new DatabaseSync(listingsDb);
  db.exec(`create table local_listing (uid text primary key, user_uid text, category_uid text, entitlement_uid text, title text,
    is_ai_forbidden integer, category_name text, thumbnail text);
    create table download_meta (id integer primary key, listing_uid text, format text, path text, cache_size integer)`);
  db.prepare("insert into local_listing values(?, '', '', '', 'Advanced Cel Shader Lite', 0, '', 'https://media.fab.com/x.jpg')").run(celUid);
  db.prepare("insert into download_meta(listing_uid, format, path, cache_size) values(?, 'unreal-engine', ?, 43787459)").run(celUid, app.replaceAll('\\', '/'));
  db.close();
  touch(join(megascansDir, 'uassetsData.json'), JSON.stringify({assets: [
    {id: '4dlykISk', name: 'Hudson', assetType: 'metahuman-preset'}, {id: 'fmsmkISi', name: 'Emory', assetType: 'metahuman-preset'}]}));
  touch(join(megascansDir, '4dlykISk', '4dlykISk.png'), 'png');
  const unrealPath = engineFixture(join(root, 'UE_5.8'));
  const config = {projectsDir, vaultDir, megascansDir, fabCacheDirs: [join(root, 'FabLibrary')], listingsDb,
    launcherLogPath: join(root, 'EpicGamesLauncher.log'), quarantineProject: join(projectsDir, 'KratosFabTest'), unrealPath};
  touch(join(dataDir, 'config.json'), JSON.stringify(config));
  return {root, dataDir, projectsDir, vaultDir, listingsDb, config, engineRoot: join(root, 'UE_5.8'), close: () => rmSync(root, {recursive: true, force: true})};
}

/** Plantillas del motor con los nombres reales de UE 5.8 (archivos vacíos); devuelve la ruta de UnrealEditor-Cmd.exe (no existe). */
export function engineFixture(engine: string): string {
  const templates = join(engine, 'Templates');
  const chars = join(templates, 'TemplateResources', 'High', 'Characters', 'Content', 'Mannequins');
  for (const file of ['Meshes/SKM_Manny_Simple', 'Meshes/SKM_Quinn_Simple', 'Meshes/SK_Mannequin', 'Anims/Unarmed/ABP_Unarmed',
    'Anims/Unarmed/BS_Idle_Walk_Run', 'Anims/Unarmed/MM_Idle', 'Anims/Unarmed/Attack/AM_Punch', 'Rigs/CR_Mannequin_Body'])
    touch(join(chars, ...file.split('/')) + '.uasset');
  const combat = join(templates, 'TP_ThirdPerson', 'Content', 'Variant_Combat', 'Anims');
  for (const file of ['ABP_Manny_Combat', 'AM_ChargedAttack', 'AM_ComboAttack']) touch(join(combat, file + '.uasset'));
  const ue4 = join(templates, 'TemplateResources', 'High', 'Mannequin', 'Content');
  for (const file of ['Character/Mesh/SK_Mannequin', 'Character/Mesh/UE4_Mannequin_Skeleton', 'Animations/ThirdPersonRun'])
    touch(join(ue4, ...file.split('/')) + '.uasset');
  touch(join(engine, 'Engine', 'Build', 'Build.version'), '{"MajorVersion":5,"MinorVersion":8,"PatchVersion":3}');
  return join(engine, 'Engine', 'Binaries', 'Win64', 'UnrealEditor-Cmd.exe');
}
