import { expect, test } from '@playwright/test'

const url = () => process.env.KRATOS_URL!

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
})
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!

// Review Focus 5: 500 eventos en Actividad no bloquean el hilo principal más de lo razonable, y un evento nuevo no provoca un frame largo.
test('Actividad con 500 eventos: frames largos al pintar y al llegar un evento nuevo', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'long-animation-frame solo existe en Chromium')
  test.setTimeout(120_000)
  const origin = new URL(url()).origin
  for (let i = 0; i < 480; i += 20) {
    await Promise.all(Array.from({ length: 20 }, (_, j) => page.request.post(`${origin}/messages`, { headers: { Authorization: `Bearer ${token()}` }, data: { text: `evento ${i + j}` } })))
  }
  await page.addInitScript(() => {
    const w = window as unknown as { __laf: number[] }
    w.__laf = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__laf.push(e.duration) }).observe({ type: 'long-animation-frame', buffered: true } as PerformanceObserverInit)
  })
  await page.goto(url().replace('/#', '/actividad#'))
  await expect(page.getByRole('group', { name: 'Kratos' })).toBeVisible()
  await expect.poll(() => page.getByRole('group', { name: 'Kratos' }).getByRole('button').count()).toBeGreaterThan(400)
  await page.waitForTimeout(500)
  const carga = await page.evaluate(() => { const w = window as unknown as { __laf: number[] }; const v = [...w.__laf]; w.__laf.length = 0; return v })

  await page.request.post(`${origin}/messages`, { headers: { Authorization: `Bearer ${token()}` }, data: { text: 'uno más' } })
  await page.waitForTimeout(800)
  const nuevo = await page.evaluate(() => (window as unknown as { __laf: number[] }).__laf)
  console.log(`Actividad 500 eventos · carga: frames largos ${JSON.stringify(carga.map(Math.round))} ms · evento nuevo: ${JSON.stringify(nuevo.map(Math.round))} ms`)
  // un evento nuevo no puede bloquear el hilo más de 50 ms; la primera pintura se anota (se mide, no se oculta)
  expect(Math.max(0, ...nuevo)).toBeLessThanOrEqual(50)
})
