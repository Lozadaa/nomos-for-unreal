import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { decodePng } from '../../service/src/checks/png.ts'
import { compareBaseline, encodePng } from '../../service/src/checks/visual.ts'

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
  // título limpio en la captura (chromium); el de firefox se distingue para no repetir elemento
  const title = browserName === 'chromium' ? 'J1.6 Reacciones a los golpes' : 'J1.7 Derribo que llega al suelo'
  const task = await (await call(page, '/tasks', { title, area: 'gameplay', acceptance: ['El rival retrocede', 'Hay sonido de impacto'],
    spec: '## Qué\nLos golpes hacen retroceder al rival.\n\n## Por qué\nSensación de juego.' })).json() as { id: string }
  evidence(task.id)
  expect((await call(page, `/tasks/${task.id}/approval`, {})).status()).toBe(201)

  if (browserName === 'chromium') await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(url().replace('/#', '/aprobar#'))
  await expect(page.getByRole('heading', { name: 'Por aprobar', exact: true })).toBeVisible()
  const card = page.getByRole('article', { name: title })
  await expect(card).toBeVisible()
  const video = card.locator('video')
  await expect(video).toHaveAttribute('controls', '')
  expect(await video.evaluate((v: HTMLVideoElement) => v.autoplay)).toBe(false)
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0)
  if (browserName === 'chromium') {
    // para juzgar un golpe el vídeo se ve grande: todo el ancho útil de la tarjeta, hasta 1280 px, en 16:9
    const box = (await video.boundingBox())!, cardBox = (await card.boundingBox())!
    expect(box.width).toBe(1280)
    expect(Math.round(box.width / box.height * 100) / 100).toBeCloseTo(16 / 9, 1)
    expect(cardBox.width).toBeGreaterThan(1300); expect(cardBox.width).toBeLessThanOrEqual(1400)
    const strip = (await card.getByRole('list', { name: 'Imágenes' }).boundingBox())!
    expect(strip.y).toBeGreaterThan(box.y + box.height - 1)
  }
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

test('hito 25: un cierre de hito bloqueado sale en Por aprobar con su build y el motivo', async ({ page, browserName }) => {
  const title = browserName === 'chromium' ? 'Cierre J1 · Arena jugable' : 'Cierre J2 · Arena jugable'
  const task = await (await call(page, '/tasks', { title, area: 'qa', acceptance: ['Se juega una ronda entera'],
    spec: '## Qué\nBuild del día 1: la mecánica en bruto en la arena.\n\n## Por qué\nAlgo jugable cada día.' })).json() as { id: string }
  evidence(task.id)
  expect((await call(page, `/tasks/${task.id}/approval`, {})).status()).toBe(201)
  // lo que deja el cierre al bloquearse (task.closing_blocked «approval»)
  const db = new DatabaseSync(join(process.env.NOMOS_DATA!, 'nomos.db'))
  try { db.prepare('update tasks set wait_reason=? where id=?').run('Falta tu aprobación sobre la build jugable', task.id) } finally { db.close() }
  await page.goto(url().replace('/#', '/aprobar#'))
  const card = page.getByRole('article', { name: title })
  await expect(card.getByText('Falta tu aprobación sobre la build jugable')).toBeVisible()
  await expect(card.locator('video')).toHaveAttribute('controls', '')
  await expect(card.getByRole('button', { name: 'Aprobar' })).toBeVisible()
  if (browserName === 'chromium') { await card.scrollIntoViewIfNeeded(); mkdirSync('../docs/capturas-25', { recursive: true }); await page.screenshot({ path: '../docs/capturas-25/cierre-bloqueado-1366.png' }) }
})

test('hito 28: una línea base propuesta se ve con la actual y la diferencia; Aprobar la convierte en base', async ({ page, browserName }) => {
  const task = await (await call(page, '/tasks', { title: `Arena iluminada ${browserName}`, area: 'gameplay', acceptance: [], spec: '## Qué\nLuz nueva en la arena.' })).json() as { id: string }
  // propuesta = la captura real con una franja más clara; la diferencia la calcula la propia comparación del servicio
  const dir = join(process.env.NOMOS_DATA!, 'lineas-base-e2e', browserName), base = join(dir, 'docs', 'baseline'), name = browserName === 'chromium' ? 'map-L_Arena-1280x720' : 'map-L_Muelle-1280x720'
  mkdirSync(join(base, 'propuestas'), { recursive: true })
  const current = join(base, `${name}.png`), proposal = join(base, 'propuestas', `${name}.png`), diff = join(dir, `${name}-diferencia.png`)
  copyFileSync(join(docs, 'capturas-5b', 'pie-heroe-1280x720.png'), current)
  const image = decodePng(readFileSync(current))
  for (let y = 420; y < 560; y++) for (let x = 0; x < image.width; x++) for (let c = 0; c < 3; c++) image.data[(y * image.width + x) * 4 + c] = Math.min(255, image.data[(y * image.width + x) * 4 + c] + 60)
  writeFileSync(proposal, encodePng(image))
  expect(compareBaseline(proposal, base, name, 0.02, diff).result).toBe('failed')
  const db = new DatabaseSync(join(process.env.NOMOS_DATA!, 'nomos.db')), now = new Date().toISOString(), id = randomUUID()
  try {
    db.prepare(`insert into approvals(id,task_id,state,focus,created_at,updated_at,baseline) values(?,?,'pending','[]',?,?,?)`)
      .run(id, task.id, now, now, JSON.stringify({ name, proposal, baseline: current, current, diff }))
  } finally { db.close() }
  await page.goto(url().replace('/#', '/aprobar#'))
  const card = page.getByRole('article', { name: `Línea base: ${name.split('-').join(' ')}` })
  const shots = card.getByRole('region', { name: 'Línea base' })
  for (const alt of ['Propuesta', 'Actual', 'Diferencia'])
    await expect.poll(() => shots.getByRole('img', { name: alt }).evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1280)
  await expect(card.getByRole('button', { name: 'Rechazar' })).toBeVisible()
  if (browserName === 'chromium') { await card.scrollIntoViewIfNeeded(); mkdirSync('../docs/capturas-28', { recursive: true }); await page.screenshot({ path: '../docs/capturas-28/linea-base-por-aprobar-1366.png' }) }
  await card.getByRole('button', { name: 'Aprobar' }).click()
  await expect(card.getByText('Aprobada · ya es la línea base')).toBeVisible()
  await expect.poll(() => existsSync(proposal)).toBe(false)
  expect(readFileSync(current).equals(encodePng(image))).toBe(true)
})
