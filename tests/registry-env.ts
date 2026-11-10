// Precarga de `npm test`: los servicios que arrancan las pruebas apuntan a un registro de proyectos temporal,
// nunca al de la máquina (%LOCALAPPDATA%\nomos\projects.json).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
process.env.NOMOS_REGISTRY ??= join(tmpdir(), `nomos-registro-pruebas-${process.pid}.json`);
// hito 23: la suite no lanza el graphify real sobre sus juegos de prueba (las pruebas del grafo usan uno falso)
process.env.NOMOS_GRAPHIFY ??= 'off';
// hito 26: ni Second Brain (también al lanzar un .test.ts suelto sin tests/run.ts)
process.env.NOMOS_MEMORY ??= 'off';
// hito 22: el planificador mira la RAM y los Unreal del PC; la suite no depende de lo que haya abierto en él
if (!process.env.NOMOS_MACHINE_FAKE) {
  process.env.NOMOS_MACHINE_FAKE = join(tmpdir(), `nomos-maquina-pruebas-${process.pid}.json`);
  writeFileSync(process.env.NOMOS_MACHINE_FAKE, JSON.stringify({freeGb: 64, editors: 0}));
}
// x10: los comandos de lanzamiento de las pruebas no llevan --settings (lo prueba claude-lean.test.ts)
process.env.NOMOS_LEAN ??= 'off';
// jam 2026-11-10: el modo rápido es el valor por defecto; la suite mide los de antes (rapido-defecto.test.ts, el nuevo)
process.env.NOMOS_RAPIDO_DEFAULT ??= 'off';
