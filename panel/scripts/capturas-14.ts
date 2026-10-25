// Desde la raíz, tras `npm run build`:  node panel/scripts/capturas-14.ts
// Servicio propio con la semilla y un ejecutable falso (copia de node que espera): nunca el juego de verdad.
// Cabecera con Jugar sin build, con build y jugando, a 1920 y 1366, y Producción con la línea de la última build.
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { ownService } from '../e2e/own-service.ts'

const out = resolve(import.meta.dirname, '../../docs/capturas-14')
mkdirSync(out, { recursive: true })
const service = ownService(18815, 'Juego'), root = dirname(service.data), token = service.start()
const auth = { Authorization: `Bearer ${token}` }
const browser = await chromium.launch({ channel: 'chrome' })
const shot = async (page: Page, name: string, full = false) => {
  await page.evaluate(() => document.fonts.ready)
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400) // sin transiciones de color a medias
  await page.screenshot({ path: join(out, name), ...(full ? {} : { clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 56 } }) })
  console.log(`docs/capturas-14/${name}`)
}
try {
  const errors: string[] = []
  const open = async (width: number) => {
    const page = await browser.newPage({ viewport: { width, height: width === 1920 ? 1080 : 768 }, reducedMotion: 'reduce' })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1'))
    await page.goto(service.url(token), { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /Jugar|Jugando/ }).first().waitFor()
    return page
  }
  for (const width of [1920, 1366]) await shot(await open(width), `cabecera-sin-build-${width}.png`)
  // una build de hace 12 minutos del paquete del director
  const dir = join(root, 'Build', 'Windows-actual'), exe = join(dir, 'Juego.exe')
  mkdirSync(dir, { recursive: true }); copyFileSync(process.execPath, exe)
  const built = new Date(Date.now() - 12 * 60_000); utimesSync(exe, built, built)
  writeFileSync(join(dir, 'partida.mjs'), 'setTimeout(() => {}, 120_000);')
  writeFileSync(join(service.data, 'config.json'), JSON.stringify({ play: { args: ['partida.mjs'] } }))
  for (const width of [1920, 1366]) {
    const page = await open(width)
    await page.locator('header').getByRole('button', { name: 'Jugar' }).and(page.locator(':enabled')).waitFor()
    await shot(page, `cabecera-jugar-${width}.png`)
    if (width === 1920) {
      await page.getByText(/^Última build:/).waitFor()
      await shot(page, 'produccion-ultima-build-1920.png', true)
    }
  }
  assert.equal((await fetch(`${service.origin}/play`, { method: 'POST', headers: auth, body: '{}' })).status, 202)
  for (const width of [1920, 1366]) {
    const page = await open(width)
    await page.getByRole('button', { name: /^Jugando/ }).first().waitFor()
    await page.waitForTimeout(1200)
    await shot(page, `cabecera-jugando-${width}.png`)
    if (width === 1920) await shot(page, 'produccion-jugando-1920.png', true)
  }
  await fetch(`${service.origin}/play/stop`, { method: 'POST', headers: auth, body: '{}' })
  assert.deepEqual(errors, [])
} finally {
  await browser.close()
  service.stop()
  for (let i = 0; i < 50; i++) { try { rmSync(root, { recursive: true, force: true }); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
}
