import { StrictMode, useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { createTranslator } from './lib/i18n'
import type { Locale } from './lib/settings'

/**
 * The unsaved-changes prompt, in a window of its own.
 *
 * It is a separate BrowserWindow rather than a dialog drawn inside the editor
 * because it has to be able to appear over whatever the editor is showing —
 * including a window full of tabs — without disturbing the page behind it. The
 * main process opens it, passes what to say in the query string, and waits for
 * one of the three answers.
 */
function DiscardDialog() {
  const params = new URLSearchParams(window.location.search)
  const locale = (params.get('locale') ?? 'en') as Locale
  const theme = params.get('theme') ?? 'type'
  const name = params.get('name') ?? ''
  const count = Number(params.get('count') ?? '1')

  const t = createTranslator(locale)
  const cardRef = useRef<HTMLDivElement>(null)
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = locale
  }, [theme, locale])

  // The window is framed around the text, which wraps differently in every
  // language, so the page measures its *content* and asks for that height.
  // Measuring the card itself would be circular: the card fills the window.
  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const report = (): void => {
      const body = card.querySelector<HTMLElement>('.dialog-card__body')
      const actions = card.querySelector<HTMLElement>('.dialog__actions')
      const padding = 36 // .dialog-card's own top and bottom padding
      const height = Math.ceil(
        (body?.scrollHeight ?? 0) + (actions?.offsetHeight ?? 0) + padding + 2
      )
      window.api.resizeDialog(height)
    }

    report()
    // Web fonts land after the first paint and change how the text wraps.
    void document.fonts.ready.then(report)
    return undefined
  }, [])

  const reply = (choice: 'save' | 'discard' | 'cancel'): void => {
    setAnswered(true)
    window.api.replyDiscard(choice)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        reply('cancel')
        return
      }
      // A focused button answers to Enter on its own.
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        reply('save')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  return (
    <div className={`dialog-card${answered ? ' is-answered' : ''}`} ref={cardRef}>
      <div className="dialog-card__body">
        <h1 className="dialog__title">{t('dialog.unsavedTitle')}</h1>
        <p className="dialog__body">
          {count > 1
            ? t('dialog.unsavedBodyMany', { n: count })
            : t('dialog.unsavedBody', { name })}
        </p>
        <p className="dialog__detail">{t('dialog.unsavedDetail')}</p>
      </div>

      <div className="dialog__actions">
        <button type="button" className="btn" onClick={() => reply('cancel')}>
          {t('dialog.cancel')}
        </button>
        <button type="button" className="btn" onClick={() => reply('discard')}>
          {t('dialog.dontSave')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          autoFocus
          onClick={() => reply('save')}
        >
          {t('dialog.save')}
        </button>
      </div>
    </div>
  )
}

const container = document.getElementById('dialog-root')
if (!container) throw new Error('Dialog container is missing from dialog.html')

createRoot(container).render(
  <StrictMode>
    <DiscardDialog />
  </StrictMode>
)
