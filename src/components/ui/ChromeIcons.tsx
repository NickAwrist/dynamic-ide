import type { SVGProps } from 'react'

const chromeStroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function IconChromeMinimize(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden {...chromeStroke} {...props}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function IconChromeMaximize(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden {...chromeStroke} {...props}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" ry="1.5" />
    </svg>
  )
}

export function IconChromeRestore(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden {...chromeStroke} {...props}>
      <rect x="5" y="8" width="11" height="11" rx="1.5" ry="1.5" />
      <rect x="8" y="5" width="11" height="11" rx="1.5" ry="1.5" />
    </svg>
  )
}

export type IconCloseSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const CLOSE_PX: Record<IconCloseSize, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 18,
  xl: 20,
}

export type IconCloseProps = SVGProps<SVGSVGElement> & {
  size?: IconCloseSize
}

/** Unified dismiss / close glyph (stroke X) for panels, modals, and tabs. */
export function IconClose({ size = 'md', width, height, ...props }: IconCloseProps) {
  const px = CLOSE_PX[size]
  const w = width ?? px
  const h = height ?? px
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={w}
      height={h}
      aria-hidden
      {...chromeStroke}
      {...props}
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}
