import type { ComponentType } from 'react'
import {
  Activity, AudioWaveform, Ban, Bot, Box, Camera, CheckCircle2, Circle, CircleDashed,
  CircleDot, Diff, DoorClosed, Eye, FileText, Film,
  FlaskConical, Gamepad2, GitMerge, Hammer, HelpCircle, Hourglass, Image, LayoutPanelTop,
  ListChecks, Lock, Mountain, Package, PackageCheck, PersonStanding,
  PlugZap, Radio, Shapes, TestTube2, WifiOff,
} from 'lucide-react'

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
    gameplay: spec(Gamepad2, 'Gameplay'), ui: spec(LayoutPanelTop, 'Interfaz'), escenarios: spec(Mountain, 'Escenarios'),
    assets: spec(Box, 'Assets'), animacion: spec(PersonStanding, 'Animación'), audio: spec(AudioWaveform, 'Audio'),
    qa: spec(FlaskConical, 'Calidad'), builds: spec(Package, 'Compilaciones'),
  },
  taskState: {
    pendiente: spec(Circle, 'Pendiente'), preparada: spec(CircleDot, 'Preparada', 'info'),
    implementando: spec(Hammer, 'Implementando', 'info'), revisando: spec(Eye, 'Revisando', 'info'),
    probando: spec(TestTube2, 'Probando', 'warning'), integrando: spec(GitMerge, 'Integrando', 'info'),
    cerrando: spec(DoorClosed, 'Cerrando', 'warning'), done: spec(CheckCircle2, 'Hecha', 'success'),
    bloqueada: spec(Ban, 'Bloqueada', 'error'), decision: spec(HelpCircle, 'Espera decisión', 'warning'),
  },
  directorState: {
    esperando: spec(Hourglass, 'Esperando'), escuchando: spec(Radio, 'Escuchando', 'success'),
    atendiendo: spec(Activity, 'Atendiendo', 'primary'), vigilanteCaido: spec(WifiOff, 'Vigilante caído', 'warning'),
    desconectado: spec(PlugZap, 'Desconectado', 'error'),
  },
  provider: {
    codex: provider('Codex', 'info'), claude: provider('Claude', 'warning'), meshy: provider('Meshy', 'success'),
    blender: provider('Blender', 'warning'), unreal: provider('Unreal'), kratos: provider('Kratos', 'primary'), launcher: provider('Launcher', 'info'),
  },
  artifact: {
    model: spec(Shapes, 'Modelo'), texture: spec(Image, 'Textura'), screenshot: spec(Camera, 'Captura'),
    video: spec(Film, 'Vídeo'), build: spec(PackageCheck, 'Compilación'), report: spec(FileText, 'Informe'), diff: spec(Diff, 'Cambios'),
  },
} satisfies Record<GlyphKind, Record<string, GlyphSpec>>

const roleLabels: Record<string, string> = {
  director: 'Director', implementacion: 'Implementación', arte: 'Arte', revisor: 'Revisor',
  qa: 'Calidad', integrador: 'Integrador', coordinador: 'Coordinador',
}
const sourceLabels: Record<string, string> = {
  fab: 'Fab', megascans: 'Megascans', polyhaven: 'Poly Haven', ambientcg: 'ambientCG',
  kenney: 'Kenney', quaternius: 'Quaternius', sketchfab: 'Sketchfab', freesound: 'Freesound',
}
const text = (label: string): GlyphSpec => ({ Icon: null, presentation: 'text', label, tone: 'neutral' })
const ownLabel = (labels: Record<string, string>, value: string) => Object.hasOwn(labels, value) ? labels[value] : value

/** Los eventos apuntan a entidades existentes; no forman otro catálogo en la leyenda. */
function eventEntity(value: string, providerValue?: string): GlyphSpec {
  switch (value.split('.')[0]) {
    case 'task': return { ...glyphs.taskState.pendiente, label: 'Tarea' }
    case 'run': return providerValue ? glyphFor('provider', providerValue) : text('Ejecución')
    case 'worker': return providerValue ? glyphFor('provider', providerValue) : spec(Bot, 'Agente')
    case 'command': return spec(ListChecks, 'Orden')
    case 'lease': return spec(Lock, 'Reserva')
    case 'decision': return glyphs.taskState.decision
    case 'review': return glyphs.taskState.revisando
    case 'test': return glyphs.taskState.probando
    case 'integration': return glyphs.taskState.integrando
    case 'artifact': return { ...glyphs.artifact.build, label: 'Entrega' }
    case 'director': return glyphs.directorState.escuchando
    case 'message': return text('Mensaje')
    case 'reply': return text('Respuesta')
    case 'download': return text('Descarga')
    default: return text(value)
  }
}

export function glyphFor(kind: PresentationKind, value: string, providerValue?: string): GlyphSpec {
  if (kind === 'event') return eventEntity(value, providerValue)
  if (kind === 'role') return text(ownLabel(roleLabels, value))
  if (kind === 'source') {
    if (value === 'meshy' || value === 'blender') return glyphs.provider[value]
    return provider(ownLabel(sourceLabels, value))
  }
  const entries: Record<string, GlyphSpec> = glyphs[kind]
  return Object.hasOwn(entries, value) ? entries[value] : kind === 'provider' ? provider(value) : spec(CircleDashed, value)
}
