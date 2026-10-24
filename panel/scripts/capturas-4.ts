// Desde panel/, con el servicio de aceptación arrancado: node scripts/capturas-4.ts "<juego>/.nomos"
// Lee el token de service.json (nunca lo imprime) y captura Catálogo, Entregas, Actividad y Decisiones a 1366 y 1920.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from '@playwright/test'

const data = process.argv[2]
assert.ok(data, 'Uso: node scripts/capturas-4.ts <carpeta .nomos>')
const out = resolve(import.meta.dirname, '../../docs/capturas-4')
mkdirSync(out, { recursive: true })
const { port, token } = JSON.parse(readFileSync(join(data, 'service.json'), 'utf8')) as { port: number; token: string }
const views: [string, string, string][] = [
  ['catalogo', '/catalogo', '[data-catalog-card]'],
  ['entregas', '/entregas', 'main li'],
  ['actividad', '/actividad', '[data-hour-axis]'],
  ['decisiones', '/decisiones', 'main'],
]
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' })
    // la guía de primera visita ya tiene sus propias capturas (hito 9): aquí se marca como vista
    await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', 'visto'))
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`http://127.0.0.1:${port}/#token=${token}`)
    await page.locator('main').waitFor()
    for (const [name, path, ready] of views) {
      await page.evaluate((to) => { history.pushState(null, '', to); dispatchEvent(new PopStateEvent('popstate')) }, path)
      await page.locator(ready).first().waitFor({ timeout: 15_000 })
      await page.waitForTimeout(800)
      await page.evaluate(() => document.fonts.ready)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Desbordamiento horizontal en ${name}`)
      await page.screenshot({ path: join(out, `${name}-4-${width}.png`), fullPage: true })
      console.log(`${name}-4-${width}.png`)
    }
    assert.deepEqual(errors, [])
    await page.close()
  }
} finally { await browser.close() }
