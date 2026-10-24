import { expect, test } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ownService } from './own-service'

// Hito 10 · Tarea 4: varios juegos con su servicio; la portada los enseña y cada panel pide su token a su propio servicio.
let fab: ReturnType<typeof ownService>, game: ReturnType<typeof ownService>
let token = ''
test.beforeAll(({ browserName }) => {
  const base = browserName === 'firefox' ? 18770 : 18772
  const registry = join(tmpdir(), `kratos-e2e-proyectos-${base}-${Date.now()}.json`)
  fab = ownService(base, 'KratosFabTest', registry); game = ownService(base + 1, 'BlockKings', registry)
  token = fab.start(); game.start()
})
test.afterAll(() => { fab.dispose(); game.dispose() })
test.use({ viewport: { width: 1920, height: 1080 } })

test('portada al abrir con varios proyectos; el otro juego se abre sin token en la URL y su cabecera dice su nombre', async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
  await page.goto(`${fab.origin}/#token=${token}`)
  await expect(page).toHaveURL(/\/proyectos$/)
  const card = page.getByRole('listitem').filter({ hasText: 'BlockKings' })
  await expect(card).toContainText(/tareas? vivas?/)
  await expect(page.locator('main')).not.toContainText(token)
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-10/portada-proyectos-1920.png' })
  await card.getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`^${game.origin}/`))
  await expect(page.locator('header h1')).toHaveText('BlockKings')
  await expect(page.getByText('Sin sesión')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cambiar de proyecto' }).click()
  await expect(page.getByRole('menuitem', { name: 'KratosFabTest' })).toHaveAttribute('href', `${fab.origin}/`)
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-10/selector-proyectos-1920.png' })
})
