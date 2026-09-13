/**
 * Path handling for documents that reference files on disk. Markdown stores
 * forward slashes whatever the platform, and anything the renderer loads —
 * images in the preview, images in a PNG export — has to be turned back into a
 * URL the document can resolve.
 */

function toSlashes(path: string): string {
  return path.replace(/\\/g, '/')
}

/** The directory a document lives in, or null for one that was never saved. */
export function dirOf(filePath: string | null): string | null {
  if (!filePath) return null
  const slashed = toSlashes(filePath)
  const cut = slashed.lastIndexOf('/')
  return cut <= 0 ? null : slashed.slice(0, cut)
}

function toFileUrl(path: string): string {
  const slashed = toSlashes(path)
  const rooted = slashed.startsWith('/') ? slashed : `/${slashed}`
  return `file://${encodeURI(rooted)}`
}

/** Base for resolving relative references, or '' when there is no document yet. */
export function baseUrlOf(filePath: string | null): string {
  const dir = dirOf(filePath)
  return dir ? `${toFileUrl(dir)}/` : ''
}

/** Turns a Markdown image source into something the renderer can load. */
export function resolveSrc(src: string, baseUrl: string): string {
  if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) return src
  if (!baseUrl) return src
  try {
    return new URL(src, baseUrl).href
  } catch {
    return src
  }
}

/**
 * A path to `target` as written from `fromDir`, or null when the two are on
 * different volumes (where only an absolute reference can work).
 */
export function relativePath(fromDir: string | null, target: string): string | null {
  if (!fromDir) return null

  const from = toSlashes(fromDir).split('/').filter(Boolean)
  const to = toSlashes(target).split('/').filter(Boolean)
  if (from.length === 0 || to.length === 0) return null

  const fold = (part: string): string => (/^[a-z]:$/i.test(part) ? part.toLowerCase() : part)
  if (fold(from[0]) !== fold(to[0])) return null

  let shared = 0
  while (shared < from.length && shared < to.length && fold(from[shared]) === fold(to[shared])) {
    shared += 1
  }

  const up = new Array(from.length - shared).fill('..')
  return [...up, ...to.slice(shared)].join('/') || null
}

/** What to write between `![]()` brackets for a file the user picked. */
export function imageReference(filePath: string, documentPath: string | null): string {
  const relative = relativePath(dirOf(documentPath), filePath)
  return relative ?? toFileUrl(filePath)
}
