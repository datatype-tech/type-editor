/**
 * Marks that appear inside documents, rather than in the interface.
 *
 * Both are monochrome, so both are drawn in one colour: the accent the rest of
 * the app uses. That keeps them legible in every theme, including the dark
 * ones, where a black mark would disappear into the paper.
 */

const ACCENT = '#b0553a'

function dataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The Datatype Team mark, from the team's own `DatatypeTeamLogo.svg`. */
export function datatypeLogoDataUrl(color = ACCENT, size = 64): string {
  return dataUrl(
    [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 326.9 326.1" fill="${color}">`,
      '<rect x="48.4" y="227.4" width="49.3" height="59.3"/>',
      '<rect x="97.5" y="156.5" width="79.8" height="71.6"/>',
      '<path d="M279.9,162.7v6.9c0,59.8-44.8,109.1-102.6,116.2v-57.7c31-0.6,55.9-25.9,55.9-57v-5.4c0-31.7-25.7-57.3-57.3-57.3H48.3l0.3-70.7h93.9C224.7,37.6,279.9,93.6,279.9,162.7z"/>',
      '</svg>'
    ].join('')
  )
}
