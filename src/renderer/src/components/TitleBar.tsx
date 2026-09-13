import { ChevronDown, Clock, Copy, Minus, Save, Square, X } from 'lucide-react'
import { memo } from 'react'
import Dropdown, { MenuItem, MenuLabel, MenuSeparator } from './Dropdown'
import Logo from './Logo'
import type { MessageKey } from '../lib/i18n'
import { useT } from '../lib/i18n-react'
import { AUTOSAVE_STEPS } from '../lib/settings'

interface TitleBarProps {
  title: string
  dirty: boolean
  maximized: boolean
  autoSaveSeconds: number
  saving: boolean
  onSetAutoSave: (seconds: number) => void
  onSaveNow: () => void
}

function badgeKey(seconds: number): MessageKey {
  if (seconds <= 0) return 'autosave.badge.off'
  if (seconds < 60) return 'autosave.badge.30'
  return seconds < 300 ? 'autosave.badge.60' : 'autosave.badge.300'
}

function optionKey(seconds: number): MessageKey {
  if (seconds <= 0) return 'autosave.off'
  if (seconds < 60) return 'autosave.30'
  return seconds < 300 ? 'autosave.60' : 'autosave.300'
}

function TitleBar({
  title,
  dirty,
  maximized,
  autoSaveSeconds,
  saving,
  onSetAutoSave,
  onSaveNow
}: TitleBarProps) {
  const t = useT()
  const mac = window.api.platform === 'darwin'

  return (
    <header className="titlebar">
      <span className="brand" title="Type Editor">
        <Logo />
      </span>
      <span className="titlebar__rule" />

      <div className="doc-title">
        <span className="doc-title__name">{title}</span>
        <span
          className={`doc-title__dot${dirty ? ' is-dirty' : ''}`}
          title={dirty ? t('title.unsaved') : t('title.saved')}
        />
      </div>

      <span className="titlebar__spacer" />

      <div className="titlebar__actions">
        <Dropdown
          trigger={({ open, toggle }) => (
            <button
              type="button"
              className={`autosave${autoSaveSeconds > 0 ? ' is-on' : ''}${
                saving ? ' is-saving' : ''
              }${open ? ' is-open' : ''}`}
              onClick={toggle}
              title={t('autosave.title')}
              aria-haspopup="menu"
              aria-expanded={open}
            >
              <span className="autosave__pulse" />
              <Clock className="autosave__icon" size={13} strokeWidth={1.7} />
              <span className="autosave__value">{t(badgeKey(autoSaveSeconds))}</span>
              <ChevronDown className="autosave__chevron" size={12} strokeWidth={1.8} />
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuLabel>{t('autosave.title')}</MenuLabel>
              {AUTOSAVE_STEPS.map((seconds) => (
                <MenuItem
                  key={seconds}
                  selected={seconds === autoSaveSeconds}
                  onSelect={() => {
                    onSetAutoSave(seconds)
                    close()
                  }}
                >
                  {t(optionKey(seconds))}
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                icon={<Save size={14} strokeWidth={1.7} />}
                onSelect={() => {
                  close()
                  onSaveNow()
                }}
              >
                {t('autosave.now')}
              </MenuItem>
            </>
          )}
        </Dropdown>

        {!mac && (
          <div className="window-controls">
            <button
              type="button"
              className="win-btn"
              onClick={() => window.api.window.minimize()}
              aria-label="Minimize"
            >
              <Minus size={14} strokeWidth={1.3} />
            </button>
            <button
              type="button"
              className="win-btn"
              onClick={() => window.api.window.toggleMaximize()}
              aria-label={maximized ? 'Restore' : 'Maximize'}
            >
              {maximized ? (
                <Copy size={11.5} strokeWidth={1.3} />
              ) : (
                <Square size={10.5} strokeWidth={1.3} />
              )}
            </button>
            <button
              type="button"
              className="win-btn win-btn--close"
              onClick={() => window.api.window.close()}
              aria-label="Close"
            >
              <X size={14} strokeWidth={1.3} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

/** Re-renders only when its own props change, not on every keystroke. */
export default memo(TitleBar)
