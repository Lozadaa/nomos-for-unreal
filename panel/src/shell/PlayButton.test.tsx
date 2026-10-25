import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { buildLabel, buildSource, elapsed, LastBuildLine, originNote, PlayButton } from './PlayButton'
import type { PlayInfo } from './usePlay'

const now = Date.parse('2026-10-24T23:30:00Z')
const build = { path: 'C:/Juego/Build/Windows-actual/Juego.exe', builtAt: '2026-10-24T23:18:00Z', size: 1, check: 'build', testRunId: 't1',
  task: { id: 'a', code: 'J1.6', title: 'J1.6 Golpe con retroceso' } }
const info = (over: Partial<PlayInfo> = {}): PlayInfo => ({ build, running: null, reason: null, lastPlayedBuiltAt: '2026-10-24T22:00:00Z', ...over })
const show = (play: PlayInfo, extra: Partial<Parameters<typeof PlayButton>[0]> = {}) => {
  const onPlay = vi.fn(), onStop = vi.fn()
  render(<TooltipProvider><PlayButton play={play} onPlay={onPlay} onStop={onStop} now={now} {...extra} /></TooltipProvider>)
  return { onPlay, onStop }
}

describe('PlayButton', () => {
  it('con build: «Jugar» activo, primario, late si la build es más nueva que la última partida', () => {
    const { onPlay } = show(info())
    const button = screen.getByRole('button', { name: 'Jugar' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('data-state', 'ready')
    expect(button).toHaveClass('bg-primary')
    expect(button).toHaveAttribute('data-fresh', 'true')
    fireEvent.click(button)
    expect(onPlay).toHaveBeenCalledOnce()
  })

  it('una build ya jugada no late', () => {
    show(info({ lastPlayedBuiltAt: build.builtAt }))
    expect(screen.getByRole('button', { name: 'Jugar' })).toHaveAttribute('data-fresh', 'false')
  })

  it('sin build: visible, desactivado y con el motivo en una línea', () => {
    const { onPlay } = show(info({ build: null, reason: 'Todavía no hay ninguna build' }))
    const button = screen.getByRole('button', { name: 'Jugar' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('data-state', 'none')
    expect(screen.getByText('Todavía no hay ninguna build')).toBeInTheDocument()
    fireEvent.click(button)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('arrancando: respuesta inmediata con «Arrancando…»', () => {
    show(info(), { starting: true })
    const button = screen.getByRole('button', { name: /Arrancando/ })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('data-state', 'starting')
  })

  it('jugando: verde con el tiempo transcurrido; pulsar detiene', () => {
    const { onStop, onPlay } = show(info({ running: { pid: 7, since: '2026-10-24T23:27:55Z' } }))
    const button = screen.getByRole('button', { name: /Jugando · 02:05 · Detener/ })
    expect(button).toHaveClass('bg-success')
    expect(button).toHaveAttribute('data-state', 'playing')
    fireEvent.click(button)
    expect(onStop).toHaveBeenCalledOnce()
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('nunca muestra rutas ni nombres de archivo', () => {
    show(info())
    expect(document.body.textContent).not.toMatch(/Juego\.exe|Windows-actual|C:/)
  })
})

describe('textos de la build', () => {
  it('tooltip: fecha, hace cuánto y de qué tarea o comprobación salió', () => {
    expect(buildSource(build)).toBe('J1.6')
    expect(buildSource({ ...build, task: { id: 'b', code: null, title: 'Empaquetar' } })).toBe('Empaquetar')
    expect(buildSource({ ...build, task: null })).toBe('comprobación de empaquetado')
    expect(buildSource({ ...build, task: null, check: null })).toBe('paquete del director')
    expect(buildLabel(build, now)).toMatch(/^Build del .+ \(hace 12 min\) · J1\.6$/)
  })
  it('tiempo transcurrido en mm:ss y h:mm:ss', () => {
    expect(elapsed('2026-10-24T23:29:51Z', now)).toBe('00:09')
    expect(elapsed('2026-10-24T21:29:00Z', now)).toBe('2:01:00')
  })
  it('Producción: «Última build: hace 12 min · J1.6» con su botón', () => {
    render(<TooltipProvider><LastBuildLine play={info()} onPlay={() => {}} onStop={() => {}} now={now} /></TooltipProvider>)
    expect(screen.getByText('Última build: hace 12 min · J1.6')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jugar' })).toBeInTheDocument()
  })
})

describe('origen de la build (hito 17)', () => {
  const line = (b: PlayInfo['build']) =>
    render(<TooltipProvider><LastBuildLine play={info({ build: b })} onPlay={() => {}} onStop={() => {}} now={now} /></TooltipProvider>)
  const origin = { commit: 'abcdef1234567', branch: 'main', builtAt: build.builtAt, task: null, run: null }

  it('anterior a main: aviso con el color de aviso de los tokens y Jugar sigue funcionando', () => {
    line({ ...build, origin, commit: origin.commit, stale: true })
    const note = screen.getByText('Esta build no incluye los últimos cambios de main')
    expect(note).toHaveClass('text-warning')
    expect(screen.getByRole('button', { name: 'Jugar' })).toBeEnabled()
    expect(originNote({ ...build, origin, stale: true })).toEqual({ text: 'Esta build no incluye los últimos cambios de main', tone: 'warning' })
  })

  it('al día con main: sin aviso ni «Origen desconocido»', () => {
    line({ ...build, origin, commit: origin.commit, stale: false })
    expect(screen.queryByText('Esta build no incluye los últimos cambios de main')).toBeNull()
    expect(screen.queryByText('Origen desconocido')).toBeNull()
    expect(originNote({ ...build, origin, stale: false })).toBeNull()
  })

  it('sin build-info.json: «Origen desconocido» discreto', () => {
    line({ ...build, origin: null })
    const note = screen.getByText('Origen desconocido')
    expect(note).toHaveClass('text-muted-foreground')
    expect(note).not.toHaveClass('text-warning')
  })

  it('el aviso nunca enseña el commit ni rutas', () => {
    line({ ...build, origin, commit: origin.commit, stale: true })
    expect(document.body.textContent).not.toMatch(/abcdef1|Windows-actual|build-info/)
  })
})
