import { memo, useCallback, useState } from 'react'
import { X } from 'lucide-react'
import type { UpdateInfo } from '@shared/ipc'
import type { Locale, Settings, ThemeId } from '../lib/settings'
import { AUTOSAVE_STEPS, LOCALES, TAB_SIZES, THEMES, fontById } from '../lib/settings'
import type { MessageKey } from '../lib/i18n'
import { useT } from '../lib/i18n-react'
import FontPicker from './FontPicker'

/** Just enough of each preset to draw its swatch; the real values live in CSS. */
const THEME_SWATCH: Record<ThemeId, { surface: string; paper: string; ink: string; accent: string }> = {
  type: { surface: '#ffffff', paper: '#fdfcf9', ink: '#1a1814', accent: '#b0553a' },
  minimal: { surface: '#ffffff', paper: '#ffffff', ink: '#101010', accent: '#101010' },
  'minimal-light': { surface: '#ffffff', paper: '#fbfbfc', ink: '#161a1f', accent: '#3f5a73' },
  'plain-light': { surface: '#ffffff', paper: '#ffffff', ink: '#1f1f1f', accent: '#0f6cbd' },
  'plain-dark': { surface: '#1f1f1f', paper: '#1a1a1a', ink: '#e8e8e8', accent: '#479ef5' },
  anthropic: { surface: '#faf9f5', paper: '#f0eee6', ink: '#191919', accent: '#d97757' },
  'anthropic-dark': { surface: '#1f1e1d', paper: '#262624', ink: '#f0eee6', accent: '#d97757' }
}

const THEME_KEY: Record<ThemeId, MessageKey> = {
  type: 'theme.type',
  minimal: 'theme.minimal',
  'minimal-light': 'theme.minimal-light',
  'plain-light': 'theme.plain-light',
  'plain-dark': 'theme.plain-dark',
  anthropic: 'theme.anthropic',
  'anthropic-dark': 'theme.anthropic-dark'
}

const LOCALE_KEY: Record<Locale, MessageKey> = {
  en: 'locale.en',
  'zh-CN': 'locale.zh-CN',
  'zh-TW': 'locale.zh-TW',
  ja: 'locale.ja'
}

const AUTOSAVE_KEY: Record<number, MessageKey> = {
  0: 'autosave.badge.off',
  30: 'autosave.badge.30',
  60: 'autosave.badge.60',
  300: 'autosave.badge.300'
}

interface SettingsPaneProps {
  open: boolean
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onReset: () => void
  onHome: () => void
  onAbout: () => void
  onClose: () => void
}

function SettingsPane({
  open,
  settings,
  onChange,
  onReset,
  onHome,
  onAbout,
  onClose
}: SettingsPaneProps) {
  const t = useT()

  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'uptodate' | 'available' | 'downloading' | 'ready' | 'error'
  >('idle')
  const [downloadPercent, setDownloadPercent] = useState(0)
  const [updateError, setUpdateError] = useState('')
  const [rateLimitResetAt, setRateLimitResetAt] = useState<number | null>(null)

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true)
    setUpdateError('')
    setRateLimitResetAt(null)
    try {
      const res = await window.api.checkForUpdates()
      if (res.hasUpdate && res.update) {
        setUpdateInfo(res.update)
        setUpdateStatus('available')
      } else if (res.error === 'rate_limited') {
        setUpdateStatus('error')
        setRateLimitResetAt(res.rateLimitResetAt ?? null)
      } else if (res.error) {
        setUpdateStatus('error')
        setUpdateError(res.error)
      } else {
        setUpdateStatus('uptodate')
      }
    } catch (err) {
      setUpdateStatus('error')
      setUpdateError((err as Error).message)
    } finally {
      setCheckingUpdate(false)
    }
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    setUpdateStatus('downloading')
    setDownloadPercent(0)
    const offProgress = window.api.onUpdateProgress((p) => {
      setDownloadPercent(p.percent)
    })
    try {
      const res = await window.api.downloadUpdate()
      if (res.success) {
        setUpdateStatus('ready')
      } else {
        setUpdateStatus('error')
        setUpdateError(res.error || 'Download failed')
      }
    } catch (err) {
      setUpdateStatus('error')
      setUpdateError((err as Error).message)
    } finally {
      offProgress()
    }
  }, [])

  const handleInstallNow = useCallback(() => {
    void window.api.installUpdate()
  }, [])

  const handleViewRelease = useCallback(() => {
    if (updateInfo?.releaseUrl) {
      void window.api.openReleaseUrl(updateInfo.releaseUrl)
    }
  }, [updateInfo])

  return (
    <aside
      className={`settings-pane${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label={t('settings.title')}
    >
      <div className="settings-pane__head">
        <span className="settings-pane__title">{t('settings.title')}</span>
        <button
          type="button"
          className="iconbtn"
          onClick={onClose}
          title={t('settings.close')}
          aria-label={t('settings.close')}
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      <div className="settings-pane__body">
        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.appearance')}</h2>
          <div className="field">
            <div className="field__head">{t('settings.theme')}</div>
            <div className="themes">
              {THEMES.map((theme) => {
                const swatch = THEME_SWATCH[theme]
                return (
                  <button
                    key={theme}
                    type="button"
                    className={`theme-card${settings.theme === theme ? ' is-active' : ''}`}
                    aria-pressed={settings.theme === theme}
                    onClick={() => onChange({ theme })}
                  >
                    <span
                      className="theme-card__preview"
                      style={{
                        background: swatch.paper,
                        borderColor: swatch.ink + '22'
                      }}
                    >
                      <span
                        className="theme-card__bar theme-card__bar--long"
                        style={{ background: swatch.ink }}
                      />
                      <span
                        className="theme-card__bar theme-card__bar--short"
                        style={{ background: swatch.ink, opacity: 0.45 }}
                      />
                      <span
                        className="theme-card__bar theme-card__bar--accent"
                        style={{ background: swatch.accent }}
                      />
                    </span>
                    <span className="theme-card__name">{t(THEME_KEY[theme])}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.typography')}</h2>

          <div className="field">
            <div className="field__head">
              <label htmlFor="ui-font">{t('settings.uiFont')}</label>
            </div>
            <FontPicker
              id="ui-font"
              value={settings.uiFont}
              onChange={(uiFont) => onChange({ uiFont })}
            />
          </div>

          <div className="field">
            <div className="field__head">
              <label htmlFor="editor-font">{t('settings.editorFont')}</label>
            </div>
            <FontPicker
              id="editor-font"
              value={settings.editorFont}
              onChange={(editorFont) => onChange({ editorFont })}
            />
            <p className="field__sample" style={{ fontFamily: fontById(settings.editorFont).stack }}>
              {t('settings.fontSample')}
            </p>
          </div>

          <div className="field">
            <div className="field__head">
              <label htmlFor="font-size">{t('settings.fontSize')}</label>
              <span className="field__value">{settings.fontSize} px</span>
            </div>
            <input
              id="font-size"
              className="range"
              type="range"
              min={12}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={(event) => onChange({ fontSize: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__head">
              <label htmlFor="line-height">{t('settings.lineHeight')}</label>
              <span className="field__value">{settings.lineHeight.toFixed(2)}</span>
            </div>
            <input
              id="line-height"
              className="range"
              type="range"
              min={1.3}
              max={2.6}
              step={0.05}
              value={settings.lineHeight}
              onChange={(event) => onChange({ lineHeight: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__head">
              <label htmlFor="measure">{t('settings.measure')}</label>
              <span className="field__value">{settings.measure} px</span>
            </div>
            <input
              id="measure"
              className="range"
              type="range"
              min={480}
              max={1280}
              step={16}
              value={settings.measure}
              onChange={(event) => onChange({ measure: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__head">
              <label htmlFor="margin">{t('settings.margin')}</label>
              <span className="field__value">{settings.margin} px</span>
            </div>
            <input
              id="margin"
              className="range"
              type="range"
              min={0}
              max={160}
              step={4}
              value={settings.margin}
              onChange={(event) => onChange({ margin: Number(event.target.value) })}
            />
          </div>

          <div className="field">
            <div className="field__head">{t('settings.tabSize')}</div>
            <div className="segmented">
              {TAB_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`segmented__option${settings.tabSize === size ? ' is-active' : ''}`}
                  aria-pressed={settings.tabSize === size}
                  onClick={() => onChange({ tabSize: size })}
                >
                  {t('settings.tabSize.value', { n: size })}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.language')}</h2>
          <div className="field">
            <div className="field__head">
              <label htmlFor="locale">{t('settings.language')}</label>
            </div>
            <select
              id="locale"
              className="select"
              value={settings.locale}
              onChange={(event) => onChange({ locale: event.target.value as Locale })}
            >
              {LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {t(LOCALE_KEY[locale])}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.view')}</h2>
          <div className="field">
            <Toggle
              label={t('settings.focusMode')}
              hint={t('settings.focusMode.hint')}
              checked={settings.focusMode}
              onChange={(focusMode) => onChange({ focusMode })}
            />
            <Toggle
              label={t('settings.typewriterMode')}
              hint={t('settings.typewriterMode.hint')}
              checked={settings.typewriterMode}
              onChange={(typewriterMode) => onChange({ typewriterMode })}
            />
          </div>
        </section>

        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.editor')}</h2>
          <div className="field">
            <Toggle
              label={t('settings.autoCloseBrackets')}
              hint={t('settings.autoCloseBrackets.hint')}
              checked={settings.autoCloseBrackets}
              onChange={(autoCloseBrackets) => onChange({ autoCloseBrackets })}
            />
          </div>
          <div className="field">
            <div className="field__head">{t('settings.autoSave')}</div>
            <div className="segmented">
              {AUTOSAVE_STEPS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className={`segmented__option${settings.autoSave === seconds ? ' is-active' : ''}`}
                  aria-pressed={settings.autoSave === seconds}
                  onClick={() => onChange({ autoSave: seconds })}
                >
                  {t(AUTOSAVE_KEY[seconds])}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="settings-group">
          <h2 className="settings-group__title">{t('settings.update')}</h2>
          <div className="field">
            <div className="update-card">
              <div className="update-card__header">
                <div className="update-card__info">
                  <div className="update-card__version">
                    {t('settings.currentVersion', { version: __APP_VERSION__ })}
                  </div>
                  <div className="update-card__status" key={`status-${updateStatus}-${checkingUpdate}`}>
                    {checkingUpdate
                      ? t('settings.checkingUpdate')
                      : updateStatus === 'uptodate'
                        ? t('settings.updateUpToDate')
                        : updateStatus === 'available' && updateInfo
                          ? t('settings.updateAvailable', { version: updateInfo.version })
                          : updateStatus === 'downloading'
                            ? t('settings.downloadingUpdate', { percent: downloadPercent })
                            : updateStatus === 'ready'
                              ? t('settings.updateDownloaded')
                              : updateStatus === 'error'
                                ? rateLimitResetAt
                                  ? t('settings.updateRateLimited', {
                                      time: new Date(rateLimitResetAt).toLocaleTimeString()
                                    })
                                  : t('settings.updateFailed', { error: updateError })
                                : ''}
                  </div>
                </div>

                <div className="update-card__actions" key={`actions-${updateStatus}`}>
                  {updateStatus === 'ready' ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--compact"
                      onClick={handleInstallNow}
                    >
                      {t('settings.installNow')}
                    </button>
                  ) : updateStatus === 'available' ? (
                    <button
                      type="button"
                      className="btn btn--primary btn--compact"
                      onClick={handleDownloadUpdate}
                    >
                      {t('settings.updateNow')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--compact"
                      data-action="check-update"
                      disabled={checkingUpdate}
                      onClick={handleCheckUpdate}
                    >
                      {checkingUpdate ? t('settings.checkingUpdate') : t('settings.checkUpdate')}
                    </button>
                  )}
                </div>
              </div>

              {updateStatus === 'downloading' && (
                <div className="update-card__progress">
                  <div className="update-card__bar" style={{ width: `${downloadPercent}%` }} />
                </div>
              )}

              {updateStatus === 'available' && updateInfo && (
                <div className="update-card__meta">
                  <button
                    type="button"
                    className="linkbtn"
                    onClick={handleViewRelease}
                  >
                    {t('settings.viewRelease')} →
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="settings-pane__foot">
        <button type="button" className="linkbtn" onClick={onHome}>
          {t('settings.home')}
        </button>
        <button type="button" className="linkbtn" onClick={onAbout}>
          {t('settings.about')}
        </button>
        <button type="button" className="linkbtn" onClick={onReset}>
          {t('settings.reset')}
        </button>
      </div>
    </aside>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        <span className="toggle__hint">{hint}</span>
      </span>
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </button>
  )
}

/** Re-renders only when its own props change, not on every keystroke. */
export default memo(SettingsPane)
