// Desde panel/, después del build: node scripts/capturas-6-semilla.ts
// Entregas con la semilla (registro C++ con errores, capturas UMG y de control, modelo), ordenada por tarea, a 1366 y 1920.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const out = resolve(import.meta.dirname, '../../docs/capturas-6')
const root = mkdtempSync(join(tmpdir(), 'kratos-hito6-'))
const data = join(root, '.kratos')
const server = createServer()
await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
const port = String((server.address() as { port: number }).port)
await new Promise<void>((ok, fail) => server.close((error) => error ? fail(error) : ok()))
writeFileSync(join(root, 'CrazyPadel.uproject'), '{}')
mkdirSync(out, { recursive: true })

try {
  execFileSync(process.execPath, [cli, 'seed', '--data', data], { stdio: 'ignore' })
  execFileSync(process.execPath, [cli, 'start', '--data', data, '--port', port, '--no-open'], { stdio: 'ignore' })
  const { token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { token: string }
  const browser = await chromium.launch({ channel: 'chrome' })
  try {
    for (const [width, height] of [[1366, 768], [1920, 1080]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${port}/#token=${token}`, { waitUntil: 'domcontentloaded' })
      const guide = page.getByRole('button', { name: 'Cerrar guía' })
      await guide.waitFor({ timeout: 5000 }).then(() => guide.click(), () => {})
      await page.goto(`http://127.0.0.1:${port}/entregas?orden=tarea`, { waitUntil: 'domcontentloaded' })
      await page.getByLabel('Primeros errores').waitFor()
      await page.evaluate(() => document.fonts.ready)
      assert.equal(await page.getByText('Compilación C++ · registro').count(), 1)
      assert.equal(await page.getByText(/log\.txt|informe-demo|captura-0/).count(), 0, 'sin nombres de archivo visibles')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desbordamiento horizontal')
      await page.screenshot({ path: join(out, `entregas-6-semilla-${width}.png`) })
      console.log(`entregas-6-semilla-${width}.png`)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
} finally {
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* puede no haber arrancado */ }
  const target = resolve(root)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('kratos-hito6-'))
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
