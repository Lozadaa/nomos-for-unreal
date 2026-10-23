// Editor sin GUI falso: imita UnrealEditor-Cmd (-ExecutePythonScript o -game con -ExecCmds="py …") escribiendo el informe en KRATOS_REPORT.
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const mode = process.env.KRATOS_FAKE ?? 'ok';
const args = process.argv.slice(2);
const script = args.find(a => a.startsWith('-ExecutePythonScript='))?.slice(21) ?? args.find(a => a.startsWith('-ExecCmds=py '))?.slice(13) ?? '';
console.log(`LogPython: ${script} ${args.join(' ')}`);
const write = report => writeFileSync(process.env.KRATOS_REPORT, JSON.stringify({args, script, ...report}), 'utf8');
const engine = '5.8.3-58210709+++UE5+Release-5.8';

// PNG RGBA sin filtro: fondo gris y, con UI, una barra roja en la esquina (más del 0,5 % de los píxeles)
function png(path, width, height, ui) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const bar = ui && y < height / 5 && x < width / 3, o = y * (width * 4 + 1) + 1 + x * 4;
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
