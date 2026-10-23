import type { SVGProps } from 'react'

/** Formas propias: no reproducen marcas de los proveedores. */
export const providerPaths = {
  codex: 'M12 2 21 7v10l-9 5-9-5V7Z',
  claude: 'M4 20V4a16 16 0 0 1 16 16Z',
  meshy: 'M12 3 22 20H2ZM12 3v11L2 20m10-6 10 6',
  blender: 'M19 12a7 7 0 1 1-3-5.75M21 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
  unreal: 'M4 3h5v12a3 3 0 0 0 6 0V3h5v12a8 8 0 0 1-16 0Z',
  kratos: 'M3 7l5 5 4-9 4 9 5-5-2 13H5Z',
  launcher: 'M3 13h5l2 4h4l2-4h5v7H3ZM7 9l5-6 5 6m-5-6v10',
} as const

export function geometricIcon(d: string) {
  return function GeometricIcon({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}><path d={d} /></svg>
  }
}

export const Bone = geometricIcon('M8 7a3 3 0 1 0-4 4l9 9a3 3 0 1 0 4-4L8 7Zm0 0 8 8')
