import { BRAND } from '@/lib/brand'
export interface AgentNamingInput { id: string; role?: string | null; area?: string | null; state: string }

const areas: Record<string, string> = {
  ui: 'UI', gameplay: 'Gameplay', escenarios: 'Level', assets: 'Assets', animacion: 'Anim', audio: 'Audio', qa: 'QA', builds: 'Builds',
}
const roles: Record<string, string> = {
  implementacion: 'Worker', revisor: 'Master', arte: 'Artist', qa: 'Tester', integrador: 'Builder', coordinador: 'Lead',
  desarrollador: 'Worker', implementador: 'Worker', generador: 'Artist',
}

/** El ordinal 1 queda implícito en el nombre; solo los duplicados posteriores llevan sufijo. */
export function agentName(role?: string | null, area?: string | null, ordinal?: number): string {
  const areaName = area && Object.hasOwn(areas, area) ? areas[area] : 'Project'
  const roleName = role && Object.hasOwn(roles, role) ? roles[role] : 'Worker'
  const base = role === 'director' ? BRAND.short : `${areaName} ${roleName}`
  return ordinal !== undefined && Number.isInteger(ordinal) && ordinal > 1 ? `${base} ${ordinal}` : base
}

/** Orden estable del caller; libres y terminados no consumen un número ni causan insignias. */
export function assignAgentNames<T extends AgentNamingInput>(agents: readonly T[]): (T & { name: string; ordinal?: number })[] {
  const live = (agent: AgentNamingInput) => agent.state === 'running' || agent.state === 'waiting'
  const totals = new Map<string, number>()
  for (const agent of agents) {
    if (!live(agent)) continue
    const name = agentName(agent.role, agent.area)
    totals.set(name, (totals.get(name) ?? 0) + 1)
  }
  const used = new Map<string, number>()
  return agents.map((agent) => {
    const base = agentName(agent.role, agent.area)
    const named: T & { name: string; ordinal?: number } = { ...agent, name: base }
    delete named.ordinal
    if (!live(agent) || (totals.get(base) ?? 0) < 2) return named
    const ordinal = (used.get(base) ?? 0) + 1
    used.set(base, ordinal)
    return { ...named, name: agentName(agent.role, agent.area, ordinal), ordinal }
  })
}
