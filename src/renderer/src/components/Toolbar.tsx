import {
  Clock3,
  Code,
  CodeXml,
  Eye,
  FilePlus,
  FileType,
  FolderOpen,
  Image,
  ImageDown,
  ListTree,
  Save,
  SaveAll,
  Search,
  Settings,
  Terminal
} from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import Dropdown, { MenuItem, MenuLabel, MenuSeparator } from './Dropdown'
import { useT } from '../lib/i18n-react'

/** Fence languages offered by the insert menu. Labels are proper nouns. */
const LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'css',
  'html',
  'json',
  'yaml',
  'sql',
  'bash',
  'markdown'
]

export interface RecentEntry {
  filePath: string
  name: string
  at: number
}

interface ToolbarProps {
  sourceMode: boolean
  busy: boolean
  settingsOpen: boolean
  outlineOpen: boolean
  recent: RecentEntry[]
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (filePath: string) => void
  onSave: () => void
  onSaveAs: () => void
  onExportPng: () => void
  onExportDocx: () => void
  onFind: () => void
  onInsertInlineCode: () => void
  onInsertCodeBlock: (language: string) => void
  onInsertImage: () => void
  onToggleOutline: () => void
  onToggleSettings: () => void
  onSourceModeChange: (source: boolean) => void
}

export default function Toolbar({
  sourceMode,
  busy,
  settingsOpen,
  outlineOpen,
  recent,
  onNew,
  onOpen,
  onOpenRecent,
  onSave,
  onSaveAs,
  onExportPng,
  onExportDocx,
  onFind,
  onInsertInlineCode,
  onInsertCodeBlock,
  onInsertImage,
  onToggleOutline,
  onToggleSettings,
  onSourceModeChange
}: ToolbarProps) {
  const t = useT()
  const liveRef = useRef<HTMLButtonElement>(null)
  const sourceRef = useRef<HTMLButtonElement>(null)
  const [underline, setUnderline] = useState({ left: 0, width: 0 })

  // The indicator slides to whichever mode is active, so its geometry has to
  // come from the rendered buttons rather than a fixed width.
  useLayoutEffect(() => {
    const target = (sourceMode ? sourceRef : liveRef).current
    if (!target) return
    setUnderline({ left: target.offsetLeft, width: target.offsetWidth })
  }, [sourceMode])

  return (
    <nav className="toolbar">
      <button
        type="button"
        className="cmd"
        data-action="new"
        onClick={onNew}
        title={`${t('toolbar.new')} — Ctrl+N`}
      >
        <FilePlus className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">{t('toolbar.new')}</span>
      </button>

      <Dropdown
        align="left"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={`cmd${open ? ' is-open' : ''}`}
            // A plain click opens a file; the caret offers the recent ones.
            onClick={() => onOpen()}
            title={`${t('toolbar.open')} — Ctrl+O`}
            aria-haspopup="menu"
          >
            <FolderOpen className="cmd__icon" size={15} strokeWidth={1.6} />
            <span className="cmd__label">{t('toolbar.open')}</span>
            <span
              className="cmd__split"
              role="button"
              tabIndex={-1}
              aria-label={t('toolbar.recent')}
              onClick={(event) => {
                event.stopPropagation()
                toggle()
              }}
            >
              <svg className="cmd__chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M2.6 4.4 6 7.8l3.4-3.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<FolderOpen size={14} strokeWidth={1.7} />}
              hint="Ctrl+O"
              onSelect={() => {
                close()
                onOpen()
              }}
            >
              {t('toolbar.openFile')}
            </MenuItem>
            {recent.length > 0 && (
              <>
                <MenuSeparator />
                <MenuLabel>{t('toolbar.recent')}</MenuLabel>
                <div className="menu__scroll">
                  {recent.map((entry) => (
                    <MenuItem
                      key={entry.filePath}
                      icon={<Clock3 size={14} strokeWidth={1.7} />}
                      title={entry.filePath}
                      onSelect={() => {
                        close()
                        onOpenRecent(entry.filePath)
                      }}
                    >
                      <span className="menu__file">
                        <span className="menu__file-name">{entry.name}</span>
                        <span className="menu__file-path">{entry.filePath}</span>
                      </span>
                    </MenuItem>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </Dropdown>

      <button
        type="button"
        className="cmd cmd--primary"
        onClick={onSave}
        title={`${t('toolbar.save')} — Ctrl+S`}
      >
        <Save className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">{t('toolbar.save')}</span>
      </button>

      <button
        type="button"
        className="cmd"
        onClick={onSaveAs}
        title={`${t('toolbar.saveAs')} — Ctrl+Shift+S`}
      >
        <SaveAll className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">{t('toolbar.saveAs')}</span>
      </button>

      <span className="cmd-divider" />

      <button
        type="button"
        className="cmd"
        onClick={onExportPng}
        disabled={busy}
        title={`${t('export.png')} — Ctrl+Shift+E`}
      >
        <ImageDown className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">PNG</span>
      </button>

      <button
        type="button"
        className="cmd"
        onClick={onExportDocx}
        disabled={busy}
        title={`${t('export.word')} — Ctrl+Shift+W`}
      >
        <FileType className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">Word</span>
      </button>

      <span className="cmd-divider" />

      <button type="button" className="cmd" onClick={onFind} title={`${t('toolbar.find')} — Ctrl+F`}>
        <Search className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">{t('toolbar.find')}</span>
      </button>

      <Dropdown
        align="left"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            className={`cmd${open ? ' is-open' : ''}`}
            onClick={toggle}
            title={t('toolbar.insert')}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Code className="cmd__icon" size={15} strokeWidth={1.6} />
            <span className="cmd__label">{t('toolbar.insert')}</span>
            <svg className="cmd__chevron" width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d="M2.6 4.4 6 7.8l3.4-3.4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<CodeXml size={14} strokeWidth={1.7} />}
              hint="Ctrl+E"
              onSelect={() => {
                close()
                onInsertInlineCode()
              }}
            >
              {t('code.inline')}
            </MenuItem>
            <MenuItem
              icon={<Image size={14} strokeWidth={1.7} />}
              onSelect={() => {
                close()
                onInsertImage()
              }}
            >
              {t('code.image')}
            </MenuItem>
            <MenuSeparator />
            <MenuLabel>{t('code.block')}</MenuLabel>
            <div className="menu__scroll">
              <MenuItem
                icon={<Terminal size={14} strokeWidth={1.7} />}
                hint="Ctrl+Shift+K"
                onSelect={() => {
                  close()
                  onInsertCodeBlock('')
                }}
              >
                {t('code.plain')}
              </MenuItem>
              {LANGUAGES.map((language) => (
                <MenuItem
                  key={language}
                  onSelect={() => {
                    close()
                    onInsertCodeBlock(language)
                  }}
                >
                  {language}
                </MenuItem>
              ))}
            </div>
          </>
        )}
      </Dropdown>

      <span className="titlebar__spacer" />

      <button
        type="button"
        className={`cmd${outlineOpen ? ' is-open' : ''}`}
        data-action="outline"
        onClick={onToggleOutline}
        title={t('toolbar.outline')}
        aria-pressed={outlineOpen}
      >
        <ListTree className="cmd__icon" size={15} strokeWidth={1.6} />
        <span className="cmd__label">{t('toolbar.outline')}</span>
      </button>

      <div className="modeswitch" role="tablist" aria-label="Editor mode">
        <span
          className="modeswitch__underline"
          style={{ transform: `translateX(${underline.left}px)`, width: underline.width }}
        />

        <button
          ref={liveRef}
          type="button"
          role="tab"
          aria-selected={!sourceMode}
          className={`modeswitch__option${sourceMode ? '' : ' is-active'}`}
          onClick={() => onSourceModeChange(false)}
          title={t('toolbar.live')}
        >
          <Eye size={14} strokeWidth={1.7} />
          <span className="cmd__label">{t('toolbar.live')}</span>
        </button>

        <button
          ref={sourceRef}
          type="button"
          role="tab"
          aria-selected={sourceMode}
          className={`modeswitch__option${sourceMode ? ' is-active' : ''}`}
          onClick={() => onSourceModeChange(true)}
          title={`${t('toolbar.source')} — Ctrl+/`}
        >
          <Code size={14} strokeWidth={1.7} />
          <span className="cmd__label">{t('toolbar.source')}</span>
        </button>
      </div>

      <span className="cmd-divider" />

      <button
        type="button"
        className={`cmd${settingsOpen ? ' is-open' : ''}`}
        data-action="settings"
        onClick={onToggleSettings}
        title={`${t('toolbar.settings')} — Ctrl+,`}
        aria-label={t('toolbar.settings')}
      >
        <Settings className="cmd__icon" size={15} strokeWidth={1.6} />
      </button>

    </nav>
  )
}
