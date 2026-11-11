import type { ComponentType } from 'react'
import {
  Activity, AudioWaveform, Ban, Bot, Box, BrainCircuit, Camera, CheckCircle2, Circle, CircleDashed,
  CircleDot, Diff, DoorClosed, Eye, FileText, Film,
  FlaskConical, Gamepad2, GitMerge, Hammer, HelpCircle, Hourglass, Image, LayoutPanelTop,
  ListChecks, Lock, Mountain, Package, PackageCheck, PersonStanding,
  PlugZap, Radio, Shapes, Sparkles, Video, TestTube2, WifiOff,
} from 'lucide-react'
import { BRAND, legacyProvider } from '@/lib/brand'

export type GlyphKind = 'area' | 'taskState' | 'directorState' | 'provider' | 'artifact'
export type PresentationKind = GlyphKind | 'role' | 'event' | 'source'
type GlyphBase = {
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'primary'
  label: string
}
export type GlyphSpec = GlyphBase & (
  { Icon: ComponentType<{ size?: number; className?: string }>; presentation?: 'icon' } |
  { Icon: null; presentation: 'pill' | 'text' }
)
const spec = (Icon: NonNullable<GlyphSpec['Icon']>, label: string, tone: GlyphSpec['tone'] = 'neutral'): GlyphSpec => ({ Icon, tone, label })
const provider = (label: string, tone: GlyphSpec['tone'] = 'neutral'): GlyphSpec => ({ Icon: null, presentation: 'pill', label, tone })

export const glyphs = {
  area: {
    gameplay: spec(Gamepad2, 'Gameplay'), ui: spec(LayoutPanelTop, 'UI'),
    vfx: spec(Sparkles, 'VFX and materials'), camara: spec(Video, 'Camera'), ia: spec(BrainCircuit, 'AI'), escenarios: spec(Mountain, 'Levels'),
    assets: spec(Box, 'Assets'), animacion: spec(PersonStanding, 'Animation'), audio: spec(AudioWaveform, 'Audio'),
    qa: spec(FlaskConical, 'QA'), builds: spec(Package, 'Builds'),
  },
  taskState: {
    pendiente: spec(Circle, 'Pending'), preparada: spec(CircleDot, 'Ready', 'info'),
    implementando: spec(Hammer, 'Building', 'info'), revisando: spec(Eye, 'Reviewing', 'info'),
    probando: spec(TestTube2, 'Testing', 'warning'), integrando: spec(GitMerge, 'Merging', 'info'),
    cerrando: spec(DoorClosed, 'Wrapping up', 'warning'), done: spec(CheckCircle2, 'Done', 'success'),
    bloqueada: spec(Ban, 'Blocked', 'error'), decision: spec(HelpCircle, 'Needs decision', 'warning'),
  },
  directorState: {
    esperando: spec(Hourglass, 'Idle'), escuchando: spec(Radio, 'Listening', 'success'),
    atendiendo: spec(Activity, 'Working', 'primary'), vigilanteCaido: spec(WifiOff, 'Watcher down', 'warning'),
    desconectado: spec(PlugZap, 'Disconnected', 'error'),
  },
  provider: {
    codex: provider('Codex', 'info'), claude: provider('Claude', 'warning'), opencode: provider('OpenCode', 'success'), meshy: provider('Meshy', 'success'),
    blender: provider('Blender', 'warning'), unreal: provider('Unreal'), nomos: provider(BRAND.short, 'primary'), launcher: provider('Launcher', 'info'),
  },
  artifact: {
    model: spec(Shapes, 'Model'), texture: spec(Image, 'Texture'), screenshot: spec(Camera, 'Screenshot'),
    video: spec(Film, 'Video'), build: spec(PackageCheck, 'Build'), report: spec(FileText, 'Report'), diff: spec(Diff, 'Changes'),
  },
} satisfies Record<GlyphKind, Record<string, GlyphSpec>>

const roleLabels: Record<string, string> = {
  director: 'Director', implementacion: 'Builder', arte: 'Art', revisor: 'Reviewer',
  qa: 'QA', integrador: 'Merger', coordinador: 'Coordinator',
}
const sourceLabels: Record<string, string> = {
  fab: 'Fab', megascans: 'Megascans', polyhaven: 'Poly Haven', ambientcg: 'ambientCG',
  kenney: 'Kenney', quaternius: 'Quaternius', sketchfab: 'Sketchfab', freesound: 'Freesound', engine: 'Engine',
}
const text = (label: string): GlyphSpec => ({ Icon: null, presentation: 'text', label, tone: 'neutral' })
const ownLabel = (labels: Record<string, string>, value: string) => Object.hasOwn(labels, value) ? labels[value] : value

/** Los eventos apuntan a entidades existentes; no forman otro catálogo en la leyenda. */
function eventEntity(value: string, providerValue?: string): GlyphSpec {
  switch (value.split('.')[0]) {
    case 'task': return { ...glyphs.taskState.pendiente, label: 'Task' }
    case 'run': return providerValue ? glyphFor('provider', providerValue) : text('Run')
    case 'worker': return providerValue ? glyphFor('provider', providerValue) : spec(Bot, 'Agent')
    case 'command': return spec(ListChecks, 'Command')
    case 'lease': return spec(Lock, 'Lock')
    case 'decision': return { ...glyphs.taskState.decision, label: 'Decision', tone: 'neutral' }
    case 'review': return { ...glyphs.taskState.revisando, label: 'Review', tone: 'neutral' }
    case 'test': return { ...glyphs.taskState.probando, label: 'Test', tone: 'neutral' }
    case 'integration': return { ...glyphs.taskState.integrando, label: 'Merge', tone: 'neutral' }
    case 'artifact': return { ...glyphs.artifact.build, label: 'Delivery' }
    case 'director': return { ...glyphs.directorState.escuchando, label: 'Director', tone: 'neutral' }
    case 'message': return text('Message')
    case 'reply': return text('Reply')
    case 'download': return text('Download')
    default: return text(value)
  }
}

export function glyphFor(kind: PresentationKind, value: string, providerValue?: string): GlyphSpec {
  if (kind === 'provider') value = legacyProvider(value)
  if (kind === 'event') return eventEntity(value, providerValue)
  if (kind === 'role') return text(ownLabel(roleLabels, value))
  if (kind === 'source') {
    if (value === 'meshy' || value === 'blender') return glyphs.provider[value]
    return provider(ownLabel(sourceLabels, value))
  }
  const entries: Record<string, GlyphSpec> = glyphs[kind]
  return Object.hasOwn(entries, value) ? entries[value] : kind === 'provider' ? provider(value) : spec(CircleDashed, value)
}
