import { expect, test, type Page } from '@playwright/test'

const url = () => process.env.KRATOS_URL!

// Estos casos verifican vistas y acciones; la guía tiene sus propios E2E.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
})
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const origin = () => new URL(url()).origin
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(origin() + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })

const routes = [['/', 'Producción'], ['/actividad', 'Actividad'], ['/entregas', 'Entregas'], ['/catalogo', 'Catálogo'], ['/chat', 'Chat'],
  ['/decisiones', 'Decisiones'], ['/presupuesto', 'Presupuesto'], ['/capacidades', 'Capacidades'], ['/estilo', 'Estilo']] as const

for (const [path, name] of routes) {
  test(`${name}: carga con datos reales sin errores de consola ni de seguridad`, async ({ page }) => {
    const problems: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
    page.on('pageerror', (e) => problems.push(e.message))
    await page.goto(url().replace('/#', `${path}#`))
    await expect(page.getByRole('link', { name: new RegExp(`^${name}`) }).first()).toHaveAttribute('aria-current', 'page')
    await page.waitForTimeout(600)
    expect(problems).toEqual([])
  })
}

test('Entregas: las imágenes y el modelo GLB cargan pese a la política de seguridad (service worker con el token)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'WebGL del visor 3D: se comprueba en Chromium')
  const problems: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()) })
  await page.goto(url().replace('/#', '/entregas#'))
  const img = page.getByRole('img', { name: 'Captura UMG 1280×720' })
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
  const viewer = page.locator('model-viewer')
  await expect(viewer).toHaveCount(1)
  await expect.poll(() => viewer.evaluate((el: HTMLElement & { loaded?: boolean }) => Boolean(el.loaded)), { timeout: 15000 }).toBe(true)
  expect(problems).toEqual([]) // sin error de wasm gracias a 'wasm-unsafe-eval' en la política de seguridad
})

test('Producción se actualiza en vivo por SSE: una tarea creada fuera del panel aparece sin recargar', async ({ page }) => {
  await page.goto(url())
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
  const created = await call(page, '/tasks', { title: 'Creada desde fuera', spec: '', area: 'qa', acceptance: [] })
  expect(created.status()).toBe(201)
  await expect(page.getByRole('button', { name: /Creada desde fuera/ })).toBeVisible()
})

test('Chat: el mensaje enviado aparece al instante, pasa a «Recibido» y la respuesta de Kratos llega en vivo', async ({ page, browserName }) => {
  const text = `Hola desde el panel (${browserName})`
  await page.goto(url().replace('/#', '/chat#'))
  const posted = page.waitForResponse((r) => r.url().endsWith('/messages') && r.request().method() === 'POST')
  await page.getByLabel('Mensaje para Kratos').fill(text)
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(text)).toBeVisible()
  const { messageId } = await (await posted).json()
  await expect(page.locator('li', { hasText: text }).getByText(/Enviado · esperando confirmación de Kratos/)).toBeVisible()
  // Kratos (la sesión de Claude) confirma y responde por la API del servicio
  await call(page, `/messages/${messageId}/reply`, { text: 'Entendido, lo preparo' })
  await expect(page.getByText('Entendido, lo preparo')).toBeVisible()
})

test('el botón que lanzó una acción recupera el foco al terminar (Capacidades · Comprobar ahora, comprobación real)', async ({ page }) => {
  await page.goto(url().replace('/#', '/capacidades#'))
  const button = page.getByRole('list', { name: 'Capacidades' }).getByRole('listitem').filter({ hasText: 'Node.js' }).getByRole('button')
  // la comprobación se guarda: en el segundo navegador Node ya figura como comprobado
  await expect(button).toHaveText(/^(Comprobar ahora|Volver a comprobar)$/)
  await button.focus()
  await page.keyboard.press('Enter')
  // la comprobación real de Node responde enseguida: «Comprobando…» puede durar un instante
  await expect(button).toHaveText('Volver a comprobar', { timeout: 5000 })
  await expect(button).toBeFocused()
  await expect(page.getByRole('list', { name: 'Capacidades' }).getByRole('listitem').filter({ hasText: 'Node.js' })).toContainText(/Comprobado · revisado/)
})
