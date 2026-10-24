import { expect, test } from '@playwright/test'

const url = (path: string) => process.env.KRATOS_URL!.replace('/#', `${path}#`)
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1')) })

// Hito 10 · corrección de Fable: el subrayado de la pestaña activa estaba bajo «Catálogo» con la vista Chat abierta.
for (const width of [1024, 1366, 1920]) {
  test(`a ${width} el subrayado queda bajo la pestaña activa aunque el contador de Decisiones aparezca después`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(url('/chat'))
    const nav = page.getByRole('navigation', { name: 'Vistas' })
    await expect(nav.getByText(/^\d+$/).first()).toBeVisible()
    await page.waitForTimeout(400)
    const [link, bar] = await Promise.all([
      nav.getByRole('link', { name: /^Chat/ }).boundingBox(),
      nav.locator('span[aria-hidden].absolute').boundingBox(),
    ])
    expect(Math.abs(bar!.x - link!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(bar!.width - link!.width)).toBeLessThanOrEqual(1)
  })
}

test('en la portada de proyectos ninguna pestaña está activa y no queda subrayado de la vista anterior', async ({ page }) => {
  await page.goto(url('/'))
  await page.getByRole('navigation', { name: 'Vistas' }).waitFor()
  await expect(page.getByRole('link', { name: 'Producción' })).toHaveAttribute('aria-current', 'page')
  await page.waitForTimeout(400)
  // navegación dentro de la aplicación, sin recargar: el subrayado venía de la vista anterior
  await page.evaluate(() => { history.pushState(null, '', '/proyectos'); dispatchEvent(new PopStateEvent('popstate')) })
  await page.getByText('Proyectos en este equipo').waitFor()
  await page.waitForTimeout(400)
  const bar = await page.getByRole('navigation', { name: 'Vistas' }).locator('span[aria-hidden].absolute').boundingBox()
  expect(bar?.width ?? 0).toBeLessThanOrEqual(1)
})
