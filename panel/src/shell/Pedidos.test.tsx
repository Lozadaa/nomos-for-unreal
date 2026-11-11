import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Pedidos } from './Pedidos'

const pedido = { id: 'tierra-ruedo', para: 'PBRGen', prompt: 'packed red earth, seamless', encargo: 'a round ring of earth about 6 m wide', destino: 'Importar/Materiales/tierra-ruedo', sustituto: 'two-scale noise', creado: '2026-11-11T18:00:00Z' }

describe('Pedidos', () => {
  it('sin pedidos no pinta nada', () => {
    const { container } = render(<Pedidos items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('con un pedido: alerta con la herramienta, el prompt, la carpeta y el sustituto; copiar lo lleva al portapapeles', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Pedidos items={[pedido]} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveAccessibleName('The game needs one thing only you can make')
    expect(alert).toHaveClass('bg-primary')
    expect(screen.getByRole('heading', { name: 'tierra-ruedo · in PBRGen' })).toBeInTheDocument()
    expect(screen.getByText('packed red earth, seamless')).toBeInTheDocument()
    expect(screen.getByText('Importar/Materiales/tierra-ruedo/')).toBeInTheDocument()
    expect(screen.getByText('two-scale noise')).toBeInTheDocument()
    expect(screen.getByText(/a round ring of earth about 6 m wide/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
    expect(writeText).toHaveBeenCalledWith('packed red earth, seamless')
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })

  it('con varios: los cuenta en el título y no enseña «Used meanwhile» si no hay sustituto', () => {
    render(<Pedidos items={[pedido, { ...pedido, id: 'madera', sustituto: null }]} />)
    expect(screen.getByRole('alert')).toHaveAccessibleName('The game needs 2 things only you can make')
    expect(screen.getAllByText('Used meanwhile')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Copy prompt' })).toHaveLength(2)
  })
})
