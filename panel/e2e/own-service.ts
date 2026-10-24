import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')

/** Servicio propio (otro puerto y carpeta) para las pruebas que lo paran y lo arrancan sin tocar el compartido. */
/** `registry`: registro de proyectos compartido (solo la e2e de proyectos); si no, uno propio y nadie ve a nadie. */
export function ownService(port: number, project = 'CrazyPadel', registry?: string) {
  const root = mkdtempSync(join(tmpdir(), 'nomos-e2e-propio-'))
  const data = join(root, '.nomos')
  writeFileSync(join(root, `${project}.uproject`), '{}')
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  const token = () => (JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }).token
  const env = { ...process.env, NOMOS_REGISTRY: registry ?? join(root, 'registro.json') }
  const start = () => {
    execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', String(port), '--no-open'], { stdio: 'ignore', env })
    return token()
  }
  const stop = () => { try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore', env }) } catch { /* ya parado */ } }
  return {
    origin: `http://127.0.0.1:${port}`, data, start, stop,
    url: (t: string) => `http://127.0.0.1:${port}/#token=${t}`,
    dispose() { stop(); setTimeout(() => rmSync(root, { recursive: true, force: true }), 500) },
  }
}
