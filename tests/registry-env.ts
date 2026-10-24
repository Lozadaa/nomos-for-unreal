// Precarga de `npm test`: los servicios que arrancan las pruebas apuntan a un registro de proyectos temporal,
// nunca al de la máquina (%LOCALAPPDATA%\kratos\projects.json).
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.KRATOS_REGISTRY ??= join(tmpdir(), `kratos-registro-pruebas-${process.pid}.json`);
