import { expect, test } from '@playwright/test'
import { ownService } from './own-service'

// Prueba 3 (plan v1): reiniciar el servicio conserva lo pendiente y no duplica tareas ni eventos.
test.describe.configure({ mode: 'serial' })
let service: ReturnType<typeof ownService>
test.beforeAll(({ browserName }) => { service = ownService(browserName === 'firefox' ? 18794 : 18793) })
test.afterAll(() => service.dispose())
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

test('nomos stop/start: el panel lo dice, el token viejo deja de valer y al reabrir no hay duplicados', async ({ page }) => {
  const first = service.start()
  await page.goto(service.url(first))
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
  const rows = page.locator('[data-task-id]')
  const before = await rows.count()
  const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } })
  const pending = await (await page.request.get(`${service.origin}/status`, auth(first))).json() as { pending: number }

  service.stop()
  await expect(page.getByText('Servicio desconectado')).toBeVisible({ timeout: 15_000 })
  const second = service.start()
  // prueba 15: el token del arranque anterior ya no vale
  expect((await page.request.get(`${service.origin}/status`, auth(first))).status()).toBe(401)
  await expect(page.getByText(/Sesión caducada/)).toBeVisible({ timeout: 15_000 })

  // solo cambia el hash: hace falta recargar para que el panel lea el token nuevo (como al abrirlo de nuevo desde Nomos)
  await page.goto(service.url(second))
  await page.reload()
  await expect(page.getByRole('button', { name: /Definir salto/ })).toBeVisible()
  await expect(rows).toHaveCount(before)
  expect((await (await page.request.get(`${service.origin}/status`, auth(second))).json() as { pending: number }).pending).toBe(pending.pending)

  // el canal en vivo vuelve: una tarea creada fuera aparece una sola vez aunque lleguen repeticiones del SSE
  const created = await page.request.post(`${service.origin}/tasks`, { ...auth(second), data: { title: 'Tras el reinicio', spec: '', area: 'qa', acceptance: [] } })
  expect(created.status()).toBe(201)
  await expect(page.getByRole('button', { name: /Tras el reinicio/ })).toHaveCount(1)
  await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: /Tras el reinicio/ })).toHaveCount(1)
  await expect(rows).toHaveCount(before + 1)
  // la repetición completa del SSE tras el reinicio no trae ningún evento dos veces
  const seqs = await page.evaluate(async (t) => {
    const controller = new AbortController()
    const res = await fetch('/events?since=0', { headers: { Authorization: `Bearer ${t}` }, signal: controller.signal })
    const reader = res.body!.getReader(), decoder = new TextDecoder()
    let text = ''
    const end = Date.now() + 1500
    try {
      while (Date.now() < end) {
        const part = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), 300))])
        if (part === null) continue
        if (part.done) break
        text += decoder.decode(part.value, { stream: true })
      }
    } finally { controller.abort() }
    return [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]))
  }, second)
  expect(seqs.length).toBeGreaterThan(10)
  expect(new Set(seqs).size).toBe(seqs.length)
})
