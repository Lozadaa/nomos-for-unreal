import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AvatarGroup } from './AvatarGroup'

describe('grupo apilado de agentes', () => {
  it('muestra tres avatares y a partir del cuarto resume +N, con recuento real por proveedor', () => {
    const agents = Array.from({ length: 10 }, (_, i) => ({ id: `a-${i}`, provider: 'codex', name: `UI Worker${i ? ` ${i + 1}` : ''}`, state: i < 3 ? 'running' as const : 'idle' as const }))
    const { container } = render(<AvatarGroup agents={agents} size={48} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+7')).toHaveAttribute('aria-label', '7 agentes más')
    expect(screen.getByText('10 Codex · 3 activos')).toBeInTheDocument()
    expect(container.querySelector('.k-avatar-stack')?.children).toHaveLength(4)
    for (const avatar of screen.getAllByRole('img')) expect(avatar.style.getPropertyValue('--agent-size')).toBe('48px')
  })

  it('conserva nombres y ordinales y cuenta waiting como activo; no fabrica agentes vacíos', () => {
    const { rerender } = render(<AvatarGroup agents={[
      { id: 'a', provider: 'codex', name: 'UI Worker', ordinal: 1, state: 'waiting' },
      { id: 'b', provider: 'opencode', name: 'UI Worker 2', ordinal: 2, state: 'running' },
      { id: 'c', provider: 'codex', name: 'UI Master', state: 'idle' },
    ]} />)
    expect(screen.getByRole('img', { name: 'UI Worker 2 · OpenCode' }).querySelector('.k-agent-ordinal')).toHaveTextContent('2')
    expect(screen.getByText('2 Codex · 1 activo')).toBeInTheDocument()
    expect(screen.getByText('1 OpenCode · 1 activo')).toBeInTheDocument()
    expect(screen.queryByText(/^\+/)).toBeNull()
    rerender(<AvatarGroup agents={[]} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.queryByText(/activos?/)).toBeNull()
  })
})
