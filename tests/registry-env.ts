// Precarga de `npm test`: los servicios que arrancan las pruebas apuntan a un registro de proyectos temporal,
// nunca al de la máquina (%LOCALAPPDATA%\nomos\projects.json).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
process.env.NOMOS_REGISTRY ??= join(tmpdir(), `nomos-registro-pruebas-${process.pid}.json`);
// hito 22: el planificador mira la RAM y los Unreal del PC; la suite no depende de lo que haya abierto en él
if (!process.env.NOMOS_MACHINE_FAKE) {
  process.env.NOMOS_MACHINE_FAKE = join(tmpdir(), `nomos-maquina-pruebas-${process.pid}.json`);
  writeFileSync(process.env.NOMOS_MACHINE_FAKE, JSON.stringify({freeGb: 64, editors: 0}));
}
