import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { GlyphLegend } from './Glyph'

export function LegendSheet({ open, onOpenChange, returnTo }: {
  open: boolean; onOpenChange: (open: boolean) => void; returnTo: HTMLElement | null
}) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="overflow-y-auto overscroll-contain data-[side=right]:w-full data-[side=right]:sm:max-w-2xl" finalFocus={() => returnTo?.isConnected ? returnTo : document.getElementById('contenido')}>
      <SheetHeader><SheetTitle>Leyenda</SheetTitle><SheetDescription>Áreas, estados, proveedores y entregas</SheetDescription></SheetHeader>
      <div className="px-4 pb-6"><GlyphLegend compact /></div>
    </SheetContent>
  </Sheet>
}
