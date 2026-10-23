import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Decision } from '@/lib/tasks'
import { DecisionDetails, DecisionOptions } from './DecisionOptions'

const decision: Decision = { id: 'd1', taskId: 't1', createdAt: '', state: 'open', chosenOptionId: null,
  reason: '¿Qué propuesta usamos?', evidence: [{ kind: 'informe', ref: 'Informe completo' }],
  options: [{ id: 'a', label: 'Opción A', description: 'Descripción completa que solo aparece al consultar la opción.' }],
}

describe('Tarjetas y detalle de una decisión', () => {
  it('usa Assets si falta el área y conserva descripción y elección por teclado', async () => {
    const choose = vi.fn()
    const user = userEvent.setup()
    render(<TooltipProvider><DecisionOptions decision={decision} disabled={false} onChoose={choose} /></TooltipProvider>)
    expect(screen.getByRole('img', { name: 'Assets' })).toBeInTheDocument()
    expect(screen.queryByText(decision.options[0].description)).not.toBeInTheDocument()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Opción A' })).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toHaveTextContent(decision.options[0].description)
    await user.keyboard('{Enter}')
    expect(choose).toHaveBeenCalledWith('a')
  })

  it('permite consultar la evidencia con teclado y Esc devuelve el foco a Detalle', async () => {
    const user = userEvent.setup()
    render(<DecisionDetails decision={decision} taskTitle="Tarea completa" />)
    await user.tab()
    await user.keyboard('{Enter}')
    const popup = await screen.findByRole('dialog', { name: 'Detalle de la decisión' })
    expect(popup).toHaveTextContent('Informe completo')
    expect(popup).toHaveTextContent('Tarea completa')
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Detalle' })).toHaveFocus()
  })
})
