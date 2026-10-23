import { Activity, ClipboardList, Library, MessageCircle, PackageCheck, Plug, Scale, Wallet, type LucideIcon } from 'lucide-react'

export type ArtView = 'produccion' | 'actividad' | 'entregas' | 'catalogo' | 'chat' | 'decisiones' | 'presupuesto' | 'capacidades'
export type EmptyAction = { label: string; href: string } | { label: string; onClick: () => void }
type EmptySpec = { label: string; Icon: LucideIcon; message: string; action: EmptyAction }

/** Un concepto reconocible, una frase y una salida concreta por vista. */
export const catalog: Record<ArtView, EmptySpec> = {
  produccion: { label: 'Producción', Icon: ClipboardList, message: 'Escribe la primera petición a Kratos', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  actividad: { label: 'Actividad', Icon: Activity, message: 'Aún no hay actividad', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  entregas: { label: 'Entregas', Icon: PackageCheck, message: 'Aún no hay entregas', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  catalogo: { label: 'Catálogo', Icon: Library, message: 'Aún no se ha indexado nada', action: { label: 'Pedir un asset', href: '/?nueva=1' } },
  chat: { label: 'Chat', Icon: MessageCircle, message: 'Cuéntale a Kratos qué quieres construir', action: { label: 'Nueva petición', href: '/?nueva=1' } },
  decisiones: { label: 'Decisiones', Icon: Scale, message: 'No tienes decisiones pendientes', action: { label: 'Ver producción', href: '/' } },
  presupuesto: { label: 'Presupuesto', Icon: Wallet, message: 'Sin límite definido', action: { label: 'Pedir un límite', href: '/chat' } },
  capacidades: { label: 'Capacidades', Icon: Plug, message: 'No hay capacidades disponibles.', action: { label: 'Abrir chat', href: '/chat' } },
}
