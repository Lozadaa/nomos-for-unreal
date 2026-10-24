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
  it('solo la opción recomendada lleva el acento y solo la que tiene miniatura propia muestra imagen', () => {
    const rich: Decision = { ...decision, options: [
      { id: 'a', label: 'Caballero', description: 'Del catálogo', thumbnail: '/catalog/c1/thumbnail', recommended: true },
      { id: 'b', label: 'Buscar otro', description: 'Volver a buscar' }] }
    render(<TooltipProvider><DecisionOptions decision={rich} disabled={false} onChoose={() => {}} /></TooltipProvider>)
    const first = screen.getByRole('button', { name: 'Caballero' }), second = screen.getByRole('button', { name: 'Buscar otro' })
    expect(first).toHaveAttribute('data-recommended')
    expect(first.className).toContain('border-primary')
    expect(second).not.toHaveAttribute('data-recommended')
    expect(second.className).not.toContain('border-primary')
    expect(screen.getByRole('button', { name: 'Ver Caballero a tamaño completo' }).querySelector('img')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Ver Buscar otro a tamaño completo' })).toBeNull()
  })

  it('abrir la miniatura en el visor no elige la opción', async () => {
    const choose = vi.fn()
    const user = userEvent.setup()
    const rich: Decision = { ...decision, options: [{ id: 'a', label: 'Caballero', description: 'Del catálogo', thumbnail: '/catalog/c1/thumbnail' }] }
    render(<TooltipProvider><DecisionOptions decision={rich} disabled={false} onChoose={choose} /></TooltipProvider>)
    await user.click(screen.getByRole('button', { name: 'Ver Caballero a tamaño completo' }))
    expect(await screen.findByRole('dialog', { name: 'Caballero' })).toBeInTheDocument()
    expect(choose).not.toHaveBeenCalled()
  })

  it('las opciones son tarjetas de texto: ningún icono repetido, la descripción en el tooltip y elección por teclado', async () => {
    const choose = vi.fn()
    const user = userEvent.setup()
    const two: Decision = { ...decision, options: [...decision.options, { id: 'b', label: 'Opción B', description: 'Otra descripción' }] }
    const { container } = render(<TooltipProvider><DecisionOptions decision={two} area="assets" disabled={false} onChoose={choose} /></TooltipProvider>)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(container.querySelectorAll('svg')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Opción A' })).toHaveAttribute('aria-description', decision.options[0].description)
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
