import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { load, save } from './slider.js'

// A grid of tiles the user can rearrange by dragging (like the dock): the dragged tile follows the cursor and the others
// slide into their new places as it passes over them. The order is kept per grid (`name`) in storage; tiles not in the
// saved order (new ones) keep their place after the ordered ones. Children need stable keys.
export default function Sortable({ name, className, style, onScroll, locked, children }) {
  const kids = Children.toArray(children).filter(Boolean)
  const keyOf = (c) => String(c.key).replace(/^\.\$/, '')
  const [order, setOrder] = useState(() => { try { return JSON.parse(load(`order:${name}`, '[]')) } catch { return [] } })
  const rank = (k) => { const i = order.indexOf(k); return i < 0 ? order.length : i }
  const sorted = kids.map((c, i) => [c, i]).sort((a, b) => rank(keyOf(a[0])) - rank(keyOf(b[0])) || a[1] - b[1]).map(([c]) => c)

  const els = useRef({}), pos = useRef({})
  const press = useRef(null) // { key, x, y, gx, gy, moved }
  const [drag, setDrag] = useState(null) // { key, x, y } once moving
  const swallowClick = useRef(false)

  useEffect(() => {
    const move = (e) => {
      const p = press.current
      if (!p) return
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      p.moved = true
      setDrag({ key: p.key, x: e.clientX, y: e.clientY })
      // the tile under the cursor (the dragged one ignores the pointer) takes the dragged tile's place
      // no flicker: after a swap the tiles glide for a moment, and the tile just swapped with can slide back under the
      // cursor; so nothing swaps while they glide, nor with that same tile until the cursor has left it
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest(`[data-sort="${name}"]`)?.dataset.key
      if (over !== p.last) p.last = undefined
      if (over && over !== p.key && over !== p.last && Date.now() > (p.calm ?? 0)) {
        p.last = over; p.calm = Date.now() + 200
        const keys = sorted.map(keyOf), from = keys.indexOf(p.key), to = keys.indexOf(over)
        keys.splice(to, 0, keys.splice(from, 1)[0])
        setOrder(keys)
      }
    }
    const up = () => {
      if (press.current?.moved) { swallowClick.current = true; setTimeout(() => (swallowClick.current = false), 0); save(`order:${name}`, JSON.stringify(order)) }
      press.current = null; setDrag(null)
    }
    addEventListener('pointermove', move); addEventListener('pointerup', up)
    return () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up) }
  })

  // the dragged tile sits under the cursor; the others glide from where they were to their new place
  useLayoutEffect(() => {
    for (const [k, el] of Object.entries(els.current)) {
      if (!el) continue
      const now = { x: el.offsetLeft, y: el.offsetTop }, prev = pos.current[k]
      if (drag?.key === k) {
        const p = press.current, parent = el.offsetParent.getBoundingClientRect()
        el.style.transition = 'none'
        // (a scrolled strip shifts its tiles by its scroll position)
        const sc = el.offsetParent
        el.style.transform = `translate(${drag.x - p.gx - parent.left - now.x + sc.scrollLeft}px, ${drag.y - p.gy - parent.top - now.y + sc.scrollTop}px) scale(1.04)`
      } else if (prev && (prev.x !== now.x || prev.y !== now.y)) {
        el.style.transition = 'none'
        el.style.transform = `translate(${prev.x - now.x}px, ${prev.y - now.y}px)`
        el.getBoundingClientRect()
        el.style.transition = 'transform 160ms ease-out'
        el.style.transform = ''
      } else if (!drag && el.style.transform) { el.style.transition = 'transform 160ms ease-out'; el.style.transform = '' }
      pos.current[k] = now
    }
  })

  return (
    <div className={`relative ${className ?? ''}`} style={style} onScroll={onScroll} onClickCapture={(e) => { if (swallowClick.current) { e.stopPropagation(); e.preventDefault() } }}>
      {sorted.map((c) => {
        const k = keyOf(c), dragging = drag?.key === k
        return (
          <div key={k} data-sort={name} data-key={k} ref={(el) => (els.current[k] = el)}
            // a child with span={[w, h]} takes that many cells of a CSS grid
            style={c.props.span ? { gridColumn: `span ${c.props.span[0]}`, gridRow: `span ${c.props.span[1]}` } : undefined}
            className={`grid ${dragging ? 'pointer-events-none z-20 rounded-2xl shadow-[0_0_16px_rgba(232,101,10,.6)]' : ''}`}
            onPointerDown={(e) => {
              if (e.button !== 0 || locked) return // locked: nothing moves
              // grab offset inside the tile, so it stays under the same spot of the cursor
              const r = els.current[k].getBoundingClientRect()
              press.current = { key: k, x: e.clientX, y: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, moved: false }
            }}>
            {c}
          </div>
        )
      })}
    </div>
  )
}
