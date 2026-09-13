import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType
} from 'docx'
import { htmlToText } from '../lib/html'
import { parseMarkdown, type MdToken } from '../lib/markdown'
import { dataUrlToBytes, measureImage, texToImage, type RasterImage } from './render'

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

/** Widest an embedded image may be, in CSS pixels (Word's usable text width). */
const MAX_IMAGE_WIDTH = 600

const MONO = 'Consolas'

/** Ink-on-paper palette, matching the editor's exported stylesheet. */
const INK = '1A1814'
const INK_SOFT = '6B6459'
const RULE = 'D5CDBD'
const SHADE = 'F8F6F1'
const CODE_INK = '8A5A2B'
const LINK = 'B0553A'

interface BuildContext {
  /** Rasterised formulas and embedded images, keyed by the token that produced them. */
  assets: Map<MdToken, RasterImage>
  indent: number
  quoteDepth: number
}

function imageRun(image: RasterImage): ImageRun {
  return new ImageRun({
    type: 'png',
    data: image.data,
    transformation: { width: image.width, height: image.height }
  })
}

/** Finds the index of the token that closes the block opened at `start`. */
function findMatching(
  tokens: MdToken[],
  start: number,
  openType: string,
  closeType: string
): number {
  let depth = 0
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].type === openType) depth += 1
    else if (tokens[index].type === closeType) {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return tokens.length - 1
}

function inlineRuns(
  token: MdToken | undefined,
  context: BuildContext
): (TextRun | ImageRun)[] {
  const runs: (TextRun | ImageRun)[] = []
  if (!token?.children) return runs

  let bold = 0
  let italic = 0
  let strike = 0
  let link = 0

  for (const child of token.children) {
    switch (child.type) {
      case 'text':
        runs.push(
          new TextRun({
            text: child.content,
            bold: bold > 0,
            italics: italic > 0,
            strike: strike > 0,
            color: link > 0 ? LINK : undefined,
            underline: link > 0 ? { type: UnderlineType.SINGLE } : undefined
          })
        )
        break

      case 'strong_open':
        bold += 1
        break
      case 'strong_close':
        bold = Math.max(0, bold - 1)
        break
      case 'em_open':
        italic += 1
        break
      case 'em_close':
        italic = Math.max(0, italic - 1)
        break
      case 's_open':
        strike += 1
        break
      case 's_close':
        strike = Math.max(0, strike - 1)
        break
      case 'link_open':
        link += 1
        break
      case 'link_close':
        link = Math.max(0, link - 1)
        break

      case 'code_inline':
        runs.push(
          new TextRun({
            text: child.content,
            font: MONO,
            size: 19,
            color: CODE_INK,
            shading: { type: ShadingType.CLEAR, fill: SHADE }
          })
        )
        break

      // A footnote marker travels with the text it annotates; the note itself
      // arrives at the end of the document as a block.
      case 'footnote_ref':
        runs.push(
          new TextRun({ text: `[${child.content}]`, superScript: true, color: LINK })
        )
        break

      case 'softbreak':
        runs.push(new TextRun(' '))
        break

      // Inline HTML keeps its text and its emphasis; the tags themselves have
      // no counterpart in a Word run.
      case 'html_inline': {
        const text = htmlToText(child.content)
        if (text) {
          runs.push(
            new TextRun({
              text,
              bold: bold > 0 || /<(b|strong)\b/i.test(child.content),
              italics: italic > 0 || /<(i|em)\b/i.test(child.content)
            })
          )
        }
        break
      }
      case 'hardbreak':
        runs.push(new TextRun({ break: 1 }))
        break

      case 'math_inline': {
        const asset = context.assets.get(child)
        runs.push(
          asset
            ? imageRun(asset)
            : new TextRun({ text: child.content, font: 'Cambria Math', italics: true })
        )
        break
      }

      case 'image': {
        const asset = context.assets.get(child)
        if (asset) {
          runs.push(imageRun(asset))
        } else {
          const alt = String(child.attrGet('alt') ?? '')
          const src = String(child.attrGet('src') ?? '')
          runs.push(new TextRun({ text: alt || src, italics: true, color: INK_SOFT }))
        }
        break
      }

      default:
        break
    }
  }

  return runs
}

function codeBlockParagraph(code: string): Paragraph {
  const lines = code.replace(/\n$/, '').split('\n')
  const runs: TextRun[] = []

  lines.forEach((line, index) => {
    if (index > 0) runs.push(new TextRun({ break: 1 }))
    // Word collapses a run with no text, which would drop the blank line.
    runs.push(new TextRun({ text: line.length > 0 ? line : ' ', font: MONO, size: 19 }))
  })

  return new Paragraph({
    children: runs,
    shading: { type: ShadingType.CLEAR, fill: SHADE },
    spacing: { before: 120, after: 160 },
    indent: { left: 240, right: 240 },
    border: { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 8 } }
  })
}

function convertList(
  tokens: MdToken[],
  start: number,
  end: number,
  ordered: boolean,
  context: BuildContext
): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  let index = start

  while (index < end) {
    const token = tokens[index]
    if (token.type !== 'list_item_open') {
      index += 1
      continue
    }

    const close = findMatching(tokens, index, 'list_item_open', 'list_item_close')
    let cursor = index + 1
    let runs: (TextRun | ImageRun)[] = []

    // A tight list holds a bare inline token; a loose one wraps it in a paragraph.
    if (tokens[cursor]?.type === 'paragraph_open') {
      runs = inlineRuns(tokens[cursor + 1], context)
      cursor += 3
    } else if (tokens[cursor]?.type === 'inline') {
      runs = inlineRuns(tokens[cursor], context)
      cursor += 1
    }

    blocks.push(
      new Paragraph({
        children: runs,
        ...(ordered
          ? { numbering: { reference: 'te-ordered', level: 0 } }
          : { bullet: { level: 0 } }),
        indent: { left: 720 + context.indent, hanging: 360 },
        spacing: { after: 60 }
      })
    )

    // Nested lists and other blocks inside the item follow, indented further.
    if (cursor < close) {
      context.indent += 720
      blocks.push(...convertBlocks(tokens, cursor, close, context))
      context.indent -= 720
    }

    index = close + 1
  }

  return blocks
}

function convertTable(
  tokens: MdToken[],
  start: number,
  end: number,
  context: BuildContext
): Table {
  const rows: TableRow[] = []
  let index = start

  while (index < end) {
    if (tokens[index].type !== 'tr_open') {
      index += 1
      continue
    }

    const rowEnd = findMatching(tokens, index, 'tr_open', 'tr_close')
    const cells: TableCell[] = []
    let cursor = index + 1

    while (cursor < rowEnd) {
      const cell = tokens[cursor]
      if (cell.type !== 'th_open' && cell.type !== 'td_open') {
        cursor += 1
        continue
      }

      const isHeader = cell.type === 'th_open'
      const cellEnd = findMatching(tokens, cursor, cell.type, isHeader ? 'th_close' : 'td_close')

      cells.push(
        new TableCell({
          children: [new Paragraph({ children: inlineRuns(tokens[cursor + 1], context) })],
          shading: isHeader ? { type: ShadingType.CLEAR, fill: SHADE } : undefined
        })
      )
      cursor = cellEnd + 1
    }

    rows.push(new TableRow({ children: cells }))
    index = rowEnd + 1
  }

  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })
}

function convertBlocks(
  tokens: MdToken[],
  start: number,
  end: number,
  context: BuildContext
): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = []
  const indent = context.indent > 0 ? { left: context.indent } : undefined
  const quoteBorder =
    context.quoteDepth > 0
      ? { left: { style: BorderStyle.SINGLE, size: 12, color: RULE, space: 12 } }
      : undefined

  let index = start
  while (index < end) {
    const token = tokens[index]

    switch (token.type) {
      case 'heading_open': {
        const level = Math.min(6, Math.max(1, Number(token.tag.slice(1)) || 1))
        blocks.push(
          new Paragraph({
            heading: HEADING_LEVELS[level - 1],
            children: inlineRuns(tokens[index + 1], context),
            indent,
            border: quoteBorder
          })
        )
        index += 3
        continue
      }

      case 'paragraph_open':
        blocks.push(
          new Paragraph({
            children: inlineRuns(tokens[index + 1], context),
            spacing: { after: 160 },
            indent,
            border: quoteBorder
          })
        )
        index += 3
        continue

      case 'inline':
        blocks.push(
          new Paragraph({
            children: inlineRuns(token, context),
            spacing: { after: 120 },
            indent
          })
        )
        index += 1
        continue

      case 'fence':
      case 'code_block':
        blocks.push(codeBlockParagraph(token.content))
        index += 1
        continue

      // A block of HTML becomes its text. Word cannot take the markup, but
      // losing the content would be worse than losing its styling.
      case 'html_block': {
        const text = htmlToText(token.content)
        if (text) {
          blocks.push(
            new Paragraph({ children: [new TextRun(text)], spacing: { after: 160 }, indent, border: quoteBorder })
          )
        }
        index += 1
        continue
      }

      case 'math_block': {
        const asset = context.assets.get(token)
        blocks.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 200 },
            children: asset
              ? [imageRun(asset)]
              : [new TextRun({ text: token.content, font: 'Cambria Math', italics: true })]
          })
        )
        index += 1
        continue
      }

      case 'hr':
        blocks.push(
          new Paragraph({
            spacing: { before: 200, after: 200 },
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 1 }
            }
          })
        )
        index += 1
        continue

      case 'blockquote_open': {
        const close = findMatching(tokens, index, 'blockquote_open', 'blockquote_close')
        context.quoteDepth += 1
        context.indent += 360
        blocks.push(...convertBlocks(tokens, index + 1, close, context))
        context.indent -= 360
        context.quoteDepth -= 1
        index = close + 1
        continue
      }

      case 'bullet_list_open':
      case 'ordered_list_open': {
        const ordered = token.type === 'ordered_list_open'
        const close = findMatching(
          tokens,
          index,
          token.type,
          ordered ? 'ordered_list_close' : 'bullet_list_close'
        )
        blocks.push(...convertList(tokens, index + 1, close, ordered, context))
        index = close + 1
        continue
      }

      case 'table_open': {
        const close = findMatching(tokens, index, 'table_open', 'table_close')
        blocks.push(convertTable(tokens, index + 1, close, context))
        index = close + 1
        continue
      }

      default:
        index += 1
    }
  }

  return blocks
}

/**
 * Pre-rasterises everything that cannot survive as text: LaTeX formulas (Word
 * has no KaTeX) and images supplied as data URLs. Remote images are left alone
 * rather than fetched during an export.
 */
async function collectAssets(tokens: MdToken[]): Promise<Map<MdToken, RasterImage>> {
  const assets = new Map<MdToken, RasterImage>()
  const jobs: Promise<void>[] = []

  const consider = (token: MdToken): void => {
    if (token.type === 'math_inline' || token.type === 'math_block') {
      jobs.push(
        (async () => {
          try {
            assets.set(token, await texToImage(token.content, token.type === 'math_block'))
          } catch {
            // Falls back to the raw expression as italic text.
          }
        })()
      )
      return
    }

    if (token.type === 'image') {
      const src = String(token.attrGet('src') ?? '')
      if (!src.startsWith('data:')) return
      jobs.push(
        (async () => {
          try {
            const measured = await measureImage(src)
            const scale = Math.min(1, MAX_IMAGE_WIDTH / measured.width)
            assets.set(token, {
              data: dataUrlToBytes(src),
              width: Math.round(measured.width * scale),
              height: Math.round(measured.height * scale)
            })
          } catch {
            // Falls back to the alt text.
          }
        })()
      )
    }
  }

  for (const token of tokens) {
    consider(token)
    for (const child of token.children ?? []) consider(child)
  }

  await Promise.all(jobs)
  return assets
}

/** Converts Markdown into a real `.docx` package. */
export async function markdownToDocx(markdown: string, title: string): Promise<Uint8Array> {
  const tokens = parseMarkdown(markdown)
  const context: BuildContext = {
    assets: await collectAssets(tokens),
    indent: 0,
    quoteDepth: 0
  }

  const document = new Document({
    title,
    description: 'Exported from Type Editor',
    numbering: {
      config: [
        {
          reference: 'te-ordered',
          levels: [
            {
              level: 0,
              format: 'decimal',
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } }
            }
          ]
        }
      ]
    },
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22, color: INK },
          paragraph: { spacing: { line: 300 } }
        },
        heading1: {
          run: { font: 'Calibri Light', size: 40, bold: true, color: INK },
          paragraph: { spacing: { before: 320, after: 160 } }
        },
        heading2: {
          run: { font: 'Calibri Light', size: 32, bold: true, color: INK },
          paragraph: { spacing: { before: 280, after: 140 } }
        },
        heading3: {
          run: { font: 'Calibri Light', size: 26, bold: true, color: INK },
          paragraph: { spacing: { before: 240, after: 120 } }
        },
        heading4: {
          run: { font: 'Calibri', size: 24, bold: true, color: INK },
          paragraph: { spacing: { before: 200, after: 100 } }
        }
      }
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
        },
        children: convertBlocks(tokens, 0, tokens.length, context)
      }
    ]
  })

  const blob = await Packer.toBlob(document)
  return new Uint8Array(await blob.arrayBuffer())
}
