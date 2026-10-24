import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Page } from '@playwright/test'
import { ownService } from './own-service'

// Hito 5b, Review Focus 2: tres candidatos con miniatura; abrir la miniatura no elige, elegir cierra la Decisión.
// Servicio propio: los presets con miniatura no tocan el catálogo de la semilla que comparten las demás pruebas.
let service: ReturnType<typeof ownService>, token = ''
test.beforeAll(({ browserName }) => {
  service = ownService(browserName === 'firefox' ? 18798 : 18797)
  const db = new DatabaseSync(join(service.data, 'kratos.db'))
  for (const [id, shot] of [['seed-catalog-04', 'captura-01.png'], ['seed-catalog-05', 'captura-02.png'], ['seed-catalog-06', null]] as const)
    db.prepare("update catalog_entries set category='metahuman-preset', thumbnail_path=? where id=?").run(shot && join(service.data, 'artifacts', shot), id)
  db.close()
  token = service.start()
})
test.afterAll(() => service.dispose())
const url = () => service.url(token)
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(service.origin + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` }, data })
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1')) })

type Decision = { id: string; taskId: string; state: string; options: { label: string }[] }

test('asset.candidates abre la Decisión con tres tarjetas; la miniatura abre el visor y no elige', async ({ page, browserName }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  const title = `Héroe con ataque (${browserName}) ${Date.now()}`
  const task = await (await call(page, '/tasks', { title, spec: '', area: 'animacion', acceptance: [] })).json() as { id: string }
  const queued = await call(page, '/commands', { type: 'asset.candidates', idempotencyKey: `candidatos:${task.id}`,
    payload: { taskId: task.id, query: 'héroe con ataque', kinds: ['metahuman-preset'] } })
  expect(queued.status()).toBe(202)
  const mine = async () => ((await (await call(page, '/decisions')).json()) as Decision[]).find((d) => d.taskId === task.id)
  await expect.poll(async () => (await mine())?.state, { timeout: 15_000 }).toBe('open')

  await page.goto(url().replace('/#', '/decisiones#'))
  await page.getByRole('list', { name: 'Bandeja de decisiones' }).getByRole('button').filter({ hasText: title }).click()
  await expect(page.getByRole('heading', { name: 'Elegir personaje base: 3 candidatos del catálogo' })).toBeVisible()
  const group = page.getByRole('group', { name: 'Opciones' })
  await expect(group.getByRole('button', { name: /^MetaHuman / })).toHaveCount(3)
  await expect(group.getByRole('button', { name: /^Ver .+ a tamaño completo$/ })).toHaveCount(2)

  const thumb = group.getByRole('button', { name: 'Ver MetaHuman Ada a tamaño completo' })
  await thumb.click()
  const viewer = page.getByRole('dialog', { name: 'MetaHuman Ada' })
  await expect(viewer).toBeVisible()
  if (browserName === 'chromium') {
    mkdirSync('../docs/capturas-5b', { recursive: true })
    await page.screenshot({ path: '../docs/capturas-5b/visor-candidato-1920.png' })
  }
  await page.keyboard.press('Escape')
  await expect(viewer).toBeHidden()
  expect((await mine())!.state, 'abrir la miniatura no elige').toBe('open')
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-5b/candidatos-1920.png' })

  await group.getByRole('button', { name: 'MetaHuman Bruno', exact: true }).click()
  await expect(page.getByRole('status', { name: /Elegiste MetaHuman Bruno\./ })).toBeVisible()
  await expect.poll(async () => (await mine())?.state).toBe('resolved')
})
