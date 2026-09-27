import { useCallback, useEffect, useState } from 'react'

const isTyping = (target) => target instanceof HTMLElement
  && (['input', 'textarea', 'select'].includes(target.tagName.toLowerCase()) || target.isContentEditable)

// Focus mode pins an editor over the whole app window; F toggles it, like Photoshop's screen modes.
export function useEditorFocusMode() {
  const [focused, setFocused] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const toggle = useCallback(() => setFocused((value) => !value), [])

  useEffect(() => {
    document.documentElement.classList.toggle('editor-focus-active', focused)
    if (!focused && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    return () => document.documentElement.classList.remove('editor-focus-active')
  }, [focused])

  useEffect(() => {
    const onKey = (event) => {
      if (event.code !== 'KeyF' || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      if (document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      setFocused((value) => !value)
    }
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement))
    window.addEventListener('keydown', onKey)
    document.addEventListener('fullscreenchange', onFullscreen)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('fullscreenchange', onFullscreen)
    }
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  return { focused, toggle, fullscreen, toggleFullscreen }
}
