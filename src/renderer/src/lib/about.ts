import aboutMarkdown from '../about.md?raw'
import { datatypeLogoDataUrl } from './brand'
import { logoDataUrl } from './logo'

/**
 * The About page, which is a Markdown document like any other: it opens in the
 * editor, can be edited, and exports the same way. Reachable from Settings and
 * from the Help menu.
 */
export const ABOUT_DOCUMENT = aboutMarkdown
  .replace('{{logo}}', logoDataUrl('#b0553a', 56))
  .replace('{{datatype}}', datatypeLogoDataUrl('#000000', 52))
  .replace('{{version}}', __APP_VERSION__)

/** True when a document is the untouched About page. */
export function isAboutDocument(text: string): boolean {
  return text === ABOUT_DOCUMENT
}
