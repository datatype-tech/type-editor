import welcomeMarkdown from '../welcome.md?raw'
import { logoDataUrl } from './logo'

/**
 * The page the editor opens on when there is nothing else to restore.
 *
 * It ships as a Markdown file — `welcome.md`, bundled by Vite — so it can be
 * written and edited like any other document; the only thing this module does
 * is put the application mark in the place the file reserves for it.
 */
export const WELCOME_DOCUMENT = welcomeMarkdown.replace('{{logo}}', logoDataUrl('#b0553a', 56))

/** True when a document is the untouched welcome page. */
export function isWelcomeDocument(text: string): boolean {
  return text === WELCOME_DOCUMENT
}
