import { expect, test } from '@playwright/test'

// Prueba 15 (plan v2): sin token, 401; el panel no lo confunde con «Servicio desconectado».
const url = () => process.env.KRATOS_URL!
const origin = () => new URL(url()).origin
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1')) })

test('sin token y con un token que no es del arranque actual las rutas responden 401', async ({ request }) => {
  for (const path of ['/status', '/tasks', '/events', '/doctor', '/capabilities']) {
    expect((await request.get(origin() + path)).status(), path).toBe(401)
    expect((await request.get(origin() + path, { headers: { Authorization: 'Bearer de-otro-arranque' } })).status(), path).toBe(401)
  }
  expect((await request.post(origin() + '/capabilities/node/check')).status()).toBe(401)
  expect((await request.get(origin() + '/health')).status()).toBe(200)
})

test('hito 10: abierto en su origen sin token, el panel pide la sesión a su servicio y entra', async ({ page }) => {
  await page.goto(origin() + '/')
  await expect(page.locator('header h1')).toHaveText('CrazyPadel')
  await expect(page.getByText(/Sin sesión|Sesión caducada|Servicio desconectado/)).toHaveCount(0)
})

test('el panel sin token (y sin sesión del servicio) dice «Sin sesión» y con un token viejo «Sesión caducada»', async ({ page }) => {
  await page.route('**/session', (route) => route.fulfill({ status: 403, body: '{"error":"forbidden_origin"}' }))
  await page.goto(origin() + '/')
  await expect(page.getByText('Sin sesión · ábrelo desde Kratos')).toBeVisible()
  await expect(page.getByText('Servicio desconectado')).toHaveCount(0)
  await page.goto(origin() + '/#token=de-otro-arranque')
  await page.reload()
  await expect(page.getByText(/Sesión caducada/)).toBeVisible()
})
