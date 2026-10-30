import { useEffect, useRef, useState } from 'react'

// per-viewer conveniences; storage may be unavailable, so never required
export const load = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
export const save = (k, v) => { try { localStorage.setItem(k, v) } catch {} }
export const query = new URLSearchParams(location.search)

// Open/close logic shared by the notch, the side panel and the docks: opened by its edge dash (or hovering it),
// closed ~0.6 s after the cursor leaves (checked by position: page mouseleave also fires over embedded screens),
// pinned = stays open. The pin is kept per window (kind + screen).
export function useSlider() {
  const pinKey = `pinned:${query.get('view')}:${query.get('screen')}`
  const [open, setOpenState] = useState(false)
  const [pinned, setPinned] = useState(load(pinKey, '') === '1')
  const pinnedRef = useRef(pinned)
  pinnedRef.current = pinned

  const setOpen = (v) => { if (!v && pinnedRef.current) return; setOpenState(v); window.art?.setOpen(v) }
  const togglePin = () => { const p = !pinned; setPinned(p); save(pinKey, p ? '1' : '') }
  const enter = () => { if (!open) setOpen(true) }
  useEffect(() => {
    if (pinned || query.get('open')) setOpen(true)
    window.art?.onOpened(() => setOpenState(true))
  }, [])
  const visited = useRef(!query.has('open')) // --open (layout checks) stays open until the cursor has been in once
  useEffect(() => {
    if (!open || pinned) return
    let outside = 0
    const t = setInterval(async () => {
      const inside = await window.art?.inside()
      if (inside) visited.current = true
      outside = inside ? 0 : outside + 1
      if (outside >= 2 && visited.current) setOpen(false)
    }, 300)
    return () => clearInterval(t)
  }, [open, pinned])
  // opened from elsewhere (the dashboard's assistant tile): stay open until the cursor has been in once
  const holdOpen = () => { visited.current = false }
  return { open, setOpen, pinned, togglePin, enter, holdOpen }
}
