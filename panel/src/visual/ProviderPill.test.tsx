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

it('identifica instancias por sufijo o valor explícito y documenta fallback 1', () => {
  for (const [id, instance, label] of [['codex-2', undefined, 'Codex 2'], ['opaque-id', 7, 'Codex 7'], ['opaque-id', undefined, 'Codex 1']] as const) {
    const { container, unmount } = render(<AgentAvatar id={id} provider="codex" instance={instance} size={32} />)
    expect(screen.getByRole('img', { name: label })).toHaveTextContent(label)
    expect(screen.getByRole('img')).toHaveStyle({ minHeight: '32px', width: 'auto' })
    expect(container.querySelector('svg')).toBeNull()
    unmount()
  }
})
