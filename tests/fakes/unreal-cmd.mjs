// Editor sin GUI falso: imita UnrealEditor-Cmd (-ExecutePythonScript o -game con -ExecCmds="py …") escribiendo el informe en NOMOS_REPORT.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const mode = process.env.NOMOS_FAKE ?? 'ok';
const args = process.argv.slice(2);
const script = args.find(a => a.startsWith('-ExecutePythonScript='))?.slice(21)
  ?? (args.some(a => a.startsWith('-ExecCmds=py ') && a.includes('NOMOS_SCRIPT')) ? process.env.NOMOS_SCRIPT : undefined) ?? '';
console.log(`LogPython: ${script} ${args.join(' ')}`);
if (process.env.NOMOS_ASSETS) console.log(`NOMOS_ASSETS ${process.env.NOMOS_ASSETS}`);
const write = report => writeFileSync(process.env.NOMOS_REPORT, JSON.stringify({args, script, ...report}), 'utf8');
const engine = '5.8.3-58210709+++UE5+Release-5.8';

// PNG RGBA sin filtro: fondo gris y, con UI, una barra roja en la esquina (más del 0,5 % de los píxeles)
function png(path, width, height, ui, shift = 0, fondo = [90, 90, 90, 255]) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = ui && y < height / 5 && x >= shift % width && x < shift % width + width / 3, o = y * (width * 4 + 1) + 1 + x * 4;
    raw.set(bar ? [220, 40, 40, 255] : fondo, o);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const arg = name => args.find(a => a.startsWith(`-${name}=`))?.slice(name.length + 2);
const assets = JSON.parse(process.env.NOMOS_ASSETS || '[]');
if (mode === 'hang') {
  if (process.env.NOMOS_FAKE_PID) writeFileSync(process.env.NOMOS_FAKE_PID, String(process.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'noreport') {
  process.exitCode = 3;
} else if (script.endsWith('nomos_fastvfx.py')) {
  // FASTVFX: cada acción del trabajo «sale bien» y deja su .uasset (o .umap) en Content; NOMOS_FAKE=fastvfx_fail hace fallar las MI.
  // Como en Unreal, un sistema Niagara que ya existe no se rehace (hay que borrarlo antes con la acción «borrar»)
  const job = JSON.parse(readFileSync(process.env.NOMOS_FASTVFX_JOB, 'utf8'));
  const content = join(dirname(args.find(a => a.endsWith('.uproject'))), 'Content');
  const acciones = job.acciones.map(a => {
    const file = join(content, ...a.ruta.replace(/^\/Game\//, '').split('/')) + (a.tipo === 'escenario' ? '.umap' : '.uasset');
    const ok = !(mode === 'fastvfx_fail' && a.tipo === 'mi') && !(a.tipo === 'niagara' && existsSync(file));
    if (a.tipo === 'borrar') rmSync(file, {force: true});
    else if (ok) { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, 'fake'); }
    return {tipo: a.tipo, ruta: a.ruta, receta: a.receta ?? null, ok, ms_total: 10, ms_construccion: 5, ms_guardado: 2,
      ...(a.tipo === 'maestro' || a.tipo === 'mi' ? {ms_compilacion: 3, estadisticas: {instrucciones_vs: 297, instrucciones_ps: 132, samplers: 2, muestras_textura_ps: 1}} : {}),
      ...(a.tipo === 'niagara' || a.tipo === 'variante' ? {parametros_usuario: {Particulas: 80, Vida: 1, Escala: 1}} : {}),
      ...(ok ? {} : {error: a.tipo === 'niagara' ? `${a.ruta} ya existe` : 'Parámetros que el padre no tiene'})};
  });
  write({engine, generador: 1, acciones, errores: acciones.filter(a => !a.ok).map(a => a.ruta), ok: acciones.every(a => a.ok)});
} else if (script.endsWith('nomos_fastvfx_preview.py') || script.endsWith('nomos_fastvfx_captura.py')) {
  const job = JSON.parse(readFileSync(process.env.NOMOS_FASTVFX_PREVIEW, 'utf8'));
  for (const i of job.items) { mkdirSync(dirname(i.png), {recursive: true}); png(i.png, 64, 36, mode !== 'fastvfx_vacia'); }
  write({engine, items: job.items.map(i => ({asset: i.asset, png: i.png, frame: i.frame})), errores: [], ok: true});
} else if (script.endsWith('nomos_import.py')) {
  write({ok: mode === 'ok', assets: mode === 'ok' ? [`${process.env.NOMOS_DEST}/${process.env.NOMOS_NAME}`] : [], errors: []});
} else if (script.endsWith('nomos_compile_bp.py')) {
  const ok = mode !== 'fail';
  write({ok, engine, compiled: assets.map(p => ({package: p, status: ok ? 'BS_UpToDate' : 'BS_Error'})),
    errors: ok ? [] : assets.map(p => `${p}: el Blueprint no compila (BS_Error)`)});
} else if (script.endsWith('nomos_validate.py')) {
  const ok = !['fail', 'validate_fail'].includes(mode);
  write({ok, engine, errors: [], assets: assets.map(p => ({package: p, result: ok ? 'valid' : 'invalid',
    errors: ok ? [] : [`Dependencia rota: /Game/Falta/T_${p.split('/').at(-1)}`]}))});
} else if (script.endsWith('nomos_character.py')) {
  // personaje: retarget al esqueleto del MetaHuman; «critical» deja la columna y un brazo sin mapear
  const critical = mode === 'critical', mesh = process.env.NOMOS_MESH, anims = JSON.parse(process.env.NOMOS_ANIMATIONS || '[]');
  write({ok: !critical, engine, mesh, map: process.env.NOMOS_MAP, target_mesh: '/Game/MetaHumans/Hudson/Body/m_tal_ovw_body.m_tal_ovw_body',
    skeleton: '/Game/MetaHumans/Common/Female/Medium/NormalWeight/Body/metahuman_base_skel', rest_extent: [23, 58, 92],
    rest_pelvis: {target: 96.9, source: 99.6}, errors: critical ? ['Cadenas principales sin mapear: Spine, LeftArm'] : [],
    clips: anims.map(a => ({source: a, played: critical ? null : `/Game/Kratos/Retarget/m_tal_ovw_body/${a.split('/').at(-1)}_m_tal_ovw_body`, retargeted: true, length: critical ? 0 : 3.667})),
    retarget: {ok: !critical, retargeter: '/Game/Kratos/Retarget/m_tal_ovw_body/RTG_SKM_Manny_Simple_m_tal_ovw_body', notes: [],
      chains: [{target: 'Head', source: 'Head'}], unmapped_target_chains: critical ? ['Spine', 'LeftArm'] : [], unmapped_source_chains: ['LeftFoot'],
      critical_unmapped: critical ? ['Spine', 'LeftArm'] : [], outputs: critical ? [] : anims.map(a => `/Game/Kratos/Retarget/m_tal_ovw_body/${a.split('/').at(-1)}_m_tal_ovw_body`),
      errors: critical ? ['Cadenas principales sin mapear: Spine, LeftArm'] : []}});
} else if (script.endsWith('nomos_anim_capture.py')) {
  // tres instantes y, con NOMOS_VIDEO_DIR, 12 fotogramas (una barra que avanza; «static»: todos iguales)
  const width = Math.max(8, Math.round(Number(arg('ResX') ?? 1280) / 40)), height = Math.max(8, Math.round(Number(arg('ResY') ?? 720) / 40));
  const dir = process.env.NOMOS_SHOT_DIR, prefix = process.env.NOMOS_PREFIX, video = process.env.NOMOS_VIDEO_DIR;
  const frames = [0, 0.5, 0.9].map(fraction => {
    const shot = join(dir, `${prefix}-${Math.round(fraction * 100)}.png`);
    png(shot, width, height, true);
    const bad = mode === 'deform' && fraction === 0.5, stretched = mode === 'stretch';
    return {fraction, time: fraction * 3.667, extent: [24, 60, 95], ratio: bad ? 3.4 : 1.06, zero_scale_bones: [], pose_diff: bad ? 0.31 : 0.05,
      worst_bone: 'head', stretch: {pelvis_cm: stretched ? 0 : 83, errors: stretched ? ['malla estirada hacia la raíz: pelvis a 0.0 cm'] : []},
      deformation_ok: !bad && !stretched, screenshot: shot};
  });
  if (video) {
    mkdirSync(join(video, 'lateral'), {recursive: true});
    for (let k = 0; k < 12; k++) for (const dir of [video, join(video, 'lateral')])
      png(join(dir, `frame_${String(k).padStart(4, '0')}.png`), width, height, true, mode === 'static' ? 0 : k);
  }
  const followers = ['Face', 'Torso', 'Legs'].map(name => ({name, leader: name !== 'Face', anim: name === 'Face', follows: !(mode === 'clothes' && name === 'Torso')}));
  write({ok: !['deform', 'stretch', 'clothes'].includes(mode), engine, followers,
    ...(mode === 'clothes' ? {errors: ['prendas sin seguir al cuerpo: Torso']} : {}), map: args.find(a => a.startsWith('/Game/')) ?? null, clip: '/Game/Kratos/Retarget/x', length: 3.667,
    frames, ...(mode === 'clothes' ? {} : {errors: []}), ...(video ? {video_frames: 12, video_seconds: 3.67} : {})});
} else if (script.endsWith('nomos_metahuman.py')) {
  // MetaHuman por script: «ok» lo crea y ensambla; «noplugin», sin el subsistema; «cloud», el ensamblado pide la nube
  const name = process.env.NOMOS_NAME, ok = mode === 'ok';
  const steps = [{step: 'subsystem', ok: mode !== 'noplugin', detail: mode === 'noplugin' ? 'MetaHumanCharacterEditorSubsystem no existe: el plugin MetaHumanCharacter no está activo en el proyecto' : 'ok'}];
  if (mode !== 'noplugin') steps.push({step: 'create', ok: true, detail: `/Game/Kratos/MetaHumans/${name}`},
    {step: 'build', ok, detail: ok ? 'build_meta_human terminado' : 'El ensamblado necesita iniciar sesión en la nube de MetaHuman'});
  write({ok, engine, name, steps, blueprint: ok ? `/Game/MetaHumans/${name}/BP_${name}` : null,
    needs: ok ? null : mode === 'noplugin' ? 'plugin' : 'cloud', errors: ok ? [] : [steps.at(-1).detail]});
} else if (script.endsWith('nomos_export_fbx.py')) {
  writeFileSync(process.env.NOMOS_FBX, `fbx de ${process.env.NOMOS_CLIP}`);
  write({ok: true, engine, clip: process.env.NOMOS_CLIP, fbx: process.env.NOMOS_FBX, skeleton: '/Game/Characters/Mannequins/Meshes/SK_Mannequin', errors: []});
} else if (script.endsWith('nomos_import_anim.py')) {
  write({ok: true, engine, clip: `${process.env.NOMOS_DEST}/${process.env.NOMOS_NAME}`, length: 1.2, fixed_bones: ['root', 'pelvis'], errors: []});
} else if (script.endsWith('nomos_demo.py')) {
  // jam vista: tres capturas del modo demo; «sin_demo» imita un juego que no escribe la marca del modo demo
  if (mode !== 'sin_demo') console.log('LogTemp: NOMOS_DEMO activo');
  const dir = process.env.NOMOS_DEMO_DIR, capturas = ['inicio', 'mitad', 'final'].map(n => join(dir, `${n}.png`));
  mkdirSync(dir, {recursive: true});
  capturas.forEach((c, i) => png(c, 32, 18, true, i * 5));
  write({ok: true, engine, capturas, errors: []});
} else if (script.endsWith('nomos_pie_capture.py')) {
  // resolución reducida (÷40) para que las pruebas sean rápidas; la diferencia relativa se conserva
  const width = Math.max(8, Math.round(Number(arg('ResX') ?? 1280) / 40)), height = Math.max(8, Math.round(Number(arg('ResY') ?? 720) / 40));
  if (mode === 'fail') write({ok: false, engine, map: null, widgets: [], screenshot: null, control: null, errors: ['El juego no arrancó en 120 s']});
  else {
    // «magenta» imita shaders sin compilar siempre; «magenta_once», solo la primera vez (marca junto a la captura)
    const marca = `${process.env.NOMOS_SHOT}.magenta`, rosa = mode === 'magenta' || (mode === 'magenta_once' && !existsSync(marca));
    if (mode === 'magenta_once') writeFileSync(marca, '1');
    png(process.env.NOMOS_SHOT, width, height, mode !== 'noui', 0, rosa ? [255, 0, 255, 255] : undefined);
    if (process.env.NOMOS_CONTROL) png(process.env.NOMOS_CONTROL, width, height, false);
    const map = args.find(a => a.startsWith('/Game/')) ?? '/Game/Maps/Nivel1';
    // hito 10: las vistas del rig; «views_slow» imita un editor que pasa de 90 s y solo deja la primera
    const requested = JSON.parse(process.env.NOMOS_VIEWS || '[]'), done = mode === 'views_slow' ? requested.slice(0, 1) : requested;
    for (const v of done) png(v.path, width, height, false, v.view.length);
    // estados de la UI en la misma sesión; NOMOS_FAKE_ESTADO_SIN_UI=nombre deja ese sin UI
    const estados = JSON.parse(process.env.NOMOS_ESTADOS || '[]');
    for (const e of estados) { png(e.shot, width, height, process.env.NOMOS_FAKE_ESTADO_SIN_UI !== e.nombre, 3); png(e.control, width, height, false); }
    write({ok: true, engine, map, widgets: mode === 'noui' ? [] : ['WBP_Vida_C'], screenshot: process.env.NOMOS_SHOT,
      control: process.env.NOMOS_CONTROL || null, errors: [],
      estados: Object.fromEntries(estados.map(e => [e.nombre, {widgets: ['WBP_Vida_C'], screenshot: e.shot, control: e.control, comandos: e.comandos}])),
      jugador: mode === 'cayendo' ? {pawn: {clase: 'BP_Jugador_C', pos: [0, 0, -800], base_z: -890, suelo_z: null, cayendo: true}, player_start: [[0, 0, 100]]}
        : {pawn: {clase: 'BP_Jugador_C', pos: [0, 0, 92], base_z: 2, suelo_z: 0, cayendo: false}, player_start: [[0, 0, 100]]}, views: Object.fromEntries(done.map(v => [v.view, v.path])),
      ...(mode === 'views_slow' ? {views_note: `Vistas extra cortadas a los 90 s: ${done.length} de ${requested.length}`} : {})});
  }
} else {
  const root = process.env.NOMOS_ROOT;
  write({ok: mode === 'ok', root, engine: '5.8.3-0+UE5', assets: [{package: `${root}/M_Cel`, class: 'Material', loaded: mode === 'ok'}],
    missing_dependencies: mode === 'ok' ? [] : [{from: `${root}/M_Cel`, to: '/Game/StarterContent/T_Falta'}],
    external_dependencies: [], errors: [], utf8: 'Nude_Tennis_Racket_🎾'});
}
