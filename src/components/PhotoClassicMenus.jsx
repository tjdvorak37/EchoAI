import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './PhotoClassicMenus.css'

const menuPosition = (trigger) => {
  const bounds = trigger.getBoundingClientRect()
  const width = Math.min(280, window.innerWidth - 16)
  return {
    width,
    left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(bounds.bottom + 4, window.innerHeight - 48)),
  }
}

export function PhotoClassicMenus({ menus }) {
  const [open, setOpen] = useState(null)
  const barRef = useRef(null)
  const popupRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const menu = menus.find((item) => item.label === open?.label)

  const showMenu = (index, focusLast = false) => {
    const trigger = barRef.current.querySelectorAll('button')[index]
    triggerRef.current = trigger
    setOpen({ label: menus[index].label, ...menuPosition(trigger), focusLast })
  }
  const dismiss = (restoreFocus = false) => {
    setOpen(null)
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!open?.label) return undefined
    const buttons = [...popupRef.current.querySelectorAll('button:not(:disabled)')]
    const focusTarget = (open.focusLast ? buttons.at(-1) : buttons[0]) || popupRef.current
    focusTarget?.focus({ preventScroll: true })
    const outside = (event) => {
      if (barRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return
      setOpen(null)
    }
    const reposition = (event) => {
      if (event.target instanceof Node && popupRef.current?.contains(event.target)) return
      setOpen((current) => current ? { ...current, ...menuPosition(triggerRef.current) } : null)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('focusin', outside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('focusin', outside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open?.label, open?.focusLast])

  const handlePopupKey = (event) => {
    if (event.key === 'Tab') {
      dismiss(true)
      return
    }
    if (!['Escape', 'ArrowDown', 'ArrowUp', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return dismiss(true)
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const index = menus.findIndex((item) => item.label === open.label)
      showMenu((index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length)
      return
    }
    const buttons = [...popupRef.current.querySelectorAll('button:not(:disabled)')]
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return <>
    <div ref={barRef} className="sidebar-menu-bar photo-classic-command-bar" role="menubar" aria-label="Classic main menu">
      {menus.map((item, index) => <button key={item.label} type="button" role="menuitem"
        className="menu-item-compact" aria-haspopup="menu" aria-expanded={menu?.label === item.label}
        aria-controls={menu?.label === item.label ? `${id}-popup` : undefined}
        onClick={() => menu?.label === item.label ? dismiss() : showMenu(index)}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            showMenu(index, event.key === 'ArrowUp')
          } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            event.stopPropagation()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? menus.length - 1
              : (index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length
            barRef.current.querySelectorAll('button')[next]?.focus()
          }
        }}
      >{item.label}</button>)}
    </div>
    {menu && createPortal(<div ref={popupRef} id={`${id}-popup`}
      className="photo-classic-command-popup" role="menu" aria-label={`${menu.label} commands`}
      tabIndex={-1}
      style={{ width: open.width, left: open.left, top: open.top, maxHeight: `calc(100dvh - ${open.top + 8}px)` }}
      onKeyDown={handlePopupKey}>
      {menu.items.map((item, index) => item.separator
        ? <hr key={`separator-${index}`} role="separator" />
        : <button key={item.label} type="button" tabIndex={-1}
          role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
          aria-label={item.label} aria-checked={item.checked} disabled={item.disabled} title={item.description}
          onClick={() => { dismiss(true); item.onSelect() }}>
          <span className="classic-command-check" aria-hidden="true">{item.checked ? '\u2713' : ''}</span>
          <span>{item.label}</span>{item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>)}
    </div>, document.body)}
  </>
}
