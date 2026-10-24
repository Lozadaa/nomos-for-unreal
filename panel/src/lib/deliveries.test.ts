import { describe, expect, it } from 'vitest'
import type { Artifact } from './tasks'
import { deliveryType, taskSections, verdict, viewLabel } from './deliveries'

const a = (id: string, kind: string, path: string, provenance: Record<string, unknown> = {}, extra: Partial<Artifact> = {}): Artifact =>
  ({ id, kind, path, taskId: 't1', license: null, createdAt: `2026-10-24T10:00:${id.padStart(2, '0')}Z`, provenance, ...extra })
const run = { check: 'map', testRunId: 'r1', resolution: '1280x720' }
const views = ['player', 'left', 'right', 'top'].map((view, i) => a(String(10 + i), 'screenshot', `C:/k/r1/map-${view}.png`, { ...run, view }))
const sheet = a('20', 'screenshot', 'C:/k/r1/map-hoja.jpg', { ...run, sheet: true })

describe('Entregas para mirar (hito 10)', () => {
  it('tipos del filtro: capturas, vídeos, modelos e informes (registros y compilaciones son informes)', () => {
    expect([a('1', 'screenshot', 'x.png'), a('2', 'video', 'x.mp4'), a('3', 'model', 'x.glb'), a('4', 'report', 'log.txt', { check: 'cpp' }),
      a('5', 'build', 'x.exe'), a('6', 'report', 'review.json')].map(deliveryType)).toEqual(['capturas', 'videos', 'modelos', 'informes', 'informes', 'informes'])
  })

  it('una comprobación con varias vistas es una sola tarjeta: portada la hoja, galería con las vistas en orden', () => {
    const [section] = taskSections([...views].reverse().concat(sheet), () => 'Plaza')
    expect(section.visuals).toHaveLength(1)
    expect(section.visuals[0].cover.id).toBe('20')
    expect(section.visuals[0].items.map((i) => i.provenance?.view)).toEqual(['player', 'left', 'right', 'top'])
    expect(views.map(viewLabel)).toEqual(['Jugador', '3/4 izquierda', '3/4 derecha', 'Picado'])
  })

  it('por tarea: la más reciente arriba; dentro, visuales, modelos e informes por separado', () => {
    const older = a('1', 'screenshot', 'x.png', {}, { taskId: 't0' })
    const list = [older, a('2', 'model', 'm.glb'), a('3', 'report', 'log.txt', { check: 'cpp', result: 'passed' }), a('4', 'video', 'v.mp4')]
    const sections = taskSections(list, (id) => id === 't1' ? 'Salto' : 'HUD')
    expect(sections.map((s) => s.title)).toEqual(['Salto', 'HUD'])
    expect(sections[0].visuals.map((v) => v.cover.kind)).toEqual(['video'])
    expect(sections[0].models.map((m) => m.id)).toEqual(['2'])
    expect(sections[0].reports.map((r) => r.id)).toEqual(['3'])
  })

  it('veredicto de una línea, determinista, sin volcar el informe', () => {
    expect(verdict(a('1', 'report', 'log.txt', { check: 'cpp', result: 'passed' }), 'Building…\nResultado correcto\n')).toBe('Compilación C++ · 0 errores')
    expect(verdict(a('1', 'report', 'log.txt', { check: 'cpp', result: 'failed' }), "Vida.cpp(12): error C2065\nVida.cpp(13): error C2143\nfin")).toBe('Compilación C++ · 2 errores')
    expect(verdict(a('1', 'report', 'log.txt', { check: 'map', result: 'passed' }))).toBe('Mapa · correcto')
    expect(verdict(a('1', 'report', 'log.txt', { check: 'build', result: 'failed' }))).toBe('Empaquetado · falló')
    expect(verdict(a('1', 'report', 'review-6cb4.json', { kind: 'REVIEW', approved: true, findings: [] }))).toBe('Revisión · aprobada')
    expect(verdict(a('1', 'report', 'review-6cb4.json', { kind: 'REVIEW', approved: false, findings: [{}, {}] }))).toBe('Revisión · 2 hallazgos')
    expect(verdict(a('1', 'report', 'review.json', { kind: 'REVIEW', approved: false }), JSON.stringify({ findings: [{}, {}, {}] }))).toBe('Revisión · 3 hallazgos')
    expect(verdict(a('1', 'report', 'qa.md', { label: 'QA visual · informe' }), '# QA\n\nVeredicto: aprobado\n')).toBe('QA visual · aprobado')
    expect(verdict(a('1', 'report', 'r.json', { label: 'QA visual · informe' }), JSON.stringify({ approved: false, issues: [1, 2, 3] }))).toBe('QA visual · 3 problemas')
    expect(verdict(a('1', 'build', 'C:/B/Esquina.exe', { check: 'build', label: 'Empaquetado · Esquina.exe' }))).toBe('Empaquetado · ejecutable listo')
    expect(verdict(a('1', 'report', 'notas.md', { label: 'Informe de fps' }), '# fps\nmedia 58')).toBe('Informe de fps')
  })
})
