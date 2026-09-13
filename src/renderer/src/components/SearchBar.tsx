import { CaseSensitive, ChevronDown, ChevronUp, Regex, Replace, ReplaceAll, Search, WholeWord, X } from 'lucide-react'
import { SearchQuery } from '@codemirror/search'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useT } from '../lib/i18n-react'
import type { EditorHandle } from './EditorPane'

interface SearchBarProps {
  editor: React.RefObject<EditorHandle | null>
  /** Bumped by the editor whenever the document or the selection moves. */
  revision: number
  onClose: () => void
}

export default function SearchBar({ editor, revision, onClose }: SearchBarProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [replace, setReplace] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexp, setRegexp] = useState(false)

  // Seeded from the selection so the common case — find that word — is one
  // keystroke away.
  useEffect(() => {
    const selected = editor.current?.getSelection() ?? ''
    if (selected && !selected.includes('\n')) setSearch(selected)
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editor])

  const query = useMemo(
    () =>
      new SearchQuery({
        search,
        replace,
        caseSensitive,
        regexp,
        wholeWord
      }),
    [search, replace, caseSensitive, regexp, wholeWord]
  )

  useEffect(() => {
    editor.current?.replaceQuery(query)
  }, [editor, query])

  // Reading the match count has to happen after the query reached the editor,
  // and again whenever the document or the caret moves.
  const stats = useMemo(() => {
    void revision
    return editor.current?.stats(query) ?? { total: 0, current: 0 }
  }, [editor, query, revision])

  const invalid = Boolean(search) && !query.valid

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) editor.current?.findPrevious()
      else editor.current?.findNext()
      return
    }
    if (event.key === 'F3') {
      event.preventDefault()
      editor.current?.findNext()
    }
  }

  const status = invalid
    ? t('search.noResults')
    : search
      ? stats.total === 0
        ? t('search.noResults')
        : t('search.results', { index: stats.current || 1, total: stats.total })
      : ''

  return (
    <div className="searchbar" role="dialog" aria-label={t('search.find')} onKeyDown={onKeyDown}>
      <div className="searchbar__row">
        <div className={`searchbar__field${invalid ? ' is-invalid' : ''}`}>
          <Search className="searchbar__icon" size={13} strokeWidth={1.8} />
          <input
            ref={inputRef}
            value={search}
            placeholder={t('search.placeholder')}
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className={`searchbar__toggle${showReplace ? ' is-on' : ''}`}
            title={t('search.replaceOne')}
            aria-label={t('search.replaceOne')}
            aria-pressed={showReplace}
            onClick={() => setShowReplace((current) => !current)}
          >
            <ChevronDown
              size={13}
              strokeWidth={1.9}
              style={{ transform: showReplace ? 'rotate(180deg)' : undefined }}
            />
          </button>
        </div>

        <span className="searchbar__count">{status}</span>

        <div className="searchbar__toggles">
          <button
            type="button"
            className={`searchbar__toggle${caseSensitive ? ' is-on' : ''}`}
            title={t('search.case')}
            aria-label={t('search.case')}
            aria-pressed={caseSensitive}
            onClick={() => setCaseSensitive((current) => !current)}
          >
            <CaseSensitive size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className={`searchbar__toggle${wholeWord ? ' is-on' : ''}`}
            title={t('search.word')}
            aria-label={t('search.word')}
            aria-pressed={wholeWord}
            onClick={() => setWholeWord((current) => !current)}
          >
            <WholeWord size={14} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className={`searchbar__toggle${regexp ? ' is-on' : ''}`}
            title={t('search.regexp')}
            aria-label={t('search.regexp')}
            aria-pressed={regexp}
            onClick={() => setRegexp((current) => !current)}
          >
            <Regex size={14} strokeWidth={1.7} />
          </button>
        </div>

        <button
          type="button"
          className="iconbtn"
          title={t('search.prev')}
          aria-label={t('search.prev')}
          onClick={() => editor.current?.findPrevious()}
        >
          <ChevronUp size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title={t('search.next')}
          aria-label={t('search.next')}
          onClick={() => editor.current?.findNext()}
        >
          <ChevronDown size={15} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="iconbtn"
          title={t('search.close')}
          aria-label={t('search.close')}
          onClick={onClose}
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      {showReplace && (
        <div className="searchbar__row">
          <div className="searchbar__field">
            <Replace className="searchbar__icon" size={13} strokeWidth={1.8} />
            <input
              value={replace}
              placeholder={t('search.replacePlaceholder')}
              spellCheck={false}
              onChange={(event) => setReplace(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn--compact"
            disabled={!stats.total}
            onClick={() => editor.current?.replaceCurrent()}
          >
            {t('search.replaceOne')}
          </button>
          <button
            type="button"
            className="btn btn--compact"
            disabled={!stats.total}
            onClick={() => editor.current?.replaceAllMatches()}
          >
            <ReplaceAll size={13} strokeWidth={1.8} />
            {t('search.replaceAll')}
          </button>
        </div>
      )}
    </div>
  )
}
