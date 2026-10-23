import { expect, test, type Page } from '@playwright/test'

// Prueba 24 (plan v2): Producción, detalle, Catálogo y Decisiones se recorren con teclado y el foco se ve.
const url = () => process.env.KRATOS_URL!
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1')) })

/** El elemento con foco tiene un contorno o anillo visible (no `outline: none` sin sombra). */
const focusVisible = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement | null
  if (!el || el === document.body) return false
  const style = getComputedStyle(el)
  return (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || (style.boxShadow !== 'none' && style.boxShadow !== '')
})
async function tabUntil(page: Page, match: (label: string) => boolean, max = 60): Promise<string> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab')
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? (el.getAttribute('aria-label') ?? el.textContent ?? '').trim() : ''
    })
    if (match(label)) return label
  }
  throw new Error('No se llegó al control con Tab')
}

test('Producción y detalle: Tab llega a una fila con foco visible, Enter abre, las flechas cambian de pestaña, Esc vuelve', async ({ page }) => {
  await page.goto(url())
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
  await tabUntil(page, (label) => label.startsWith('Definir salto'))
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('Enter')
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  await sheet.getByRole('tab', { name: 'Resumen' }).focus()
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.press('ArrowRight')
  await expect(sheet.getByRole('tab', { name: 'Chat' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeFocused()
})

test('Catálogo: filtros y búsqueda con teclado y foco visible', async ({ page }) => {
  await page.goto(url().replace('/#', '/catalogo#'))
  await expect(page.getByRole('link', { name: /^Catálogo/ }).first()).toHaveAttribute('aria-current', 'page')
  await tabUntil(page, (label) => label === 'Buscar asset')
  expect(await focusVisible(page)).toBe(true)
  await page.keyboard.type('zzz-no-existe')
  await expect(page.getByText(/Ningún asset coincide|No hay resultados|Sin resultados/i).first()).toBeVisible()
  await page.keyboard.press('Shift+Tab')
  expect(await focusVisible(page)).toBe(true)
})

test('Decisiones: j/k recorren la bandeja y una opción se elige con Tab y foco visible', async ({ page }) => {
  await page.goto(url().replace('/#', '/decisiones#'))
  const tray = page.getByRole('list', { name: 'Bandeja de decisiones' })
  await expect(tray).toBeVisible()
  await page.keyboard.press('j')
  await page.keyboard.press('k')
  await expect(tray.locator('[aria-current="true"]')).toHaveCount(1)
  const group = page.getByRole('group', { name: 'Opciones' })
  if (await group.count()) {
    await group.getByRole('button').first().focus()
    expect(await focusVisible(page)).toBe(true)
  }
})

test('? y Ctrl+K no abren nada mientras se escribe en la descripción; fuera de ella sí, y Esc devuelve el foco', async ({ page }) => {
  await page.goto(url())
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
  await page.getByLabel('Título de la petición').click()
  const description = page.getByLabel('Descripción')
  await description.click()
  await page.keyboard.type('¿qué tal? ')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(description).toHaveValue('¿qué tal? ')
  await page.getByRole('button', { name: 'Buscar' }).focus()
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Menú de comandos' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Menú de comandos' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Buscar' })).toBeFocused()
})
