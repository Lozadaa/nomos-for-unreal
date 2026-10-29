import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const PORT = '18791'
// los servicios de los e2e no se apuntan en el registro de proyectos de la máquina
process.env.NOMOS_REGISTRY = join(tmpdir(), `nomos-e2e-registro-${process.pid}.json`)
// hito 23: el servicio de prueba no lanza el graphify real sobre su juego sembrado
process.env.NOMOS_GRAPHIFY ??= 'off'

/** Servicio de prueba con la semilla real y un .uproject; los datos viven en una carpeta temporal que el teardown borra. */
export default function setup() {
  const root = mkdtempSync(join(tmpdir(), 'nomos-e2e-'))
  const data = join(root, '.nomos')
  writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', PORT, '--no-open'], { stdio: 'ignore' })
  const info = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }
  process.env.NOMOS_URL = `http://127.0.0.1:${PORT}/#token=${info.token}`
  process.env.NOMOS_DATA = data
  writeFileSync(join(tmpdir(), 'nomos-e2e.json'), JSON.stringify({ url: process.env.NOMOS_URL, data, root }))
}
