/**
 * Raw HTML is allowed through Markdown, which means it has to be cleaned on the
 * way in: the editor opens arbitrary files from disk into a window that holds
 * the IPC bridge.
 *
 * Scripts never run from `innerHTML`, but event-handler attributes and
 * `javascript:` URLs do, so the sanitiser works on a parsed tree — the same
 * tree the browser will build — rather than on a string.
 */

/** Tags whose *content* is markup: removed outright. */
const DROP = new Set([
  'script',
  'style',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'select',
  'option',
  'textarea',
  'template',
  'noscript',
  'audio',
  'video',
  'source',
  'track',
  'canvas',
  'svg',
  'math'
])

/** Tags that survive as themselves. Anything else is unwrapped. */
const KEEP = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'cite', 'code', 'col',
  'colgroup', 'dd', 'del', 'details', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p',
  'picture', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strong', 'sub',
  'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var', 'wbr'
])

const GLOBAL_ATTRS = new Set(['title', 'class', 'id', 'dir', 'lang', 'align', 'role'])
const TAG_ATTRS: Record<string, string[]> = {
  a: ['href', 'target', 'rel', 'name'],
  img: ['src', 'alt', 'width', 'height'],
  ol: ['start', 'type', 'reversed'],
  td: ['colspan', 'rowspan', 'headers'],
  th: ['colspan', 'rowspan', 'scope', 'headers'],
  col: ['span'],
  colgroup: ['span'],
  time: ['datetime'],
  del: ['cite', 'datetime'],
  ins: ['cite', 'datetime'],
  blockquote: ['cite']
}

/** `data:image/...` is how an attached picture survives a copy-paste. */
function safeUrl(value: string): boolean {
  const url = value.trim().toLowerCase()
  if (url.startsWith('javascript:') || url.startsWith('vbscript:')) return false
  if (url.startsWith('data:')) return url.startsWith('data:image/')
  return true
}

function unwrap(element: Element): void {
  const parent = element.parentNode
  if (!parent) return
  while (element.firstChild) parent.insertBefore(element.firstChild, element)
  parent.removeChild(element)
}

export function sanitizeHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const body = parsed.body

  for (const element of Array.from(body.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase()
    if (DROP.has(tag)) {
      element.remove()
      continue
    }
    if (!KEEP.has(tag)) unwrap(element)
  }

  for (const element of Array.from(body.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase()
    const allowed = TAG_ATTRS[tag] ?? []
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (!GLOBAL_ATTRS.has(name) && !allowed.includes(name)) {
        element.removeAttribute(attribute.name)
        continue
      }
      if ((name === 'href' || name === 'src') && !safeUrl(attribute.value)) {
        element.removeAttribute(attribute.name)
      }
    }
    // A link that leaves the app should not take the window with it.
    if (tag === 'a' && element.getAttribute('href')) {
      element.setAttribute('target', '_blank')
      element.setAttribute('rel', 'noreferrer noopener')
    }
  }

  return body.innerHTML
}

const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure',
  'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p',
  'pre', 'section', 'table', 'tr', 'ul'
])

/** Flattens HTML to the text a Word paragraph can carry, block by block. */
export function htmlToText(html: string): string {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const lines: string[] = []

  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const text = node.textContent ?? ''
      if (text.trim()) lines.push(text.trim())
      return
    }
    if (node.nodeType !== 1) return

    const tag = (node as Element).tagName.toLowerCase()
    if (tag === 'br') {
      lines.push('\n')
      return
    }
    const block = BLOCK_TAGS.has(tag)
    if (block) lines.push('\n')
    for (const child of Array.from(node.childNodes)) walk(child)
    if (block) lines.push('\n')
  }

  walk(parsed.body)
  return lines
    .join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}
