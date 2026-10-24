import { expect, test, type Page } from '@playwright/test'

const url = (path: string) => process.env.NOMOS_URL!.replace('/#', `${path}#`)
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

/** Ancho del contenido de la vista y padding lateral de main, medidos en el navegador. */
const measure = (page: Page) => page.locator('main').evaluate((m) => ({
  content: (m.firstElementChild ?? m).getBoundingClientRect().width,
  padding: parseFloat(getComputedStyle(m).paddingLeft),
  viewport: document.documentElement.clientWidth,
}))
/** 72ch en la fuente del contenido, para comparar con el texto corrido. */
const prose = (page: Page) => page.locator('main').evaluate((m) => {
  const probe = document.createElement('div'); probe.style.width = '72ch'; m.append(probe)
  const width = probe.getBoundingClientRect().width; probe.remove(); return width
})

test.describe('Ancho completo (hito 10)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })
  for (const path of ['/', '/actividad', '/entregas', '/catalogo', '/capacidades']) {
    test(`${path} usa todo el ancho con 24 px de margen`, async ({ page }) => {
      await page.goto(url(path))
      await page.locator('main > *').first().waitFor()
      const m = await measure(page)
      expect(m.padding).toBe(24)
      expect(m.content).toBeGreaterThanOrEqual(m.viewport - 48 - 1)
    })
  }
  test('Entregas: caben seis tarjetas por fila a 1920', async ({ page }) => {
    await page.goto(url('/entregas'))
    const grid = page.locator('main ul').first()
    await grid.locator('li').first().waitFor()
    // auto-fill crea las columnas aunque haya menos tarjetas: se cuentan las pistas de la rejilla
    expect(await grid.evaluate((ul) => getComputedStyle(ul).gridTemplateColumns.split(' ').length)).toBeGreaterThanOrEqual(6)
  })
  for (const [path, selector] of [['/chat', 'ul[aria-label="Conversación con Nomos"]'], ['/decisiones', '[data-decision-card]']] as const) {
    test(`${path}: el texto corrido no pasa de 72ch`, async ({ page }) => {
      await page.goto(url(path))
      const box = await page.locator(selector).first().boundingBox()
      expect(box!.width).toBeLessThanOrEqual(await prose(page) + 1)
    })
  }
})

test.describe('Móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('16 px de margen lateral', async ({ page }) => {
    await page.goto(url('/entregas'))
    await page.locator('main > *').first().waitFor()
    expect((await measure(page)).padding).toBe(16)
  })
})
