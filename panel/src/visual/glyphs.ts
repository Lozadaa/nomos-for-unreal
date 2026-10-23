import type { ComponentType } from 'react'
import {
  Activity, AudioWaveform, Ban, Box, Boxes, Camera, CheckCircle2, Circle, CircleDashed,
  CircleDot, Code2, Command, Crown, Diff, DoorClosed, Download, Eye, FileText, Film,
  FlaskConical, Gamepad2, GitMerge, Hammer, HelpCircle, Hourglass, Image, LayoutPanelTop,
  Leaf, Library, MessageCircle, Mountain, Network, Package, PackageCheck, Palette, Play,
  PlugZap, Radio, Reply, Scan, Search, ShieldCheck, TestTube2, Timer, Users, WifiOff, Wrench,
} from 'lucide-react'
import { Bone, geometricIcon, providerPaths } from './GeometricIcon'

export type GlyphKind = 'area' | 'taskState' | 'directorState' | 'provider' | 'role' | 'event' | 'artifact' | 'source'
export type GlyphSpec = {
  Icon: ComponentType<{ size?: number; className?: string }>
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'error' | 'primary'
  label: string
}
const spec = (Icon: GlyphSpec['Icon'], label: string, tone: GlyphSpec['tone'] = 'neutral'): GlyphSpec => ({ Icon, tone, label })
const provider = (value: keyof typeof providerPaths, label: string) => spec(geometricIcon(providerPaths[value]), label)

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
    codex: provider('codex', 'Codex'), claude: provider('claude', 'Claude Code'), meshy: provider('meshy', 'Meshy'),
    blender: provider('blender', 'Blender'), unreal: provider('unreal', 'Unreal'), kratos: provider('kratos', 'Kratos'), launcher: provider('launcher', 'Lanzador'),
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
    meshy: provider('meshy', 'Meshy'), blender: provider('blender', 'Blender'),
  },
} satisfies Record<GlyphKind, Record<string, GlyphSpec>>

export function glyphFor(kind: GlyphKind, value: string): GlyphSpec {
  const entries: Record<string, GlyphSpec> = glyphs[kind]
  const key = kind === 'event' ? value.split('.')[0] : value
  return Object.hasOwn(entries, key) ? entries[key] : spec(CircleDashed, value)
}
