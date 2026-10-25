import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { ownService } from './own-service'

// Hito 14: «Jugar» con el servicio propio y un ejecutable falso (una copia de node que espera); nunca el juego de verdad.
test.describe.configure({ mode: 'serial' })
let service: ReturnType<typeof ownService>, token: string, root: string
test.beforeAll(({ browserName }) => {
  service = ownService(browserName === 'firefox' ? 18812 : 18811, 'Juego')
  root = dirname(service.data)
  token = service.start()
})
test.afterAll(async () => {
  service.stop()
  // Windows suelta el .exe de una partida recién cerrada con retraso
  for (let i = 0; i < 50; i++) { try { rmSync(root, { recursive: true, force: true }); return } catch { await new Promise((r) => setTimeout(r, 200)) } }
})
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

const fakeGame = (script: string) => {
  const dir = join(root, 'Build', 'Windows-actual')
  mkdirSync(dir, { recursive: true })
  try { copyFileSync(process.execPath, join(dir, 'Juego.exe')) } catch { /* ya copiado */ }
  writeFileSync(join(dir, 'partida.mjs'), script)
  writeFileSync(join(service.data, 'config.json'), JSON.stringify({ play: { args: ['partida.mjs'] } }))
}
const header = (page: Page) => page.locator('header')

test('sin build el botón sigue visible, desactivado y con el motivo', async ({ page }) => {
  await page.goto(service.url(token))
  const play = header(page).getByRole('button', { name: 'Jugar' })
  await expect(play).toBeVisible()
  await expect(play).toBeDisabled()
  await expect(header(page).getByText('Todavía no hay ninguna build')).toBeVisible()
  await expect(page.getByText('Todavía no hay ninguna build').nth(1)).toBeVisible()
})

test('Jugar lanza la build, pasa a «Jugando» y Detener la cierra; sin rutas en pantalla', async ({ page }) => {
  fakeGame('setTimeout(() => {}, 120_000);')
  await page.goto(service.url(token))
  const play = header(page).getByRole('button', { name: 'Jugar' })
  await expect(play).toBeEnabled()
  await expect(play).toHaveAttribute('data-fresh', 'true')
  await expect(page.getByText(/^Última build: .+ · paquete del director$/)).toBeVisible()
  await play.click()
  const playing = header(page).getByRole('button', { name: /^Jugando · \d\d:\d\d · Detener$/ })
  await expect(playing).toBeVisible()
  await expect(playing).toHaveAttribute('data-state', 'playing')
  const status = await (await page.request.get(`${service.origin}/play`, { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(status.running.pid).toBeGreaterThan(0)
  await expect(page.locator('body')).not.toContainText(/Juego\.exe|Windows-actual|\.nomos/)
  await playing.click()
  await expect(header(page).getByRole('button', { name: 'Jugar' })).toHaveAttribute('data-state', 'ready')
  await expect(header(page).getByRole('button', { name: 'Jugar' })).toHaveAttribute('data-fresh', 'false')
})

test('una partida que termina sola devuelve el botón a «Jugar» por SSE', async ({ page }) => {
  fakeGame('setTimeout(() => {}, 1500);')
  await page.goto(service.url(token))
  await header(page).getByRole('button', { name: 'Jugar' }).click()
  await expect(header(page).getByRole('button', { name: /^Jugando/ })).toBeVisible()
  await expect(header(page).getByRole('button', { name: 'Jugar' })).toHaveAttribute('data-state', 'ready', { timeout: 15_000 })
})

test('a 1366 px Jugar destaca sin desbordar la cabecera', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto(service.url(token))
  const play = header(page).getByRole('button', { name: 'Jugar' })
  await expect(play).toBeVisible()
  const box = (await play.boundingBox())!
  expect(box.height).toBe(40)
  expect(box.x + box.width).toBeLessThan(1366)
  expect(await header(page).evaluate((h) => h.scrollWidth <= h.clientWidth)).toBe(true)
})
