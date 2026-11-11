import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runLogged, quote } from '../../service/src/adapters/process.ts';

test('el log acotado conserva las marcas NOMOS_ de la parte recortada',async()=>{
  // TrompoArte: 12 000 avisos InverseFast del motor dejaron fuera «NOMOS_DEMO activo» y la comprobación imagen no corrió
  const script='console.log("NOMOS_DEMO activo");const l="LogUnrealMath: Error: InverseFast ".repeat(4)+"\\n";for(let i=0;i<20000;i++)process.stdout.write(l);console.log("NOMOS_DEMO_CAPTURAS 3");';
  const {exitCode,log}=await runLogged(process.execPath,['-e',quote(script)],{timeoutMs:30_000});
  assert.equal(exitCode,0);
  assert.ok(log.length<=2_100_000,'sigue acotado');
  assert.ok(log.includes('NOMOS_DEMO activo'));assert.ok(log.includes('NOMOS_DEMO_CAPTURAS 3'));
});
