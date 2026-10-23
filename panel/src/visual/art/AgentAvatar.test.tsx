import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentAvatar } from './AgentAvatar'

describe('avatar por implementador', () => {
  it('muestra los ocho monogramas sin exponerlos de nuevo al lector', () => {
    for (const [provider, label, monogram] of [
      ['codex', 'Codex', 'Cx'], ['claude', 'Claude', 'Cl'], ['opencode', 'OpenCode', 'Oc'],
      ['meshy', 'Meshy', 'Me'], ['blender', 'Blender', 'Bl'], ['unreal', 'Unreal', 'Un'],
      ['kratos', 'Kratos', 'Kr'], ['launcher', 'Launcher', 'La'],
    ]) {
      const { container, unmount } = render(<AgentAvatar provider={provider} name="UI Worker" />)
      const avatar = screen.getByRole('img', { name: `UI Worker · ${label}` })
      expect(avatar).toHaveAttribute('title', label)
      expect(avatar).toHaveAttribute('data-provider', provider)
      expect(avatar).toHaveClass('k-agent-avatar')
      expect(avatar.querySelector('.k-agent-monogram')).toHaveTextContent(monogram)
      expect(avatar.querySelector('.k-agent-monogram')).toHaveAttribute('aria-hidden', 'true')
      expect(container.querySelector('[data-provider-dot],svg')).toBeNull()
      expect(avatar.textContent).toBe(monogram)
      unmount()
    }
  })

  it('expone proveedor sin nombre y conserva tamaños 24, 32 y 48', () => {
    for (const size of [24, 32, 48]) {
      const { unmount } = render(<AgentAvatar provider="codex" size={size} />)
      const avatar = screen.getByRole('img', { name: 'Codex' })
      expect(avatar.style.getPropertyValue('--agent-size')).toBe(`${size}px`)
      expect(avatar.style.getPropertyValue('--agent-color')).toMatch(/^var\(--/)
      expect(avatar).toHaveAttribute('data-state', 'idle')
      expect(avatar.querySelector('.k-agent-ordinal')).toBeNull()
      unmount()
    }
  })

  it('distingue running, waiting e idle para anillos CSS sin animación JS', () => {
    for (const state of ['running', 'waiting', 'idle'] as const) {
      const { unmount } = render(<AgentAvatar provider="claude" state={state} />)
      expect(screen.getByRole('img')).toHaveAttribute('data-state', state)
      expect(screen.getByRole('img').getAttribute('style')).not.toMatch(/animation|border|background|font|radius/)
      unmount()
    }
  })

  it('solo dibuja ordinal cuando el caller lo pide por duplicados vivos; id e instance no lo inventan', () => {
    const { rerender } = render(<AgentAvatar id="codex-12" instance={12} provider="codex" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Codex')
    expect(screen.getByRole('img')).toHaveTextContent('Cx')
    expect(screen.getByRole('img').querySelector('.k-agent-ordinal')).toBeNull()
    rerender(<AgentAvatar provider="codex" name="UI Worker" ordinal={1} state="running" />)
    expect(screen.getByRole('img').querySelector('.k-agent-ordinal')).toHaveTextContent('1')
    expect(screen.getByRole('img').querySelector('.k-agent-ordinal')).toHaveAttribute('aria-hidden', 'true')
    rerender(<AgentAvatar provider="codex" ordinal={0} />)
    expect(screen.getByRole('img').querySelector('.k-agent-ordinal')).toBeNull()
  })
})
