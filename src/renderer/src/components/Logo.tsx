import { LOGO_BARS } from '../lib/logo'

/**
 * The application mark: an insertion caret beside three lines of text that
 * shorten as they descend. One colour, one stroke weight, no detail that
 * disappears at 16px. The shape itself lives in `lib/logo.ts`, because the
 * welcome document embeds the same figure as an image.
 */
export default function Logo({ size = 17 }: { size?: number }) {
  return (
    <svg
      className="brand__mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      role="img"
      aria-label="Type Editor"
      focusable="false"
    >
      {LOGO_BARS.map(([x, y, width, height]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} rx={1.6} />
      ))}
    </svg>
  )
}
