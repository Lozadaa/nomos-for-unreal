// Desde panel/, con el servicio de aceptación arrancado: node scripts/capturas-5.ts "<juego>/.nomos" <taskId>
// Lee el token de service.json (nunca lo imprime) y captura la pestaña Pruebas de la tarea, Entregas y Capacidades a 1366 y 1920.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const [data, taskId] = process.argv.slice(2)
assert.ok(data && taskId, 'Uso: node scripts/capturas-5.ts <carpeta .nomos> <taskId>')
const out = resolve(import.meta.dirname, '../../docs/capturas-5')
mkdirSync(out, { recursive: true })
const { port, token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { port: number; token: string }
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', 'visto'))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const shot = async (name: string) => {
      await page.waitForTimeout(800)
      await page.evaluate(() => document.fonts.ready)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Desbordamiento horizontal en ${name}`)
      await page.screenshot({ path: join(out, `${name}-5-${width}.png`), fullPage: true })
      console.log(`${name}-5-${width}.png`)
    }
    await page.goto(`http://127.0.0.1:${port}/?tarea=${encodeURIComponent(taskId)}#token=${token}`)
    await page.getByRole('tab', { name: 'Pruebas' }).click()
    await page.getByRole('table', { name: 'Pruebas' }).waitFor({ timeout: 15_000 })
    await shot('pruebas')
    for (const [name, path, ready] of [['entregas', '/entregas', 'main li'], ['capacidades', '/capacidades', 'main ul']]) {
      await page.goto(`http://127.0.0.1:${port}${path}#token=${token}`)
      await page.locator(ready).first().waitFor({ timeout: 15_000 })
      await shot(name)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally { await browser.close() }
