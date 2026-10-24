import { expect, test } from '@playwright/test'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ownService } from './own-service'

// Hito 10 · Tarea 6: el chat se actualiza por SSE sin recargar (acuse, «escribiendo», tarjetas y respuesta en Markdown).
let service: ReturnType<typeof ownService>
let token = ''
test.beforeAll(({ browserName }) => { service = ownService(browserName === 'firefox' ? 18789 : 18796); token = service.start() })
test.afterAll(() => service.dispose())
test.use({ viewport: { width: 1920, height: 1080 } })

const call = (page: import('@playwright/test').Page, path: string, data: unknown) =>
  page.request.post(service.origin + path, { headers: { Authorization: `Bearer ${token}` }, data })

test('envío → leído → escribiendo → tarjeta de la tarea creada → respuesta en Markdown, sin recargar', async ({ page, browserName }) => {
  await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
  await page.goto(`${service.origin}/chat#token=${token}`)
  await page.getByLabel('Mensaje para Kratos').fill('Crea las tareas de J1: golpe, dash y estamina')
  await page.getByRole('button', { name: 'Enviar' }).click()
  await expect(page.getByText(/^Recibido \d\d:\d\d$/)).toBeVisible()

  const db = new DatabaseSync(join(service.data, 'kratos.db'))
  const { seq, message_id: messageId } = db.prepare("select seq, message_id from events where type='message.received' order by seq desc limit 1").get() as { seq: number; message_id: string }
  db.close()
  expect((await call(page, `/events/${seq}/ack`, { session: 'e2e' })).status()).toBe(200)
  await expect(page.getByText(/^Leído por Kratos \d\d:\d\d$/)).toBeVisible()

  expect((await call(page, `/messages/${messageId}/typing`, {})).status()).toBe(200)
  await expect(page.getByRole('status', { name: 'Kratos está escribiendo…' })).toBeVisible()
  await expect(page.locator('header').getByText('Kratos respondiendo')).toBeVisible()

  // como lo hace hoy el director: crea antes de escribir; la tarjeta aparece igual, en vivo
  const first = await (await call(page, '/tasks', { title: 'J1.7 Dash sin vuelo', area: 'gameplay', spec: '', acceptance: [] })).json() as { id: string }
  await expect(page.getByRole('list', { name: 'Creado a partir de tu mensaje' }).getByRole('link', { name: /^J1\.7 Dash sin vuelo/ })).toHaveAttribute('href', `/?tarea=${first.id}`)
  await call(page, `/messages/${messageId}/reply`, { text: 'Entendido: creo 3 tareas…' })
  await call(page, `/messages/${messageId}/typing`, {})
  const created = await (await call(page, '/tasks', { title: 'J1.6 Reacción al golpe', area: 'gameplay', spec: '', acceptance: [], messageId })).json() as { id: string }
  const cards = page.getByRole('list', { name: 'Creado a partir de tu mensaje' })
  await expect(cards.getByRole('link', { name: /^J1\.6 Reacción al golpe/ })).toHaveAttribute('href', `/?tarea=${created.id}`)
  await expect(page.getByRole('status', { name: 'Kratos está escribiendo…' })).toBeVisible()
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-10/chat-en-vivo-1920.png' })

  await call(page, `/messages/${messageId}/reply`, { text: 'Listo. Tareas:\n1) J1.6 Reacción al golpe · **preparada**\n2) J1.7 Dash sin vuelo · preparada\n3) J1.8 Estamina y peso · pendiente' })
  await expect(page.locator('main ol > li')).toHaveText(['J1.6 Reacción al golpe · preparada', 'J1.7 Dash sin vuelo · preparada', 'J1.8 Estamina y peso · pendiente'])
  await expect(page.getByRole('status', { name: 'Kratos está escribiendo…' })).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText(created.id)
  await call(page, '/tasks', { title: 'J1.8 Estamina y peso', area: 'animacion', spec: '', acceptance: [], messageId })
  await expect(cards.getByRole('link')).toHaveCount(3)
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-10/chat-markdown-1920.png' })
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-10/chat-tarjetas-1920.png' })
})

for (const [width, height] of [[1024, 768], [1366, 768], [1920, 1080]] as const) {
  test(`sin scroll horizontal a ${width}: texto de 600 caracteres sin espacios, tabla ancha y código largo`, async ({ page, browserName }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => localStorage.setItem('kratos.tour.v1', '1'))
    const sent = await (await call(page, '/messages', { text: 'z'.repeat(600) })).json() as { messageId: string }
    const wide = `| ${Array.from({ length: 14 }, (_, i) => `Columna_${i}_ancha`).join(' | ')} |\n|${'---|'.repeat(14)}\n| ${Array.from({ length: 14 }, () => 'valor_largo_sin_espacios').join(' | ')} |`
    await call(page, `/messages/${sent.messageId}/reply`, { text: `Respuesta:\n\n${wide}\n\n\`\`\`\n${'const x = 1; '.repeat(40)}\n\`\`\`\n\n${'w'.repeat(600)}` })
    await page.goto(`${service.origin}/chat#token=${token}`)
    await expect(page.locator('main table').first()).toBeVisible()
    await expect(page.locator('main pre').first()).toBeVisible()
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(sizes.scroll).toBe(sizes.client)
    if (browserName === 'chromium' && width === 1024) await page.screenshot({ path: '../docs/capturas-10/chat-sin-scroll-1024.png' })
  })
}
