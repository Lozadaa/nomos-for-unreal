import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { flushSync } from 'react-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Ring } from './Ring'
import { Sparkline } from './Sparkline'
import { DiffBars } from './DiffBars'
import { ProductionMap, type MapTask } from './ProductionMap'
import { stages } from '@/lib/tasks'
import { animateUpdate } from '@/feel/transitions'

const tasks = (n: number): MapTask[] => Array.from({ length: n }, (_, i) => ({
  id: `seed-task-${String(i + 1).padStart(2, '0')}`, state: stages[i % 8],
  blockedReason: i === 10 ? 'No se pudo cerrar' : null, decisionId: i === 3 ? 'decision' : null,
}))
afterEach(() => { vi.unstubAllGlobals(); delete (document as unknown as { startViewTransition?: unknown }).startViewTransition })

describe('gráficos procedurales', () => {
  it('Ring limita excesos, negativos y valores no finitos; max cero deja el anillo vacío', () => {
    for (const [value, max, percent] of [[120, 100, 100], [-3, 100, 0], [60, 100, 60], [3, 0, 0], [NaN, 100, 0], [3, Infinity, 0]]) {
      const { unmount } = render(<Ring value={value} max={max} size={64} />)
      expect(screen.getByRole('img', { name: `${percent} %` })).toHaveAttribute('width', '64')
      expect(screen.getByText(`${percent}%`)).toBeVisible()
      expect(document.querySelector('[pathLength]')).toHaveAttribute('stroke-dashoffset', String(100 - percent))
      unmount()
    }
  })

  it('Sparkline identifica cada carril visible, comparte escala y tolera series vacías/constantes/no finitas', () => {
    const labels = ['Tareas', 'Ejecuciones', 'Reservas', 'Pruebas', 'Revisiones', 'Entregas', 'Decisiones']
    const values = [[0, 1, 2], [2, 4, 8], [], [3, 3], [NaN, Infinity], [1], [8, 4, 0]]
    const { container } = render(<Sparkline title="Actividad por hora" lanes={values.map((series, i) => ({ label: labels[i], values: series }))} />)
    expect(screen.getByRole('img', { name: 'Actividad por hora' })).toBeInTheDocument()
    expect(screen.getByText('Actividad por hora')).toBeVisible()
    for (const label of labels) expect(screen.getByText(label)).toBeVisible()
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(7)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    // El valor 2 tiene la misma altura relativa en los dos primeros carriles.
    const ys = (path: Element) => [...path.getAttribute('d')!.matchAll(/[ML]-?\d+ (-?\d+)/g)].map((match) => Number(match[1]))
    expect(ys(paths[0])[2]).toBe(ys(paths[1])[0] - 18)
  })

  it('Sparkline rechaza carriles sin etiqueta y títulos vacíos antes de dibujar', () => {
    for (const lane of [{ label: '', values: [1, 2] }, { label: '   ', values: [1, 2] }, { values: [1, 2] }]) {
      expect(() => renderToStaticMarkup(<Sparkline title="Actividad por hora" lanes={[lane as { label: string; values: number[] }]} />)).toThrow(/etiqueta/i)
    }
    for (const title of ['', '   ']) {
      expect(() => renderToStaticMarkup(<Sparkline title={title} lanes={[{ label: 'Tareas', values: [1, 2] }]} />)).toThrow(/título/i)
    }
  })

  it('Sparkline admite de uno a siete carriles y limita cada serie a 24 muestras', () => {
    for (const count of [0, 8]) {
      expect(() => renderToStaticMarkup(<Sparkline title="Actividad por hora" lanes={Array.from({ length: count }, (_, i) => ({ label: 'Carril ' + i, values: [1] }))} />)).toThrow(/1.*7/)
    }
    const { container } = render(<Sparkline title="Tareas por hora" lanes={[{ label: 'Tareas', values: Array.from({ length: 500 }, (_, i) => i) }]} />)
    const path = container.querySelector('path')!.getAttribute('d')!
    expect(path.match(/[ML]/g)).toHaveLength(24)
    expect(path).toMatch(/^M2 /)
    expect(path).toMatch(/L166 4$/)
  })

  it('DiffBars conserva signo y tooltip por archivo, admite el resumen numérico', () => {
    const { container, rerender } = render(<DiffBars added={[12, 0]} removed={[3, 8]} files={['a.ts', 'b.ts']} />)
    expect(container.querySelectorAll('g')).toHaveLength(2)
    expect(container.querySelector('title')).toHaveTextContent('a.ts · +12 / −3')
    expect(container.querySelectorAll('[stroke-dasharray]').length).toBe(2)
    rerender(<DiffBars added={12} removed={3} files={4} />)
    expect(screen.getByRole('img', { name: 'Cambios en 4 archivos' })).toBeInTheDocument()
  })

  it('DiffBars mantiene cada SVG ≤2 KB con muchos archivos y conserva sus nombres completos en tooltip', () => {
    const files = Array.from({ length: 100 }, (_, i) => `${i}-${'ruta/&'.repeat(80)}.tsx`)
    const { container } = render(<DiffBars added={files.map(() => 12)} removed={files.map(() => 8)} files={files} />)
    for (const svg of container.querySelectorAll('svg')) expect(new TextEncoder().encode(svg.outerHTML).length).toBeLessThanOrEqual(2048)
    expect(container.innerHTML).toContain('99-')
    expect(container.querySelector(`[title]`)?.getAttribute('title')).toContain(files[0])
  })

  it('cada gráfico es determinista y ≤ 2 KB incluso con las series de siete carriles', () => {
    for (const ui of [<Ring value={60} max={100} />, <Sparkline title="Actividad por hora" lanes={Array.from({ length: 7 }, (_, j) => ({ label: 'Carril ' + (j + 1), values: Array.from({ length: 500 }, (_, i) => (i + j) % 13) }))} />, <DiffBars added={[12, 4, 7]} removed={[3, 0, 8]} files={['a.ts', 'b.ts', 'c.ts']} />]) {
      const markup = renderToStaticMarkup(ui)
      expect(renderToStaticMarkup(ui)).toBe(markup)
      const svgs = [...markup.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/g)]
      expect(svgs.length).toBeGreaterThan(0)
      for (const [svg] of svgs) expect(new TextEncoder().encode(svg).length).toBeLessThanOrEqual(2048)
    }
  })
})

describe('mapa de producción', () => {
  it('0 tareas conserva los ocho nodos y 200 agrupa sin dibujar puntos', () => {
    const { container, rerender } = render(<ProductionMap tasks={[]} />)
    expect(screen.getAllByRole('button')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Pendiente: 0' })).toBeInTheDocument()
    rerender(<ProductionMap tasks={tasks(200)} />)
    expect(screen.getByRole('button', { name: 'Pendiente: 25' })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-point]')).toHaveLength(0)
  })

  it('12 tareas muestran puntos con formas de bloqueo/decisión, 13 solo contadores', () => {
    const { container, rerender } = render(<ProductionMap tasks={tasks(12)} />)
    expect(container.querySelectorAll('[data-point]')).toHaveLength(12)
    expect(screen.getByRole('img', { name: 'Bloqueada' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Espera decisión' })).toBeInTheDocument()
    rerender(<ProductionMap tasks={tasks(13)} />)
    expect(container.querySelectorAll('[data-point]')).toHaveLength(0)
  })

  it('un nodo filtra al pulsar y con Enter o Espacio', () => {
    const select = vi.fn()
    render(<ProductionMap tasks={tasks(2)} onSelect={select} />)
    const node = screen.getByRole('button', { name: 'Pendiente: 1' })
    fireEvent.click(node)
    fireEvent.keyDown(node, { key: 'Enter' })
    fireEvent.keyDown(node, { key: ' ' })
    expect(select.mock.calls).toEqual([['pendiente'], ['pendiente'], ['pendiente']])
  })

  it('cada nodo expone su etapa en tooltip sin agrandar el SVG', () => {
    const { container } = render(<ProductionMap tasks={[]} />)
    const node = screen.getByRole('button', { name: 'Pendiente: 0' })
    fireEvent.pointerEnter(node)
    expect(container.firstChild).toHaveAttribute('title', 'Pendiente: 0')
    fireEvent.pointerLeave(node)
    expect(container.firstChild).not.toHaveAttribute('title')
    fireEvent.focus(node)
    expect(container.firstChild).toHaveAttribute('title', 'Pendiente: 0')
  })

  it('al cambiar una etapa usa withViewTransition; con reduce cambia sin animar', async () => {
    const transition = vi.fn((update: () => void) => { update(); return { finished: Promise.resolve() } })
    Object.assign(document, { startViewTransition: transition })
    const first = tasks(1)
    const { rerender } = render(<ProductionMap tasks={first} />)
    expect(transition).not.toHaveBeenCalled()
    await act(async () => rerender(<ProductionMap tasks={[{ ...first[0], state: 'done' }]} />))
    expect(transition).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Hecha: 1' })).toBeInTheDocument()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    await act(async () => rerender(<ProductionMap tasks={first} />))
    expect(transition).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Pendiente: 1' })).toBeInTheDocument()
  })

  it('el mapa y la lista comparten una captura al actualizar juntos una etapa', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const captures: { update: () => void | Promise<void>; finish: () => void }[] = []
    const transition = vi.fn((update: () => void | Promise<void>) => {
      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      captures.push({ update, finish })
      // Como en el navegador, el callback se ejecuta después de que el llamador
      // haya registrado la transición activa; la captura se controla desde el test.
      return { finished }
    })
    Object.assign(document, { startViewTransition: transition })
    const first = tasks(1)
    const scene = (rows: MapTask[]) => <>
      <output data-testid="list-stage">{rows[0].state}</output>
      <ProductionMap tasks={rows} />
    </>
    const { rerender } = render(scene(first))
    let mutation!: Promise<void>
    await act(async () => {
      mutation = animateUpdate(() => flushSync(() => rerender(scene([{ ...first[0], state: 'done' }]))))
    })
    expect(captures).toHaveLength(1)

    let listDuringCapture: string | null = null
    let mapDuringCapture = false
    await act(async () => {
      await captures[0].update()
      listDuringCapture = screen.getByTestId('list-stage').textContent
      mapDuringCapture = Boolean(screen.queryByRole('button', { name: 'Hecha: 1' }))
    })
    await act(async () => { captures[0].finish(); await mutation })
    // Resolver también una captura adicional defectuosa evita dejar promesas
    // activas cuando el RED demuestre que antes se abrían dos transiciones.
    for (let i = 1; i < captures.length; i++) {
      await act(async () => { await captures[i].update(); captures[i].finish() })
    }

    expect(transition).toHaveBeenCalledOnce()
    expect(listDuringCapture).toBe('done')
    expect(mapDuringCapture).toBe(true)
    expect(screen.getByRole('button', { name: 'Hecha: 1' })).toBeInTheDocument()
  })

  it('markup determinista y ≤ 2 KB con 0, 12 y 200 tareas', () => {
    for (const count of [0, 12, 200]) {
      const ui = <ProductionMap tasks={tasks(count)} />
      const markup = renderToStaticMarkup(ui)
      expect(renderToStaticMarkup(ui)).toBe(markup)
      expect(new TextEncoder().encode(markup).length).toBeLessThanOrEqual(2048)
    }
  })

  it('12 decisiones o 12 bloqueos también caben en 2 KB', () => {
    for (const modifier of [{ decisionId: 'd' }, { blockedReason: 'bloqueada' }]) {
      for (const state of stages) {
        const markup = renderToStaticMarkup(<ProductionMap id="mapa-con-identificador-largo" tasks={tasks(12).map((t) => ({ ...t, state, decisionId: null, blockedReason: null, ...modifier }))} />)
        expect(new TextEncoder().encode(markup).length).toBeLessThanOrEqual(2048)
      }
    }
  })

  it('una captura aplazada no sobrescribe datos más recientes al activar movimiento reducido', async () => {
    let capture: (() => void) | undefined
    let finish!: () => void
    const transition = vi.fn((update: () => void) => { capture = update; return { finished: new Promise<void>((resolve) => { finish = resolve }) } })
    Object.assign(document, { startViewTransition: transition })
    const first = tasks(1)
    const { rerender } = render(<ProductionMap tasks={first} />)
    await act(async () => rerender(<ProductionMap tasks={[{ ...first[0], state: 'revisando' }]} />))
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    rerender(<ProductionMap tasks={[{ ...first[0], state: 'done' }]} />)
    await act(async () => { capture?.(); finish() })
    expect(screen.getByRole('button', { name: 'Hecha: 1' })).toBeInTheDocument()
  })

  it('revisa movimiento reducido otra vez después de esperar la transición de ruta', async () => {
    let finish!: () => void
    let reduce = false
    const router = { finished: new Promise<void>((resolve) => { finish = resolve }) }
    Object.assign(document, { activeViewTransition: router })
    const transition = vi.fn((update: () => void) => { update(); return { finished: Promise.resolve() } })
    Object.assign(document, { startViewTransition: transition })
    vi.stubGlobal('matchMedia', () => ({ matches: reduce }))
    const first = tasks(1)
    const { rerender } = render(<ProductionMap tasks={first} />)
    await act(async () => rerender(<ProductionMap tasks={[{ ...first[0], state: 'done' }]} />))
    expect(transition).not.toHaveBeenCalled()
    reduce = true
    await act(async () => finish())
    delete (document as unknown as { activeViewTransition?: unknown }).activeViewTransition
    expect(transition).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Hecha: 1' })).toBeInTheDocument()
  })

  it('dos mapas mantienen referencias locales distintas y cada SVG cabe en 2 KB', () => {
    const decisions = tasks(12).map((t) => ({ ...t, decisionId: 'd' }))
    const { container } = render(<><ProductionMap id="izquierda" tasks={decisions} /><ProductionMap id="derecha" tasks={decisions} /></>)
    const svgs = [...container.querySelectorAll('svg')]
    const ids = svgs.map((svg) => svg.querySelector('defs path')!.id)
    expect(new Set(ids).size).toBe(2)
    for (const [i, svg] of svgs.entries()) {
      expect([...svg.querySelectorAll('use')].every((marker) => marker.getAttribute('href') === `#${ids[i]}`)).toBe(true)
      expect(new TextEncoder().encode(svg.outerHTML).length).toBeLessThanOrEqual(2048)
    }
  })

  it('el mismo mapa genera markup idéntico en distinto orden y contexto de render', () => {
    const decisions = tasks(12).map((t) => ({ ...t, decisionId: 'd' }))
    const alone = renderToStaticMarkup(<ProductionMap tasks={decisions} />)
    const siblings = renderToStaticMarkup(<><span>Otro componente</span><ProductionMap tasks={decisions} /></>)
    expect(siblings.slice(siblings.indexOf('<div'))).toBe(alone)
  })
})
