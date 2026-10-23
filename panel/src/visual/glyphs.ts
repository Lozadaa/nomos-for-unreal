import type { ComponentType } from 'react'
import {
  Activity, AudioWaveform, Ban, Box, Boxes, Camera, CheckCircle2, Circle, CircleDashed,
  CircleDot, Code2, Command, Crown, Diff, DoorClosed, Download, Eye, FileText, Film,
  FlaskConical, Gamepad2, GitMerge, Hammer, HelpCircle, Hourglass, Image, LayoutPanelTop,
  Leaf, Library, MessageCircle, Mountain, Network, Package, PackageCheck, Palette, Play,
  PlugZap, Radio, Reply, Scan, Search, ShieldCheck, TestTube2, Timer, Users, WifiOff, Wrench,
} from 'lucide-react'
import { Bone } from './GeometricIcon'

export type GlyphKind = 'area' | 'taskState' | 'directorState' | 'provider' | 'role' | 'event' | 'artifact' | 'source'
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
    assets: spec(Box, 'Assets'), animacion: spec(Bone, 'Animación'), audio: spec(AudioWaveform, 'Audio'),
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
  role: {
    director: spec(Crown, 'Director'), implementacion: spec(Code2, 'Implementación'), arte: spec(Palette, 'Arte'),
    revisor: spec(Search, 'Revisor'), qa: spec(ShieldCheck, 'Calidad'), integrador: spec(GitMerge, 'Integrador'), coordinador: spec(Users, 'Coordinador'),
  },
  event: {
    message: spec(MessageCircle, 'Mensaje'), reply: spec(Reply, 'Respuesta'), task: spec(Boxes, 'Tarea'),
    run: spec(Play, 'Ejecución'), worker: spec(Wrench, 'Agente'), command: spec(Command, 'Orden'),
    decision: spec(HelpCircle, 'Decisión', 'warning'), lease: spec(Timer, 'Reserva'), review: spec(Eye, 'Revisión'),
    artifact: spec(Box, 'Entrega'), test: spec(TestTube2, 'Prueba'), integration: spec(GitMerge, 'Integración'),
    download: spec(Download, 'Descarga'), director: spec(Radio, 'Director'),
  },
  artifact: {
    model: spec(Boxes, 'Modelo'), texture: spec(Image, 'Textura'), screenshot: spec(Camera, 'Captura'),
    video: spec(Film, 'Vídeo'), build: spec(PackageCheck, 'Compilación'), report: spec(FileText, 'Informe'), diff: spec(Diff, 'Cambios'),
  },
  source: {
    fab: spec(Library, 'Fab'), megascans: spec(Scan, 'Megascans'), polyhaven: spec(Mountain, 'Poly Haven'),
    ambientcg: spec(Leaf, 'ambientCG'), kenney: spec(Gamepad2, 'Kenney'), quaternius: spec(Box, 'Quaternius'),
    sketchfab: spec(Network, 'Sketchfab'), freesound: spec(AudioWaveform, 'Freesound'),
    meshy: provider('Meshy', 'success'), blender: provider('Blender', 'warning'),
  },
} satisfies Record<GlyphKind, Record<string, GlyphSpec>>

export function glyphFor(kind: GlyphKind, value: string): GlyphSpec {
  const entries: Record<string, GlyphSpec> = glyphs[kind]
  const key = kind === 'event' ? value.split('.')[0] : value
  return Object.hasOwn(entries, key) ? entries[key] : kind === 'provider' ? provider(value) : spec(CircleDashed, value)
}
