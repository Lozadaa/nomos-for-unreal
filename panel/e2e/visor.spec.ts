import { expect, test, type Page } from '@playwright/test'

// Corrección 3 del usuario: un clic en un asset lo abre grande en el centro para verlo a detalle.
const url = () => process.env.KRATOS_URL!
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
})

/** El cuadro del visor ocupa al menos el 60 % del ancho y del alto de la ventana. */
async function expectLarge(page: Page, width: number, height: number) {
  const box = await page.getByRole('dialog').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThanOrEqual(width * 0.6)
  expect(box!.height).toBeGreaterThanOrEqual(height * 0.6)
}

for (const [width, height] of [[1366, 768], [1920, 1080]] as const) {
  test(`Entregas a ${width}: la captura se abre a tamaño completo y Esc devuelve el foco`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height })
    await page.goto(url().replace('/#', '/entregas#'))
    const thumb = page.getByRole('button', { name: 'Ver Captura UMG 1280×720 a tamaño completo' })
    await thumb.click()
    const dialog = page.getByRole('dialog', { name: 'Captura UMG 1280×720' })
    await expect(dialog).toBeVisible()
    const img = dialog.getByRole('img', { name: 'Captura UMG 1280×720' })
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
    await expectLarge(page, width, height)
    if (browserName === 'chromium') await page.screenshot({ path: `../docs/capturas-7/visor-entregas-${width}.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(thumb).toBeFocused()
  })

  test(`Catálogo a ${width}: la miniatura abre el visor y los botones de la tarjeta siguen igual`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height })
    await page.goto(url().replace('/#', '/catalogo#'))
    const thumb = page.getByRole('button', { name: /^Ver .+ a tamaño completo$/ }).first()
    const name = (await thumb.getAttribute('aria-label'))!.replace(/^Ver (.+) a tamaño completo$/, '$1')
    await thumb.click()
    await expect(page.getByRole('dialog', { name })).toBeVisible()
    await expectLarge(page, width, height)
    if (browserName === 'chromium' && width === 1920) await page.screenshot({ path: '../docs/capturas-7/visor-catalogo-1920.png' })
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(thumb).toBeFocused()
  })
}
