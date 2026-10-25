import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ownService } from './own-service'

// Hito 17: la build dice de qué commit sale; si no incluye main, el panel avisa (y Jugar sigue funcionando).
test.describe.configure({ mode: 'serial' })
const cli = resolve(import.meta.dirname, '../../service/src/cli.ts')
let service: ReturnType<typeof ownService>, token: string, root: string, old: string
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const build = () => join(root, 'Build', 'Windows-actual')
const stale = 'Esta build no incluye los últimos cambios de main'

test.beforeAll(({ browserName }) => {
  service = ownService(browserName === 'firefox' ? 18816 : 18815, 'Juego')
  root = dirname(service.data)
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 'n@n'); git('config', 'user.name', 'Nomos')
  writeFileSync(join(root, '.gitignore'), '.nomos/\nBuild/\nregistro.json\n')
  git('add', '.'); git('commit', '-qm', 'viejo'); old = git('rev-parse', 'HEAD')
  writeFileSync(join(root, 'reacciones.txt'), 'J1.11'); git('add', '.'); git('commit', '-qm', 'J1.11')
  mkdirSync(build(), { recursive: true }); writeFileSync(join(build(), 'Juego.exe'), 'MZ')
  token = service.start()
})
test.afterAll(() => { service.stop(); rmSync(root, { recursive: true, force: true }) })
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

test('sin build-info.json: «Origen desconocido» discreto', async ({ page }) => {
  await page.goto(service.url(token))
  await expect(page.getByText(/^Última build: /)).toBeVisible()
  await expect(page.getByText('Origen desconocido')).toBeVisible()
  await expect(page.getByText(stale)).toHaveCount(0)
})

test('build de un commit anterior a main: aviso con el color de aviso, Jugar sigue activo; nada de commits ni rutas', async ({ page }) => {
  writeFileSync(join(build(), 'build-info.json'), JSON.stringify({ commit: old, branch: 'nomos/j1-10', builtAt: new Date().toISOString(), task: null, run: null }))
  await page.goto(service.url(token))
  const note = page.getByText(stale)
  await expect(note).toBeVisible()
  expect(await note.evaluate((el) => getComputedStyle(el).color)).toBe(
    await page.evaluate(() => { const p = document.createElement('p'); p.className = 'text-warning'; document.body.append(p); const c = getComputedStyle(p).color; p.remove(); return c }))
  const play = page.locator('header').getByRole('button', { name: 'Jugar' })
  await expect(play).toBeEnabled()
  await play.hover()
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(stale)
  await expect(page.locator('body')).not.toContainText(old.slice(0, 7))
  await expect(page.locator('body')).not.toContainText(/Windows-actual|build-info|Juego\.exe/)
  const status = await (await page.request.get(`${service.origin}/play`, { headers: { Authorization: `Bearer ${token}` } })).json()
  expect(status.build.stale).toBe(true)
  expect(status.build.commit).toBe(old)
})

test('nomos build stamp con HEAD de main: al día, sin aviso', async ({ page }) => {
  execFileSync(process.execPath, [cli, 'build', 'stamp', build()], { cwd: root, stdio: 'ignore' })
  await page.goto(service.url(token))
  await expect(page.getByText(/^Última build: /)).toBeVisible()
  await expect(page.getByText(stale)).toHaveCount(0)
  await expect(page.getByText('Origen desconocido')).toHaveCount(0)
})
