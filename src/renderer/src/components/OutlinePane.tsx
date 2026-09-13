import { ListTree, X } from 'lucide-react'
import { memo } from 'react'
import { useT } from '../lib/i18n-react'
import type { OutlineEntry } from '../lib/outline'

interface OutlinePaneProps {
  open: boolean
  entries: OutlineEntry[]
  /** Line the caret is on, so the heading being read can be marked. */
  activeLine: number
  onSelect: (line: number) => void
  onClose: () => void
}

/** Width of one level of nesting, in pixels. */
const STEP = 14

function findActiveHeadingIndex(entries: OutlineEntry[], activeLine: number): number {
  let current = -1
  for (let index = 0; index < entries.length; index += 1) {
    if (entries[index].line <= activeLine) current = index
  }
  return current
}

function OutlinePane({ open, entries, activeLine, onSelect, onClose }: OutlinePaneProps) {
  const t = useT()

  // When closed, don't waste work rendering item trees.
  if (!open) {
    return (
      <aside className="outline-pane" aria-hidden="true" aria-label={t('outline.title')}>
        <div className="outline-pane__head">
          <ListTree className="outline-pane__icon" size={14} strokeWidth={1.7} />
          <span className="outline-pane__title">{t('outline.title')}</span>
        </div>
      </aside>
    )
  }

  // The heading above the caret is the section being read.
  const current = findActiveHeadingIndex(entries, activeLine)

  return (
    <aside
      className={`outline-pane${open ? ' is-open' : ''}`}
      aria-hidden={!open}
      aria-label={t('outline.title')}
    >
      <div className="outline-pane__head">
        <ListTree className="outline-pane__icon" size={14} strokeWidth={1.7} />
        <span className="outline-pane__title">{t('outline.title')}</span>
        {entries.length > 0 && <span className="outline-pane__count">{entries.length}</span>}
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

      <div className="outline-pane__body">
        {entries.length === 0 ? (
          <p className="outline-pane__empty">{t('outline.empty')}</p>
        ) : (
          entries.map((entry, index) => {
            const depth = entry.level - 1
            return (
              <button
                key={`${entry.line}-${entry.title}`}
                type="button"
                className={`outline-item is-level-${entry.level}${
                  index === current ? ' is-current' : ''
                }`}
                style={{
                  // Each entry carries a rail for every level above it, so the
                  // shape of the document is drawn rather than only indented.
                  ['--depth' as string]: String(depth),
                  ['--step' as string]: `${STEP}px`,
                  paddingLeft: 14 + depth * STEP,
                  animationDelay: `${Math.min(index, 12) * 14}ms`
                }}
                onClick={() => onSelect(entry.line)}
                title={entry.title}
              >
                <span className="outline-item__mark" />
                <span className="outline-item__title">{entry.title}</span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

export default memo(OutlinePane, (prev, next) => {
  // Both closed: skip render entirely
  if (!prev.open && !next.open) return true
  if (prev.open !== next.open) return false
  if (prev.entries !== next.entries) return false
  if (prev.onSelect !== next.onSelect || prev.onClose !== next.onClose) return false

  // If open and activeLine changed, only re-render if the highlighted heading changed
  return findActiveHeadingIndex(prev.entries, prev.activeLine) === findActiveHeadingIndex(next.entries, next.activeLine)
})
