import { memo } from 'react'
import type { MessageKey } from '../lib/i18n'
import { useT } from '../lib/i18n-react'

interface StatusBarProps {
  words: number
  characters: number
  line: number
  column: number
  saveState: 'idle' | 'saving' | 'saved' | 'error'
}

const SAVE_LABEL: Record<StatusBarProps['saveState'], MessageKey | null> = {
  idle: null,
  saving: 'status.saving',
  saved: 'status.saved',
  error: 'status.failed'
}

function StatusBar({
  words,
  characters,
  line,
  column,
  saveState
}: StatusBarProps) {
  const t = useT()
  const saveKey = SAVE_LABEL[saveState]

  return (
    <footer className="statusbar">
      <span className="statusbar__item">{t('status.markdown')}</span>

      {saveKey && <span className={`statusbar__item statusbar__item--${saveState}`}>{t(saveKey)}</span>}

      <span className="statusbar__spacer" />

      <span className="statusbar__item">
        {t(words === 1 ? 'status.words.one' : 'status.words.other', {
          n: words.toLocaleString()
        })}
      </span>
      <span className="statusbar__item">
        {t(characters === 1 ? 'status.chars.one' : 'status.chars.other', {
          n: characters.toLocaleString()
        })}
      </span>
      <span className="statusbar__item">
        {t('status.caret', { line: line.toLocaleString(), col: column.toLocaleString() })}
      </span>
    </footer>
  )
}

export default memo(StatusBar)
