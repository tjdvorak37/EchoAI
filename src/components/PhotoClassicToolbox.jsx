import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import './PhotoClassicToolbox.css'

const flyoutPosition = (element, group) => {
  const bounds = element.getBoundingClientRect()
  const width = Math.min(300, window.innerWidth - 16)
  const height = Math.min(group.tools.length * 66 + 44, window.innerHeight - 16)
  return {
    width,
    left: Math.max(8, Math.min(bounds.right + 8, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(bounds.top, window.innerHeight - height - 8)),
  }
}

export function PhotoClassicToolbox({ groups, activeTool, onSelect }) {
  const [openGroup, setOpenGroup] = useState(null)
  const [chosenTools, setChosenTools] = useState({})
  const toolboxRef = useRef(null)
  const flyoutRef = useRef(null)
  const triggerRef = useRef(null)
  const id = useId()
  const openGroupId = openGroup?.group.id

  useEffect(() => {
    if (!openGroupId) return undefined
    flyoutRef.current?.querySelector('button')?.focus({ preventScroll: true })
    const dismissOutside = (event) => {
      if (toolboxRef.current?.contains(event.target) || flyoutRef.current?.contains(event.target)) return
      setOpenGroup(null)
    }
    const reposition = (event) => {
      if (flyoutRef.current?.contains(event.target)) return
      setOpenGroup((current) => current ? { ...current, ...flyoutPosition(triggerRef.current, current.group) } : null)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [openGroupId])

  const chooseTool = (group, tool) => {
    const returnFocus = flyoutRef.current?.contains(document.activeElement)
    setChosenTools((current) => ({ ...current, [group.id]: tool.key }))
    onSelect(tool.key)
    setOpenGroup(null)
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true })
  }

  const openFlyout = (group, event) => {
    if (openGroup?.group.id === group.id) {
      setOpenGroup(null)
      return
    }
    triggerRef.current = event.currentTarget
    setOpenGroup({
      group,
      ...flyoutPosition(event.currentTarget, group),
    })
  }

  const handleMenuKey = (event) => {
    const buttons = [...flyoutRef.current.querySelectorAll('button')]
    const index = buttons.indexOf(document.activeElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpenGroup(null)
      triggerRef.current?.focus({ preventScroll: true })
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      buttons[next]?.focus()
    } else if (event.key === 'Tab') {
      triggerRef.current?.focus({ preventScroll: true })
      setOpenGroup(null)
    }
  }

  return (
    <div ref={toolboxRef} className="photo-classic-toolbox" role="group" aria-label="Classic toolbox">
      {groups.map((group) => {
        const remembered = group.tools.find((tool) => tool.key === chosenTools[group.id])
        const selected = (remembered?.action ? remembered : group.tools.find((tool) => tool.key === activeTool))
          || remembered || group.tools[0]
        const Icon = selected.icon
        const expanded = openGroup?.group.id === group.id
        return (
          <div key={group.id} className="classic-tool-group">
            <button
              type="button"
              className="classic-tool-primary"
              aria-label={selected.label}
              aria-pressed={selected.action ? undefined : activeTool === selected.key}
              title={`${selected.label}${selected.shortcut ? ` (${selected.shortcut})` : ''}: ${selected.description}`}
              onClick={() => chooseTool(group, selected)}
            >
              <Icon size={20} aria-hidden="true" />
            </button>
            {group.tools.length > 1 && (
              <button
                type="button"
                className="classic-tool-expand"
                aria-label={`${group.label} tools`}
                aria-haspopup="menu"
                aria-expanded={expanded}
                aria-controls={expanded ? `${id}-flyout` : undefined}
                title={`${group.label} tools`}
                onClick={(event) => openFlyout(group, event)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowDown') return
                  event.preventDefault()
                  openFlyout(group, event)
                }}
              ><ChevronRight size={12} aria-hidden="true" /></button>
            )}
          </div>
        )
      })}
      {openGroup && createPortal(
        <div
          ref={flyoutRef}
          id={`${id}-flyout`}
          className="photo-classic-flyout"
          role="menu"
          aria-label={`${openGroup.group.label} tools`}
          style={{ left: openGroup.left, top: openGroup.top, width: openGroup.width }}
          onKeyDown={handleMenuKey}
        >
          <strong className="classic-flyout-heading">{openGroup.group.label}</strong>
          {openGroup.group.tools.map((tool) => {
            const Icon = tool.icon
            return (
              <button key={tool.key} type="button" role="menuitem" tabIndex={-1} onClick={() => chooseTool(openGroup.group, tool)}>
                <Icon size={19} aria-hidden="true" />
                <span><strong>{tool.label}</strong><small>{tool.description}</small></span>
                {tool.shortcut && <kbd>{tool.shortcut}</kbd>}
              </button>
            )
          })}
        </div>, document.body,
      )}
    </div>
  )
}
