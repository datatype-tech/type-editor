import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { FontGroup } from '../lib/settings'
import { FONTS, fontById } from '../lib/settings'
import type { MessageKey } from '../lib/i18n'
import { useT } from '../lib/i18n-react'

const GROUP_KEY: Record<FontGroup, MessageKey> = {
  sans: 'settings.group.sans',
  serif: 'settings.group.serif',
  mono: 'settings.group.mono',
  cjk: 'settings.group.cjk'
}

const GROUPS: FontGroup[] = ['sans', 'serif', 'mono', 'cjk']

interface FontPickerProps {
  id: string
  value: string
  onChange: (id: string) => void
}

/**
 * A select would be smaller, but it cannot show a face in its own typeface —
 * which is the one thing that makes choosing a font possible. The list opens in
 * the flow of the pane rather than over it, so it can never be clipped by the
 * pane's own scrolling.
 */
export default function FontPicker({ id, value, onChange }: FontPickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const current = fontById(value)

  return (
    <div className="fontpicker">
      <button
        id={id}
        type="button"
        className="select select--button"
        style={{ fontFamily: current.stack }}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="select__value">{current.label}</span>
        <ChevronDown
          className="select__chevron"
          size={13}
          strokeWidth={1.8}
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {open && (
        <div className="fontlist" role="listbox" aria-label={t('settings.editorFont')}>
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="fontlist__group">{t(GROUP_KEY[group])}</div>
              {FONTS.filter((font) => font.group === group).map((font) => (
                <button
                  key={font.id}
                  type="button"
                  role="option"
                  aria-selected={font.id === value}
                  className={`fontlist__item${font.id === value ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(font.id)
                    setOpen(false)
                  }}
                >
                  <span className="fontlist__name" style={{ fontFamily: font.stack }}>
                    {font.label}
                  </span>
                  <span className="fontlist__sample" style={{ fontFamily: font.stack }}>
                    Aa 汉 漢
                  </span>
                  <Check
                    className="fontlist__check"
                    size={13}
                    strokeWidth={2}
                    style={{ opacity: font.id === value ? 1 : 0 }}
                  />
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
