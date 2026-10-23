import type { SVGProps } from 'react'

export function geometricIcon(d: string) {
  return function GeometricIcon({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}><path d={d} /></svg>
  }
}

export const Bone = geometricIcon('M8 7a3 3 0 1 0-4 4l9 9a3 3 0 1 0 4-4L8 7Zm0 0 8 8')
