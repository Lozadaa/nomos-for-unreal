// Mide INP de las acciones principales, frames largos durante las transiciones y tamaño del bundle, contra el servicio real sembrado.
// Uso (desde panel/, tras `npm run build`): node scripts/medir.ts   → escribe docs/medicion-8.json
import { chromium, type Page } from '@playwright/test'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'
import setup from '../e2e/global-setup.ts'
import teardown from '../e2e/global-teardown.ts'

type Entry = { id: number; dur: number }
type Frame = { dur: number; block: number }
const N = 8

const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? 0
const p = (v: number[], q: number) => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * q))] ?? 0

async function drain(page: Page): Promise<{ inp: number; frames: Frame[] }> {
  await page.waitForTimeout(700)
  const { entries, frames } = await page.evaluate(() => {
    const w = window as unknown as { __inp: Entry[]; __laf: Frame[] }
    const out = { entries: [...w.__inp], frames: [...w.__laf] }
    w.__inp.length = 0
    w.__laf.length = 0
    return out
  })
  // una interacción = todos los eventos con el mismo interactionId; su duración es la del más largo
  const byId = new Map<number, number>()
  for (const e of entries) byId.set(e.id, Math.max(byId.get(e.id) ?? 0, e.dur))
  return { inp: Math.max(0, ...byId.values()), frames }
}

async function session(rate: number) {
  const browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await context.newPage()
  if (rate > 1) await (await context.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate })
  await page.addInitScript(() => {
    const w = window as unknown as { __inp: unknown[]; __laf: unknown[] }
    w.__inp = []
    w.__laf = []
    new PerformanceObserver((list) => { for (const e of list.getEntries() as PerformanceEventTiming[]) if (e.interactionId) w.__inp.push({ id: e.interactionId, dur: e.duration }) })
      .observe({ type: 'event', durationThreshold: 16, buffered: true } as PerformanceObserverInit)
    try {
      new PerformanceObserver((list) => { for (const e of list.getEntries() as unknown as { duration: number; blockingDuration: number }[]) w.__laf.push({ dur: e.duration, block: e.blockingDuration }) })
        .observe({ type: 'long-animation-frame', buffered: true } as PerformanceObserverInit)
    } catch { /* sin long-animation-frame */ }
  })
  const base = process.env.KRATOS_URL!
  const goto = async (path: string) => { await page.goto(base.replace('/#', `${path}#`)); await page.waitForSelector('main'); await page.waitForTimeout(600); await drain(page) }
  const results: Record<string, { n: number; median: number; p75: number; max: number; longFrames: number; worstFrame: number; repeticionesConFrameLargo: number[] }> = {}
  const record = (name: string, runs: { inp: number; frames: Frame[] }[]) => {
    const inp = runs.map((r) => r.inp)
    const frames = runs.flatMap((r) => r.frames)
    results[name] = { n: runs.length, median: median(inp), p75: p(inp, 0.75), max: Math.max(...inp), longFrames: frames.filter((f) => f.dur > 50).length, worstFrame: Math.max(0, ...frames.map((f) => f.dur)), repeticionesConFrameLargo: runs.flatMap((r, i) => (r.frames.some((f) => f.dur > 50) ? [i] : [])) }
  }

  // 1 · abrir y cerrar el detalle
  await goto('/')
  let runs = []
  for (let i = 0; i < N; i++) {
    await page.getByRole('button', { name: /Definir salto|Diseñar HUD/ }).nth(i % 2).click()
    await page.getByRole('dialog').waitFor()
    runs.push(await drain(page))
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    runs.push(await drain(page))
  }
  record('abrir y cerrar el detalle', runs)

  // 2 · cambiar de vista
  runs = []
  for (let i = 0; i < N; i++) {
    await page.getByRole('link', { name: i % 2 ? 'Producción' : 'Actividad' }).click()
    runs.push(await drain(page))
  }
  record('cambiar de vista', runs)

  // 3 · filtrar por etapa
  await goto('/')
  runs = []
  for (let i = 0; i < N; i++) {
    await page.getByRole('button', { name: i % 2 ? /^Todas/ : /^Probando/ }).click()
    runs.push(await drain(page))
  }
  record('filtrar por etapa', runs)

  // 4 · enviar una petición (el clic en «Enviar a Kratos»; el servidor responde de verdad)
  await goto('/')
  runs = []
  for (let i = 0; i < N; i++) {
    await page.getByLabel('Título de la petición').fill(`Petición de medición ${i}`)
    await drain(page)
    await page.getByRole('button', { name: 'Enviar a Kratos' }).click()
    runs.push(await drain(page))
  }
  record('enviar una petición', runs)

  // 5 · elegir una decisión (la semilla se restaura entre pruebas)
  runs = []
  const token = new URLSearchParams(new URL(base).hash.slice(1)).get('token')!
  for (let i = 0; i < 5; i++) {
    await page.request.post(new URL(base).origin + '/seed', { headers: { Authorization: `Bearer ${token}` }, data: { force: true } })
    await goto('/decisiones')
    await page.getByRole('button', { name: 'Candidato 2' }).click()
    runs.push(await drain(page))
  }
  record('elegir una decisión', runs)

  await browser.close()
  return results
}

const dist = resolve(import.meta.dirname, '../dist/assets')
const files = readdirSync(dist).filter((f) => /\.(js|css)$/.test(f))
const bundle = Object.fromEntries(files.map((f) => [f, { bytes: readFileSync(resolve(dist, f)).length, gzip: gzipSync(readFileSync(resolve(dist, f))).length }]))

setup()
try {
  const out = { fecha: new Date().toISOString(), navegador: 'Google Chrome (headless), 1366×768', sinReducir: await session(1), cpu4x: await session(4), bundle }
  writeFileSync(resolve(import.meta.dirname, '../../docs/medicion-8.json'), JSON.stringify(out, null, 2) + '\n')
  console.log(JSON.stringify(out, null, 2))
} finally { teardown() }
