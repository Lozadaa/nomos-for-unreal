// Editor sin GUI falso: imita UnrealEditor-Cmd -ExecutePythonScript escribiendo el informe en KRATOS_REPORT.
import { writeFileSync } from 'node:fs';

const mode = process.env.KRATOS_FAKE ?? 'ok';
const args = process.argv.slice(2);
const script = args.find(a => a.startsWith('-ExecutePythonScript='))?.slice(21) ?? '';
console.log(`LogPython: ${script} ${args.join(' ')}`);
const write = report => writeFileSync(process.env.KRATOS_REPORT, JSON.stringify({args, script, ...report}), 'utf8');
if (mode === 'hang') {
  if (process.env.KRATOS_FAKE_PID) writeFileSync(process.env.KRATOS_FAKE_PID, String(process.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'noreport') {
  process.exitCode = 3;
} else if (script.endsWith('kratos_import.py')) {
  write({ok: mode === 'ok', assets: mode === 'ok' ? [`${process.env.KRATOS_DEST}/${process.env.KRATOS_NAME}`] : [], errors: []});
} else {
  const root = process.env.KRATOS_ROOT;
  write({ok: mode === 'ok', root, engine: '5.8.3-0+UE5', assets: [{package: `${root}/M_Cel`, class: 'Material', loaded: mode === 'ok'}],
    missing_dependencies: mode === 'ok' ? [] : [{from: `${root}/M_Cel`, to: '/Game/StarterContent/T_Falta'}],
    external_dependencies: [], errors: [], utf8: 'Nude_Tennis_Racket_🎾'});
}
