export interface OutlineEntry {
  level: number
  /** 1-based line number the heading sits on. */
  line: number
  title: string
}

/** Markdown emphasis has no place in a table of contents. */
function plain(title: string): string {
  return title
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*([^*]*)\*/g, '$1')
    .replace(/~~([^~]*)~~/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
}

/**
 * Reads the headings out of a document. Fenced code is skipped, so a `#` inside
 * a shell example does not turn into a chapter.
 */
export function documentOutline(text: string): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  let fence: string | null = null

  const lines = text.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (marker) {
      if (fence === null) fence = marker[1][0]
      else if (marker[1][0] === fence) fence = null
      continue
    }
    if (fence !== null) continue

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      entries.push({
        level: heading[1].length,
        line: index + 1,
        title: plain(heading[2]) || heading[2]
      })
    }
  }

  return entries
}
