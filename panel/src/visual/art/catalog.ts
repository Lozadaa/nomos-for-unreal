export type ArtView = 'produccion' | 'actividad' | 'entregas' | 'catalogo' | 'chat' | 'decisiones' | 'presupuesto' | 'capacidades'

type Illustration = { label: string; empty: string; accent: string; header: string }

/** El catálogo fija la metáfora visual de cada vista, compartida por vacíos y cabeceras. */
export const catalog: Record<ArtView, Illustration> = {
  produccion: {
    label: 'Producción', empty: 'M34 25h98v16H34ZM34 52h98v16H34ZM34 79h98v16H34Z',
    accent: 'M20 30a3 3 0 1 0 0 6 3 3 0 0 0 0-6m4 3h10', header: 'm8 10h44v5h-44Zm0 12h32v5h-32Z',
  },
  actividad: {
    label: 'Actividad', empty: 'M25 24H135M25 36H135M25 48H135M25 60H135M25 72H135M25 84H135M25 96H135',
    accent: 'M48 45v6m26 18v6m28-42v6', header: 'm0 21h12l6-10 10 20 10-17 8 7h18',
  },
  entregas: {
    label: 'Entregas', empty: 'M32 24h96v72H32ZM44 36h72v48H44Z',
    accent: 'M75 54l5 5 9-12m-9 12v12', header: 'm10 8h38v24h-38Zm8 6h22v12h-22Z',
  },
  catalogo: {
    label: 'Catálogo', empty: 'M24 25h26v26H24Zm42 0h26v26H66Zm42 0h26v26h-26ZM24 69h26v26H24Zm42 0h26v26H66Z',
    accent: 'M127 81a10 10 0 1 1-20 0 10 10 0 0 1 20 0m-3 7 10 10', header: 'm8 8h16v10h-16Zm24 0h16v10h-16Zm-24 18h16v10h-16Zm24 0h16v10h-16Z',
  },
  chat: {
    label: 'Chat', empty: 'M40 35v35a12 12 0 0 0 12 12h4v16l20-16h32a12 12 0 0 0 12-12V35a12 12 0 0 0-12-12H59',
    accent: 'M57 50h5m14 0h5m14 0h5', header: 'm8 8h44v20h-20l-9 7v-7h-15Z',
  },
  decisiones: {
    label: 'Decisiones', empty: 'M80 25v66M62 95h36M43 40h74M48 40 32 68h32L48 40Zm64 0L96 68h32l-16-28ZM32 68a16 16 0 0 0 32 0m32 0a16 16 0 0 0 32 0',
    accent: 'M76 21a4 4 0 1 0 8 0 4 4 0 0 0-8 0', header: 'm30 6v28m-18 0h36m-40-20h44m-36 0-8 14h16l-8-14m28 0-8 14h16l-8-14',
  },
  presupuesto: {
    label: 'Presupuesto', empty: 'M80 23a37 37 0 1 1 0 74 37 37 0 0 1 0-74Zm0 11a26 26 0 1 0 0 52 26 26 0 0 0 0-52Z',
    accent: 'M80 17v12', header: 'm30 5a15 15 0 1 1 0 30 15 15 0 0 1 0-30m0 6a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
  },
  capacidades: {
    label: 'Capacidades', empty: 'M44 28v18m16-18v18M36 46h32v11a16 16 0 0 1-32 0ZM52 73v20m48-16v18m16-18v18M92 77h32V66a16 16 0 0 0-32 0Zm16-27V30',
    accent: 'M76 53l8 7-8 7', header: 'm12 5v8m12-8v8m-18 0h24v6a12 12 0 0 1-24 0m12 12v7m23-19h15m-6-6 6 6-6 6',
  },
}
