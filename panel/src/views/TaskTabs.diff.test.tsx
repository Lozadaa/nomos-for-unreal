import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Task, TaskDetail } from '@/lib/tasks'

vi.mock('@/api', () => ({ api: vi.fn(), ApiError: class extends Error { status = 0 } }))
import { api } from '@/api'
import { resetStore } from '@/store'
import { ChangesTab } from './TaskTabs'

const task = { id: 't1', title: 'Cámara', scope: ['Source/Cam'] } as unknown as Task
const detail: TaskDetail = {
  task, events: [], artifacts: [], testRuns: [], decision: null,
  runs: [{ id: 'r1', taskId: task.id, role: 'implementacion', provider: 'codex', state: 'running', startedAt: '', finishedAt: null, summary: null }],
}
const patch = [
  'diff --git a/Source/Cam/A.cpp b/Source/Cam/A.cpp', '--- a/Source/Cam/A.cpp', '+++ b/Source/Cam/A.cpp', '@@ -1 +1 @@', '-a', '+b', '',
  'diff --git a/Config/B.ini b/Config/B.ini', '--- a/Config/B.ini', '+++ b/Config/B.ini', '@@ -1 +1 @@', '-x', '+y', '',
].join('\n')

beforeEach(() => { resetStore(); vi.mocked(api).mockReset() })
afterEach(() => { cleanup(); resetStore() })

describe('Cambios · DiffBars con stat verificado', () => {
  it('representa el agregado de resúmenes reales, conserva el stat y no cuenta barras ni líneas del patch', async () => {
    const stat = ' Source/Cam/A.cpp | 39 +++--\n Texture.uasset | Bin 0 -> 128 bytes\n 2 files changed, 32 insertions(+), 7 deletions(-)\n /dev/null => New.cpp | 8 ++++\n 1 file changed, 8 insertions(+)\n'
    vi.mocked(api).mockResolvedValue({ stat, patch })
    const { container } = render(<ChangesTab detail={detail} />)
    const chart = await screen.findByRole('img', { name: 'Cambios en 3 archivos' })
    expect(chart.querySelector('title')).toHaveTextContent('3 archivos · +40 / −7')
    expect(container.querySelector('pre')?.textContent).toBe(stat)
    const alert = screen.getByRole('alert', { name: 'Archivos fuera del alcance declarado' })
    expect(alert).toHaveTextContent('Config/B.ini')
    await userEvent.setup().selectOptions(screen.getByLabelText('Filtrar por archivo'), 'Config/B.ini')
    expect(screen.queryByText('+b')).toBeNull()
    expect(screen.getByText('+y')).toBeInTheDocument()
    expect(chart.querySelector('title')).toHaveTextContent('+40 / −7')
  })

  it('conserva un cambio solo binario en el gráfico aunque el patch esté vacío', async () => {
    vi.mocked(api).mockResolvedValue({ stat: ' Texture.uasset | Bin 0 -> 128 bytes\n 1 file changed\n', patch: '' })
    render(<ChangesTab detail={detail} />)
    const chart = await screen.findByRole('img', { name: 'Cambios en 1 archivos' })
    expect(chart.querySelector('title')).toHaveTextContent('1 archivos · +0 / −0')
    expect(screen.queryByText('El worker aún no ha cambiado archivos')).not.toBeInTheDocument()
  })

  it('sin resumen verificable muestra stat y patch sin fabricar un gráfico', async () => {
    const stat = ' Source/Cam/A.cpp | 2 +-\n'
    vi.mocked(api).mockResolvedValue({ stat, patch })
    const { container } = render(<ChangesTab detail={detail} />)
    await screen.findByText('+b')
    expect(container.querySelector('pre')?.textContent).toBe(stat)
    expect(screen.queryByRole('img', { name: /Cambios en/ })).not.toBeInTheDocument()
  })
})
