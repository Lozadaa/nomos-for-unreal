// Desde panel/, después del build: node scripts/capturas-9b.ts
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { chromium } from '@playwright/test'

const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
const out = resolve(import.meta.dirname, '../../docs/capturas-9')
const root = mkdtempSync(join(tmpdir(), 'nomos-hito9b-'))
const data = join(root, '.nomos')
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
      await page.goto(`http://127.0.0.1:${port}/estilo#token=${token}`)
      await page.locator('#glifos li').last().waitFor()
      await page.evaluate(() => document.fonts.ready)
      assert.equal(await page.locator('#glifos li').count(), 37)
      assert.equal(await page.locator('[data-testid="legend-provider"] svg').count(), 0)
      assert.equal(await page.locator('#arte svg[aria-hidden="true"]').count(), 0)
      assert.equal(await page.getByRole('img', { name: 'Actividad por hora' }).count(), 0)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'Desbordamiento horizontal')
      for (const id of ['glifos', 'arte']) {
        await page.locator(`#${id}`).evaluate((el) => el.scrollIntoView({ block: 'start' }))
        await page.screenshot({ path: join(out, `${id}-9b-${width}.png`) })
        await page.locator(`#${id}`).screenshot({ path: join(out, `${id}-9b-${width}-seccion.png`) })
        console.log(`${id}-9b-${width}.png + sección completa`)
      }
      // La acción del vacío abre el compositor real de Producción.
      await page.getByLabel('Estados vacíos por vista').getByRole('link', { name: 'Nueva petición' }).first().click()
      await page.getByLabel('Título de la petición').waitFor()
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally { await browser.close() }
} finally {
  try { execFileSync(process.execPath, [cli, 'stop', '--data', data], { stdio: 'ignore' }) } catch { /* puede no haber arrancado */ }
  // El único directorio recursivo es el temporal creado por esta ejecución.
  const target = resolve(root)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.split(sep).at(-1)!.startsWith('nomos-hito9b-'))
  rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
