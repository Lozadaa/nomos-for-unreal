import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')

/** Servicio propio (otro puerto y carpeta) para las pruebas que lo paran y lo arrancan sin tocar el compartido. */
export function ownService(port: number) {
  const root = mkdtempSync(join(tmpdir(), 'kratos-e2e-propio-'))
  const data = join(root, '.kratos')
  writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  const token = () => (JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }).token
  const start = () => {
    execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', String(port), '--no-open'], { stdio: 'ignore' })
    return token()
  }
  const stop = () => { try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* ya parado */ } }
  return {
    origin: `http://127.0.0.1:${port}`, start, stop,
    url: (t: string) => `http://127.0.0.1:${port}/#token=${t}`,
    dispose() { stop(); setTimeout(() => rmSync(root, { recursive: true, force: true }), 500) },
  }
}
