import { describe, expect, it } from 'vitest'
import { agentName, assignAgentNames } from './agentName'

describe('nombres cortos de agentes', () => {
  it('traduce la tabla completa de áreas', () => {
    for (const [area, name] of Object.entries({ ui: 'UI', gameplay: 'Gameplay', escenarios: 'Level', assets: 'Assets', animacion: 'Anim', audio: 'Audio', qa: 'QA', builds: 'Builds' })) {
      expect(agentName('implementacion', area)).toBe(`${name} Worker`)
    }
  })

  it('traduce roles y aliases heredados con director sin área', () => {
    for (const [role, name] of Object.entries({ implementacion: 'Worker', revisor: 'Master', arte: 'Artist', qa: 'Tester', integrador: 'Builder', coordinador: 'Lead', desarrollador: 'Worker', implementador: 'Worker', generador: 'Artist' })) {
      expect(agentName(role, 'ui')).toBe(`UI ${name}`)
    }
    expect(agentName('director', 'ui')).toBe('Nomos')
    expect(agentName('desconocido', 'ui')).toBe('UI Worker')
    expect(agentName(undefined, undefined)).toBe('Project Worker')
    expect(agentName('constructor', 'constructor')).toBe('Project Worker')
  })

  it('añade al texto solo un ordinal mayor que uno', () => {
    expect(agentName('implementacion', 'ui', 1)).toBe('UI Worker')
    expect(agentName('implementacion', 'ui', 2)).toBe('UI Worker 2')
    expect(agentName('director', 'ui', 2)).toBe('Nomos 2')
  })

  it('numera solo nombres duplicados en running/waiting, sin contar terminados ni libres', () => {
    const agents = [
      { id: 'done', role: 'implementacion', area: 'ui', state: 'done', provider: 'codex' },
      { id: 'one', role: 'implementacion', area: 'ui', state: 'running', provider: 'codex' },
      { id: 'idle', role: 'implementacion', area: 'ui', state: 'idle', provider: 'codex' },
      { id: 'two', role: 'desarrollador', area: 'ui', state: 'waiting', provider: 'opencode' },
      { id: 'master', role: 'revisor', area: 'ui', state: 'running', provider: 'claude' },
    ]
    expect(assignAgentNames(agents)).toEqual([
      { ...agents[0], name: 'UI Worker' }, { ...agents[1], name: 'UI Worker', ordinal: 1 },
      { ...agents[2], name: 'UI Worker' }, { ...agents[3], name: 'UI Worker 2', ordinal: 2 },
      { ...agents[4], name: 'UI Master' },
    ])
    expect(agents[1]).not.toHaveProperty('ordinal')
    expect(assignAgentNames([agents[1], agents[0]])[0]).toEqual({ ...agents[1], name: 'UI Worker' })
    const finished = assignAgentNames(agents).map((agent) => ({ ...agent, state: 'done' }))
    for (const agent of assignAgentNames(finished)) expect(agent.ordinal).toBeUndefined()
  })
})
