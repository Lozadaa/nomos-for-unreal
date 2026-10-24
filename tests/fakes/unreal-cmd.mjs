// Editor sin GUI falso: imita UnrealEditor-Cmd (-ExecutePythonScript o -game con -ExecCmds="py …") escribiendo el informe en KRATOS_REPORT.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

const mode = process.env.KRATOS_FAKE ?? 'ok';
const args = process.argv.slice(2);
const script = args.find(a => a.startsWith('-ExecutePythonScript='))?.slice(21)
  ?? (args.some(a => a.startsWith('-ExecCmds=py ') && a.includes('KRATOS_SCRIPT')) ? process.env.KRATOS_SCRIPT : undefined) ?? '';
console.log(`LogPython: ${script} ${args.join(' ')}`);
if (process.env.KRATOS_ASSETS) console.log(`KRATOS_ASSETS ${process.env.KRATOS_ASSETS}`);
const write = report => writeFileSync(process.env.KRATOS_REPORT, JSON.stringify({args, script, ...report}), 'utf8');
const engine = '5.8.3-58210709+++UE5+Release-5.8';

// PNG RGBA sin filtro: fondo gris y, con UI, una barra roja en la esquina (más del 0,5 % de los píxeles)
function png(path, width, height, ui, shift = 0) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = ui && y < height / 5 && x >= shift % width && x < shift % width + width / 3, o = y * (width * 4 + 1) + 1 + x * 4;
    raw.set(bar ? [220, 40, 40, 255] : [90, 90, 90, 255], o);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const arg = name => args.find(a => a.startsWith(`-${name}=`))?.slice(name.length + 2);
const assets = JSON.parse(process.env.KRATOS_ASSETS || '[]');
if (mode === 'hang') {
  if (process.env.KRATOS_FAKE_PID) writeFileSync(process.env.KRATOS_FAKE_PID, String(process.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'noreport') {
  process.exitCode = 3;
} else if (script.endsWith('kratos_import.py')) {
  write({ok: mode === 'ok', assets: mode === 'ok' ? [`${process.env.KRATOS_DEST}/${process.env.KRATOS_NAME}`] : [], errors: []});
} else if (script.endsWith('kratos_compile_bp.py')) {
  const ok = mode !== 'fail';
  write({ok, engine, compiled: assets.map(p => ({package: p, status: ok ? 'BS_UpToDate' : 'BS_Error'})),
    errors: ok ? [] : assets.map(p => `${p}: el Blueprint no compila (BS_Error)`)});
} else if (script.endsWith('kratos_validate.py')) {
  const ok = !['fail', 'validate_fail'].includes(mode);
  write({ok, engine, errors: [], assets: assets.map(p => ({package: p, result: ok ? 'valid' : 'invalid',
    errors: ok ? [] : [`Dependencia rota: /Game/Falta/T_${p.split('/').at(-1)}`]}))});
} else if (script.endsWith('kratos_character.py')) {
  // personaje: retarget al esqueleto del MetaHuman; «critical» deja la columna y un brazo sin mapear
  const critical = mode === 'critical', mesh = process.env.KRATOS_MESH, anims = JSON.parse(process.env.KRATOS_ANIMATIONS || '[]');
  write({ok: !critical, engine, mesh, map: process.env.KRATOS_MAP, target_mesh: '/Game/MetaHumans/Hudson/Body/m_tal_ovw_body.m_tal_ovw_body',
    skeleton: '/Game/MetaHumans/Common/Female/Medium/NormalWeight/Body/metahuman_base_skel', rest_extent: [23, 58, 92],
    rest_pelvis: {target: 96.9, source: 99.6}, errors: critical ? ['Cadenas principales sin mapear: Spine, LeftArm'] : [],
    clips: anims.map(a => ({source: a, played: critical ? null : `/Game/Kratos/Retarget/m_tal_ovw_body/${a.split('/').at(-1)}_m_tal_ovw_body`, retargeted: true, length: critical ? 0 : 3.667})),
    retarget: {ok: !critical, retargeter: '/Game/Kratos/Retarget/m_tal_ovw_body/RTG_SKM_Manny_Simple_m_tal_ovw_body', notes: [],
      chains: [{target: 'Head', source: 'Head'}], unmapped_target_chains: critical ? ['Spine', 'LeftArm'] : [], unmapped_source_chains: ['LeftFoot'],
      critical_unmapped: critical ? ['Spine', 'LeftArm'] : [], outputs: critical ? [] : anims.map(a => `/Game/Kratos/Retarget/m_tal_ovw_body/${a.split('/').at(-1)}_m_tal_ovw_body`),
      errors: critical ? ['Cadenas principales sin mapear: Spine, LeftArm'] : []}});
} else if (script.endsWith('kratos_anim_capture.py')) {
  // tres instantes y, con KRATOS_VIDEO_DIR, 12 fotogramas (una barra que avanza; «static»: todos iguales)
  const width = Math.max(8, Math.round(Number(arg('ResX') ?? 1280) / 40)), height = Math.max(8, Math.round(Number(arg('ResY') ?? 720) / 40));
  const dir = process.env.KRATOS_SHOT_DIR, prefix = process.env.KRATOS_PREFIX, video = process.env.KRATOS_VIDEO_DIR;
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
} else if (script.endsWith('kratos_metahuman.py')) {
  // MetaHuman por script: «ok» lo crea y ensambla; «noplugin», sin el subsistema; «cloud», el ensamblado pide la nube
  const name = process.env.KRATOS_NAME, ok = mode === 'ok';
  const steps = [{step: 'subsystem', ok: mode !== 'noplugin', detail: mode === 'noplugin' ? 'MetaHumanCharacterEditorSubsystem no existe: el plugin MetaHumanCharacter no está activo en el proyecto' : 'ok'}];
  if (mode !== 'noplugin') steps.push({step: 'create', ok: true, detail: `/Game/Kratos/MetaHumans/${name}`},
    {step: 'build', ok, detail: ok ? 'build_meta_human terminado' : 'El ensamblado necesita iniciar sesión en la nube de MetaHuman'});
  write({ok, engine, name, steps, blueprint: ok ? `/Game/MetaHumans/${name}/BP_${name}` : null,
    needs: ok ? null : mode === 'noplugin' ? 'plugin' : 'cloud', errors: ok ? [] : [steps.at(-1).detail]});
} else if (script.endsWith('kratos_export_fbx.py')) {
  writeFileSync(process.env.KRATOS_FBX, `fbx de ${process.env.KRATOS_CLIP}`);
  write({ok: true, engine, clip: process.env.KRATOS_CLIP, fbx: process.env.KRATOS_FBX, skeleton: '/Game/Characters/Mannequins/Meshes/SK_Mannequin', errors: []});
} else if (script.endsWith('kratos_import_anim.py')) {
  write({ok: true, engine, clip: `${process.env.KRATOS_DEST}/${process.env.KRATOS_NAME}`, length: 1.2, fixed_bones: ['root', 'pelvis'], errors: []});
} else if (script.endsWith('kratos_pie_capture.py')) {
  // resolución reducida (÷40) para que las pruebas sean rápidas; la diferencia relativa se conserva
  const width = Math.max(8, Math.round(Number(arg('ResX') ?? 1280) / 40)), height = Math.max(8, Math.round(Number(arg('ResY') ?? 720) / 40));
  if (mode === 'fail') write({ok: false, engine, map: null, widgets: [], screenshot: null, control: null, errors: ['El juego no arrancó en 120 s']});
  else {
    png(process.env.KRATOS_SHOT, width, height, mode !== 'noui');
    if (process.env.KRATOS_CONTROL) png(process.env.KRATOS_CONTROL, width, height, false);
    const map = args.find(a => a.startsWith('/Game/')) ?? '/Game/Maps/Nivel1';
    write({ok: true, engine, map, widgets: mode === 'noui' ? [] : ['WBP_Vida_C'], screenshot: process.env.KRATOS_SHOT,
      control: process.env.KRATOS_CONTROL || null, errors: []});
  }
} else {
  const root = process.env.KRATOS_ROOT;
  write({ok: mode === 'ok', root, engine: '5.8.3-0+UE5', assets: [{package: `${root}/M_Cel`, class: 'Material', loaded: mode === 'ok'}],
    missing_dependencies: mode === 'ok' ? [] : [{from: `${root}/M_Cel`, to: '/Game/StarterContent/T_Falta'}],
    external_dependencies: [], errors: [], utf8: 'Nude_Tennis_Racket_🎾'});
}
