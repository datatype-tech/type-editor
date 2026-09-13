import { Check } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

interface DropdownProps {
  /** Which edge of the trigger the flyout hugs. */
  align?: 'left' | 'right'
  className?: string
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode
  children: (close: () => void) => ReactNode
}

/**
 * An anchored flyout that closes on outside pointer-down and on Escape. Kept
 * deliberately small: the menus in this app are short lists, not windows.
 */
export default function Dropdown({ align = 'right', className, trigger, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const hostRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => setOpen((current) => !current), [])

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent): void => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className={`dropdown${className ? ` ${className}` : ''}`} ref={hostRef}>
      {trigger({ open, toggle })}
      {open && (
        <div className={`menu menu--below-${align}`} role="menu">
          {children(close)}
        </div>
      )}
    </div>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="menu__label">{children}</div>
}

export function MenuSeparator() {
  return <div className="menu__separator" role="separator" />
}

interface MenuItemProps {
  icon?: ReactNode
  hint?: string
  selected?: boolean
  title?: string
  onSelect: () => void
  children: ReactNode
}

export function MenuItem({ icon, hint, selected, title, onSelect, children }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={Boolean(selected)}
      title={title}
      className={`menu__item${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      {icon && <span className="menu__item-icon">{icon}</span>}
      <span className="menu__item-label">{children}</span>
      {hint && <span className="menu__item-hint">{hint}</span>}
      {selected && <Check className="menu__check" size={14} strokeWidth={2} />}
    </button>
  )
}
