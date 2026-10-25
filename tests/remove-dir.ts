import { rmSync } from 'node:fs';

/** Borra una carpeta de prueba; en Windows un proceso que acaba de cerrar aún puede retener un archivo (EPERM/EBUSY): reintenta. */
export const removeDir = (dir: string) => rmSync(dir, {recursive: true, force: true, maxRetries: 10, retryDelay: 100});
