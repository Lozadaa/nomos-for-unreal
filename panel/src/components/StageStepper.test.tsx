import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StageStepper } from './StageStepper'
import { stageLabel, stages } from '@/lib/tasks'

const task = (over = {}) => ({ state: 'implementando' as const, blockedReason: null, decisionId: null, ...over })

describe('StageStepper', () => {
  it('identifica las ocho etapas con glifos y muestra el nombre solo en la etapa activa', () => {
    render(<StageStepper task={task()} />)
    expect(screen.getAllByRole('img').map((node) => node.getAttribute('aria-label'))).toEqual(stages.map((stage) => stageLabel[stage]))
    for (const stage of stages) {
      const name = screen.getByText(stageLabel[stage])
      expect(name.classList.contains('sr-only')).toBe(stage !== 'implementando')
    }
  })

  it('marca la etapa actual y deja las demás sin marcar', () => {
    render(<StageStepper task={task()} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.getByText('Implementando').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Pendiente').closest('li')).not.toHaveAttribute('aria-current')
  })

  it('bloqueada no pierde la etapa: la conserva y la marca', () => {
    render(<StageStepper task={task({ blockedReason: 'Falta el pack de texturas.' })} />)
    const current = screen.getByText(/Implementando/).closest('li')!
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveAttribute('data-blocked')
    expect(screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-blocked'))).toHaveLength(1)
  })

  it('espera decisión también conserva la etapa', () => {
    render(<StageStepper task={task({ state: 'preparada', blockedReason: 'Elegir', decisionId: 'd1' })} />)
    const current = screen.getByText(/Preparada/).closest('li')!
    expect(current).toHaveAttribute('aria-current', 'step')
    expect(current).toHaveAttribute('data-decision')
    expect(current).not.toHaveAttribute('data-blocked')
  })
})
