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

test('el panel abierto sin token dice «Sin sesión» y con un token viejo «Sesión caducada»', async ({ page }) => {
  await page.goto(origin() + '/')
  await expect(page.getByText('Sin sesión · ábrelo desde Kratos')).toBeVisible()
  await expect(page.getByText('Servicio desconectado')).toHaveCount(0)
  await page.goto(origin() + '/#token=de-otro-arranque')
  await page.reload()
  await expect(page.getByText(/Sesión caducada/)).toBeVisible()
})
