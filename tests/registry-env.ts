// Precarga de `npm test`: los servicios que arrancan las pruebas apuntan a un registro de proyectos temporal,
// nunca al de la máquina (%LOCALAPPDATA%\nomos\projects.json).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.NOMOS_REGISTRY ??= join(tmpdir(), `nomos-registro-pruebas-${process.pid}.json`);
