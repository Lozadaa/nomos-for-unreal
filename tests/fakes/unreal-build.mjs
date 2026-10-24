// Build.bat / RunUAT.bat falsos: NOMOS_FAKE elige éxito, fallo con 400 líneas de error o cuelgue.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.env.NOMOS_FAKE ?? 'ok';
const args = process.argv.slice(2);
console.log(`Running ${args.join(' ')}`);
if (mode === 'hang') {
  if (process.env.NOMOS_FAKE_PID) writeFileSync(process.env.NOMOS_FAKE_PID, String(process.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'fail') {
  for (let i = 1; i <= 400; i++) console.log(`C:\Juego\Source\Juego\Juego.cpp(${i}): error C2065: 'Falta${i}': identificador no declarado`);
  console.log('Result: Failed (OtherCompilationError)');
  process.exitCode = 6;
} else {
  const archive = args.find(a => a.startsWith('-archivedirectory='))?.slice(18);
  if (archive) { mkdirSync(join(archive, 'Windows'), {recursive: true}); writeFileSync(join(archive, 'Windows', 'Juego.exe'), ''); }
  console.log('Result: Succeeded');
}
