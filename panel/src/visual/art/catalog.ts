import { Activity, ClipboardList, Library, MessageCircle, PackageCheck, Plug, Scale, Wallet, type LucideIcon } from 'lucide-react'
import { BRAND } from '@/lib/brand'

export type ArtView = 'produccion' | 'actividad' | 'entregas' | 'catalogo' | 'chat' | 'decisiones' | 'presupuesto' | 'capacidades'
export type EmptyAction = { label: string; href: string } | { label: string; onClick: () => void }
type EmptySpec = { label: string; Icon: LucideIcon; message: string; action: EmptyAction }

/** Un concepto reconocible, una frase y una salida concreta por vista. */
export const catalog: Record<ArtView, EmptySpec> = {
  produccion: { label: 'Production', Icon: ClipboardList, message: `Send ${BRAND.short} your first request`, action: { label: 'New request', href: '/?nueva=1' } },
  actividad: { label: 'Activity', Icon: Activity, message: 'No activity yet', action: { label: 'New request', href: '/?nueva=1' } },
  entregas: { label: 'Deliveries', Icon: PackageCheck, message: 'No deliveries yet', action: { label: 'New request', href: '/?nueva=1' } },
  catalogo: { label: 'Catalog', Icon: Library, message: 'Nothing indexed yet', action: { label: 'Ask for an asset', href: '/?nueva=1' } },
  chat: { label: 'Chat', Icon: MessageCircle, message: `Tell ${BRAND.short} what you want to build`, action: { label: 'New request', href: '/?nueva=1' } },
  decisiones: { label: 'Decisions', Icon: Scale, message: 'No decisions waiting on you', action: { label: 'See production', href: '/' } },
  presupuesto: { label: 'Budget', Icon: Wallet, message: 'No limit set', action: { label: 'Ask for a limit', href: '/chat' } },
  capacidades: { label: 'Capabilities', Icon: Plug, message: 'No capabilities available.', action: { label: 'Open chat', href: '/chat' } },
}
