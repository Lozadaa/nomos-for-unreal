import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

// Hito 24: cada run registra sus tokens y el panel los enseña por tarea y en la cabecera de Producción.
const url = () => process.env.NOMOS_URL!
const origin = () => new URL(url()).origin
const token = () => new URLSearchParams(new URL(url()).hash.slice(1)).get('token')!
const call = (page: Page, path: string, data?: unknown) =>
  page.request.fetch(origin() + path, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token()}` }, data })
test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('nomos.tour.v1', '1')) })

/** Dos runs cerradas (opus implementa, sonnet revisa) con su fila `tokens` en spends, como las deja `run.tokens`. */
function measured(taskId: string) {
  const db = new DatabaseSync(join(process.env.NOMOS_DATA!, 'nomos.db')), now = new Date().toISOString()
  try {
    const run = db.prepare(`insert into runs(id,created_at,updated_at,task_id,role,provider,model,session_ref,attempt,state,started_at,finished_at,summary,skills,metadata)
      values(?,?,?,?,?,'claude',null,null,1,'done',?,?,?,'[]',?)`)
    const spend = db.prepare(`insert into spends(id,created_at,updated_at,budget_id,run_id,kind,amount,note) values(?,?,?,'seed-budget-workspace',?,'tokens',?,?)`)
    for (const [role, model, amount, turns, summary] of [['implementacion', 'opus', 1_284_000, 42, 'Implementado'], ['revisor', 'sonnet', 312_000, 9, 'Aprobado']] as const) {
      const id = randomUUID()
      run.run(id, now, now, taskId, role, now, now, summary, JSON.stringify({ model, sessionId: randomUUID() }))
      spend.run(randomUUID(), now, now, id, amount, JSON.stringify({ input: 900, output: 4000, cacheRead: amount - 1000, cacheWrite: 100, turns, model: `claude-${model}-4-8` }))
    }
  } finally { db.close() }
}

test('la ficha enseña los tokens por run y el total de la tarea; Producción, el del proyecto con reparto por rol', async ({ page, browserName }) => {
  const task = await (await call(page, '/tasks', { title: `J2.1 Bloqueo con escudo · ${browserName}`, area: 'gameplay', acceptance: ['El escudo para el golpe'],
    spec: '## Qué\nEl jugador bloquea con el escudo.' })).json() as { id: string }
  measured(task.id)
  const status = await (await call(page, '/status')).json() as { tokens: { total: number; porRol: Record<string, number> } }
  expect(status.tokens.porRol.implementacion).toBeGreaterThanOrEqual(1_284_000)
  await page.goto(url().replace('/#', `/produccion?tarea=${task.id}#`))
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Tokens: 1,3 M · 42 turnos · opus')).toBeVisible()
  await expect(sheet.getByText('Tokens: 0,3 M · 9 turnos · sonnet')).toBeVisible()
  await expect(sheet.getByText('Total de la tarea: 1,6 M de tokens')).toBeVisible()
  const header = page.getByText(/^Tokens del proyecto: \d+,\d M$/)
  await expect(header).toBeVisible()
  await expect(header).toHaveAttribute('title', /implementacion: \d+,\d M · revisor: \d+,\d M/)
  if (browserName === 'chromium') await page.screenshot({ path: '../docs/capturas-24/tokens-1366.png' })
})
