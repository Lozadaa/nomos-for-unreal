import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

// Hito 22: «una sección por aprobar con imágenes y video por elemento para aprobar y yo viéndolo doy mi opinión o mi cierre».
const url = () => process.env.NOMOS_URL!
const origin = () => new URL(url()).origin
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(origin() + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })
const docs = resolve(import.meta.dirname, '../../docs')
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

/** Evidencia de fixture (un vídeo y una captura reales de los docs) escrita en la base del servicio de prueba. */
function evidence(taskId: string) {
  const data = process.env.NOMOS_DATA!, dir = join(data, 'artifacts', 'aprobar-e2e')
  mkdirSync(dir, { recursive: true })
  copyFileSync(join(docs, 'capturas-5b', 'manny-ataque-1280x720.mp4'), join(dir, `${taskId}.mp4`))
  copyFileSync(join(docs, 'capturas-hito0', 'intercambio.png'), join(dir, `${taskId}.png`))
  const db = new DatabaseSync(join(data, 'nomos.db')), now = new Date().toISOString()
  try {
    const insert = db.prepare(`insert into artifacts(id,created_at,updated_at,task_id,run_id,kind,path,preview_path,provenance,license) values(?,?,?,?,null,?,?,null,?,null)`)
    insert.run(randomUUID(), now, now, taskId, 'video', `aprobar-e2e/${taskId}.mp4`, JSON.stringify({ label: 'Animación · ataque', seconds: 4 }))
    insert.run(randomUUID(), now, now, taskId, 'screenshot', `aprobar-e2e/${taskId}.png`, JSON.stringify({ check: 'map', view: 'player', resolution: '1280x720' }))
  } finally { db.close() }
}

test('Por aprobar enseña vídeo e imágenes por elemento; comentar y aprobar responden en el acto', async ({ page, browserName }) => {
  const title = `J1.6 Reacciones a los golpes (${browserName}) ${Date.now() % 100000}`
  const task = await (await call(page, '/tasks', { title, area: 'gameplay', acceptance: ['El rival retrocede', 'Hay sonido de impacto'],
    spec: '## Qué\nLos golpes hacen retroceder al rival.\n\n## Por qué\nSensación de juego.' })).json() as { id: string }
  evidence(task.id)
  expect((await call(page, `/tasks/${task.id}/approval`, {})).status()).toBe(201)

  if (browserName === 'chromium') await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(url().replace('/#', '/aprobar#'))
  await expect(page.getByRole('link', { name: /Por aprobar/ })).toHaveAttribute('aria-current', 'page')
  const card = page.getByRole('article', { name: title })
  await expect(card).toBeVisible()
  const video = card.locator('video')
  await expect(video).toHaveAttribute('controls', '')
  expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(false)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  await expect(card.getByRole('list', { name: 'Imágenes' }).getByRole('img')).toBeVisible()
  await expect(card.getByText('El rival retrocede')).toBeVisible()
  await expect(card).not.toContainText(/\.(mp4|png)\b|[0-9a-f]{8}-[0-9a-f]{4}/)
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-22/por-aprobar-1920.png' })

  await card.getByRole('textbox', { name: /Comentario sobre/ }).fill('El destello del golpe me gusta')
  await card.getByRole('button', { name: 'Comentar' }).click()
  await expect(card.getByText('El destello del golpe me gusta')).toBeVisible()
  await card.getByRole('button', { name: 'Aprobar' }).click()
  await expect(card.getByText('Aprobada · sigue a integración')).toBeVisible()

  await expect.poll(async () => {
    const list = await (await call(page, '/approvals')).json() as { items: { taskId: string; state: string; comments: unknown[] }[] }
    const item = list.items.find((i) => i.taskId === task.id)
    return [item?.state, item?.comments.length]
  }).toEqual(['approved', 1])
})
