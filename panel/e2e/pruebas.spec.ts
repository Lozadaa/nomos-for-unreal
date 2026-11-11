import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test, type Page } from '@playwright/test'

const url = () => process.env.NOMOS_URL!
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(new URL(url()).origin + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1'))
})

test('Pruebas: «Lanzar pruebas» encola checks.run y la fila aparece por SSE sin recargar', async ({ page }, info) => {
  const title = `Pruebas desde el panel ${info.project.name}`
  const created = await call(page, '/tasks', { title, spec: 'Documentar', area: 'qa', acceptance: ['check: pruebas'] })
  expect(created.status()).toBe(201)
  const task = await created.json() as { id: string }
  // run implementador terminado sin worktree: el diff está vacío y checks.run registra «el diff no toca Unreal» sin abrir el editor
  const db = new DatabaseSync(join(process.env.NOMOS_DATA!, 'nomos.db'))
  const now = new Date().toISOString()
  db.prepare(`insert into runs(id,created_at,updated_at,task_id,role,provider,attempt,state,started_at,finished_at,summary,skills,metadata)
    values(?,?,?,?,'implementacion','claude',1,'done',?,?,'Hecho','[]','{}')`).run(`e2e-run-${task.id}`, now, now, task.id, now, now)
  db.close()
  await page.goto(url().replace('/#', '/produccion#'))
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await page.getByRole('tab', { name: 'Pruebas' }).click()
  await expect(page.getByText('Esta tarea aún no tiene pruebas')).toBeVisible()
  await page.getByRole('button', { name: 'Run checks' }).click()
  const table = page.getByRole('table', { name: 'Pruebas' })
  await expect(table.getByRole('cell', { name: 'Sin Unreal' })).toBeVisible({ timeout: 15_000 })
  await expect(table.getByText('Omitida')).toBeVisible()
})
