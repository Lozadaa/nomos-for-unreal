import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Glyph } from './Glyph'
import { AgentAvatar } from './art/AgentAvatar'

it('identifica proveedores con texto único y punto de token sin geometría', () => {
  for (const [value, label] of Object.entries({ codex: 'Codex', claude: 'Claude', meshy: 'Meshy', blender: 'Blender', unreal: 'Unreal', kratos: 'Kratos', launcher: 'Launcher', desconocido: 'desconocido' })) {
    const { container, unmount } = render(<Glyph kind="provider" value={value} size={30} showLabel />)
    const pill = screen.getByRole('img', { name: label })
    expect(pill).toHaveTextContent(label)
    expect(screen.getAllByText(label)).toHaveLength(1)
    expect(pill).toHaveStyle({ minHeight: '30px', width: 'auto', fontSize: '11px', fontFamily: 'var(--k-font-mono)' })
    expect(container.querySelector('svg')).toBeNull()
    expect(pill.querySelector('[data-provider-dot]')).toHaveAttribute('aria-hidden', 'true')
    expect(pill.querySelector('[data-provider-dot]')?.getAttribute('style')).toContain('var(--')
    unmount()
  }
})

it('el avatar conserva llamadas antiguas sin inventar números de agente', () => {
  for (const [id, instance] of [['codex-2', undefined], ['opaque-id', 7], ['opaque-id', undefined]] as const) {
    const { container, unmount } = render(<AgentAvatar id={id} provider="codex" instance={instance} size={32} />)
    expect(screen.getByRole('img', { name: 'Codex' })).toHaveTextContent('Cx')
    expect(screen.getByRole('img').style.getPropertyValue('--agent-size')).toBe('32px')
    expect(container.querySelector('.k-agent-ordinal')).toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    unmount()
  }
})
