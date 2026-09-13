/**
 * The application mark, as data.
 *
 * One source of truth for the shape, so the header, the welcome document and
 * anything else that needs the logo all draw the same figure: bars of equal
 * weight, the insertion caret taller than the text it sits beside.
 */

export const LOGO_BARS: readonly [number, number, number, number][] = [
  // x, y, width, height — all rounded to half their thickness.
  [2.8, 3.2, 3.2, 17.6],
  [9.2, 4.6, 12.2, 3.2],
  [9.2, 10.4, 9.2, 3.2],
  [9.2, 16.2, 6.2, 3.2]
]

const RADIUS = 1.6

/** The mark as a standalone SVG document, for use where JSX is not available. */
export function logoSvg(size: number, color: string): string {
  const bars = LOGO_BARS.map(
    ([x, y, width, height]) =>
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${RADIUS}"/>`
  ).join('')

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}">`,
    bars,
    '</svg>'
  ].join('')
}

/**
 * The mark as an image source, for embedding in Markdown. Encoded rather than
 * base64'd so the reference stays readable and survives a copy-paste.
 */
export function logoDataUrl(color = '#b0553a', size = 96): string {
  return `data:image/svg+xml,${encodeURIComponent(logoSvg(size, color))}`
}
