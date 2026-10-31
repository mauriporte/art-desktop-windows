import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Network, Trash2, FolderOpen, FolderDown, FileText, Image, PanelBottom, PanelBottomClose, Search, LayoutGrid, SquareTerminal, List } from 'lucide-react'
import { query, useSlider, load as loadPref, save } from './slider.js'
import { t, useLang } from './i18n.js'

const RECYCLE = 'shell:RecycleBinFolder', NETWORK = 'shell:NetworkPlacesFolder'
const STACK_ICONS = { Downloads: FolderDown, Documents: FileText, Pictures: Image }
const TOOL_ICONS = { Search, 'All desktops': LayoutGrid, 'Terminal (Admin)': SquareTerminal } // for a pack without them

// Mac-style dock on its screen's edge (left / right / top / bottom; right-click to change, or to add/remove stacks).
// Fully see-through: only the dark "dark apple" icon tiles show; hovering magnifies them in a wave with an orange glow.
// After the pinned apps come the stacks (newest files of a folder, or Red = network drives) and the Recycle Bin.
export default function Dock() {
  useLang()
  const { open, enter, setOpen, pinned, togglePin } = useSlider()
  // "Keep the dock open" (its right-click menu): pinned, it comes out and stays
  const pinRef = useRef(); pinRef.current = togglePin
  useEffect(() => { window.art?.onDockPin(() => pinRef.current()) }, []) // once: the listener calls the latest toggle
  useEffect(() => { if (pinned) setOpen(true) }, [pinned])
  const [apps, setApps] = useState([])
  const [stacks, setStacks] = useState([])
  const [stack, setStack] = useState(null) // { name, items }
  const [pos, setPos] = useState(null) // cursor position along the dock, for the magnify wave
  const [size, setSize] = useState({ w: innerWidth, h: innerHeight })
  const strip = useRef()
  const edge = query.get('edge') || 'bottom'
  const vertical = edge === 'left' || edge === 'right'

  const [gap, setGap] = useState(Number(loadPref('dockGap', 6))) // px between the icons and the screen edge
  const [taskbarHidden, setTaskbarHidden] = useState(false)
  // running apps: lnk -> [{min, fg}], refreshed while the dock is out
  const [running, setRunning] = useState({})
  const [extra, setExtra] = useState([]) // open apps that aren't pinned
  const pollWindows = () => { window.art?.appWindows().then((r) => r && setRunning(r)); window.art?.runningApps().then((r) => r && setExtra(r)) }
  useEffect(() => { if (!open) return; pollWindows(); const t = setInterval(pollWindows, 1500); return () => clearInterval(t) }, [open])
  useEffect(() => { window.art?.getTaskbarHidden().then(setTaskbarHidden); window.art?.onTaskbar(setTaskbarHidden) }, [])
  const load = () => { window.art?.dockApps().then(setApps); window.art?.stacks().then(setStacks) }
  useEffect(() => {
    load(); window.art?.onDockChanged(load)
    window.art?.onDockGap((px) => { setGap(px); save('dockGap', px) })
  }, [])
  useEffect(() => { const r = () => setSize({ w: innerWidth, h: innerHeight }); addEventListener('resize', r); return () => removeEventListener('resize', r) }, [])
  useEffect(() => { if (!open && stack) closeStack() }, [open])

  // the window grows only once the grid is drawn (growing first made the strip jump off its edge for a moment)
  useEffect(() => { if (stack) window.art?.dockExpand(true) }, [!!stack])
  const openStack = async (s) => {
    if (stack?.name === s.name) return closeStack()
    setStack({ name: s.name, network: s.type === 'network', path: s.path, items: null })
    setStack({ name: s.name, network: s.type === 'network', path: s.path, items: await window.art.stack(s.name) })
  }
  const closeStack = () => { setStack(null); window.art?.dockExpand(false) }

  // drag a pinned app along the dock: it follows the cursor and the others slide aside to make room; dropped, the
  // order is saved in dock.json (shared by every dock)
  const drag = useRef(null) // { key, from, x, y, moved }
  const [dragDelta, setDragDelta] = useState(null) // { key, dx, dy, to } while dragging
  const endDrag = () => { drag.current = null; setDragDelta(null) }
  const justDropped = useRef(false)
  const dropAt = () => {
    const d = dragDelta
    endDrag()
    if (d) { justDropped.current = true; setTimeout(() => (justDropped.current = false), 0) }
    if (!d || d.to === apps.findIndex((a) => a.lnk === d.key)) return
    const next = [...apps], from = next.findIndex((a) => a.lnk === d.key)
    next.splice(d.to, 0, next.splice(from, 1)[0])
    setApps(next); window.art?.dockOrder(next.map((a) => a.name))
  }
  const items = [
    ...apps.map((a) => a.tool && a.name === 'Taskbar'
      // the Windows taskbar switch: orange = taskbar hidden for good (the bottom edge no longer brings it up)
      ? { key: a.lnk, pin: true, title: t(taskbarHidden ? 'Taskbar hidden (click to show it)' : 'Hide the Windows taskbar'),
        Icon: taskbarHidden ? PanelBottomClose : PanelBottom, on: taskbarHidden,
        run: () => window.art?.setTaskbarHidden(!taskbarHidden).then(setTaskbarHidden) }
      : a.tool
      ? { key: a.lnk, pin: true, title: t(a.name), img: a.icon, full: a.fromPack, Icon: TOOL_ICONS[a.name], run: () => window.art?.dockTool(a.name) }
      : { key: a.lnk, pin: true, title: a.name, img: a.icon, full: a.fromPack, lnk: a.lnk, running: running[a.lnk],
        run: () => window.art?.activate(a.lnk).then(pollWindows) }),
    ...(extra.length ? [{ sep: true, key: 'sepRun' }] : []),
    ...extra.map((a) => ({ key: a.key, title: a.name, img: a.icon, full: a.fromPack, lnk: a.key, running: running[a.key],
      run: () => window.art?.activate(a.key).then(pollWindows) })),
    { sep: true, key: 'sep' },
    ...stacks.map((s) => ({ key: 'stack:' + s.name, title: t(s.type === 'network' ? 'Network' : s.name), Icon: s.type === 'network' ? Network : STACK_ICONS[s.name] ?? FolderOpen,
      stack: s.name, active: stack?.name === s.name, run: () => openStack(s) })),
    { key: 'trash', title: t('Recycle Bin'), Icon: Trash2, run: () => window.art?.openFile(RECYCLE) },
  ]
  // tile size: every item fits along the edge (60 px each at most)
  const along = (vertical ? size.h : size.w) - 32
  const step = Math.min(60, along / Math.max(items.length, 1))
  const tile = Math.max(24, step - 12)
  // the space the icons take at rest (no magnify): what "Reserve the dock's space" keeps free
  useEffect(() => { window.art?.dockThick(Math.round(tile + gap + 6)) }, [tile, gap])
  const away = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] }[edge]

  // magnify wave: icons near the cursor grow (up to 1.5x) and lift away from the edge
  const scaleOf = (el) => {
    if (pos == null || !el) return 1
    const r = el.getBoundingClientRect(), c = vertical ? r.top + r.height / 2 : r.left + r.width / 2
    return 1 + 0.5 * Math.max(0, 1 - Math.abs(pos - c) / (step * 2.2))
  }
  const refs = useRef({})
  const frame = useRef()
  const [frameAt, setFrameAt] = useState(8)
  // each stack shows as a grid or as a list, like the Mac's; its header button switches, and the choice is remembered
  const [views, setViews] = useState({})
  const viewOf = (name) => views[name] ?? loadPref('stackView:' + name, 'grid')
  const listed = stack && viewOf(stack.name) === 'list'
  const switchView = () => { const v = listed ? 'grid' : 'list'; save('stackView:' + stack.name, v); setViews({ ...views, [stack.name]: v }) }
  const openItem = (f) => { window.art?.openFile(f.path); closeStack(); setOpen(false) }
  const stripBox = (
    <div ref={strip} className={`flex shrink-0 justify-center ${vertical ? 'h-full flex-col' : 'w-full flex-row'}`}
      // icons hug the screen edge at `gap` px; the rest of the strip is room for the magnify wave
      style={{ [vertical ? 'width' : 'height']: 84, gap: step - tile, alignItems: edge === 'left' || edge === 'top' ? 'flex-start' : 'flex-end',
        [{ left: 'paddingLeft', right: 'paddingRight', top: 'paddingTop', bottom: 'paddingBottom' }[edge]]: gap }}
      onMouseMove={(e) => {
        setPos(vertical ? e.clientY : e.clientX)
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (!d.moved && Math.hypot(dx, dy) > 6) d.moved = true
        // the slot under the dragged icon: one slot per `step` along the dock
        if (d.moved) setDragDelta({ key: d.key, dx, dy, to: Math.max(0, Math.min(apps.length - 1, d.from + Math.round((vertical ? dy : dx) / step))) })
      }}
      onMouseLeave={() => { setPos(null); endDrag() }} onMouseUp={dropAt}>
      {items.map((it) => {
        if (it.sep) return <div key={it.key} className={`shrink-0 rounded bg-white/15 ${vertical ? 'h-px w-8' : 'h-8 w-px'}`} />
        const s = dragDelta ? 1 : scaleOf(refs.current[it.key]), lift = (s - 1) * tile * 0.5
        // while dragging: the dragged icon sits under the cursor, the ones between its old and new slot slide one step
        let move = `translate(${away[0] * lift}px, ${away[1] * lift}px) scale(${s})`, dragging = false
        if (dragDelta && it.pin) {
          const i = apps.findIndex((a) => a.lnk === it.key), from = apps.findIndex((a) => a.lnk === dragDelta.key), to = dragDelta.to
          if (it.key === dragDelta.key) { dragging = true; move = `translate(${dragDelta.dx}px, ${dragDelta.dy}px) scale(1.15)` }
          else {
            const shift = from < to && i > from && i <= to ? -step : from > to && i >= to && i < from ? step : 0
            move = vertical ? `translateY(${shift}px)` : `translateX(${shift}px)`
          }
        }
        return (
          <button key={it.key} ref={(el) => (refs.current[it.key] = el)} title={it.title} data-pin={it.pin ? it.key : undefined}
            onMouseDown={(e) => { if (it.pin && e.button === 0) drag.current = { key: it.key, from: apps.findIndex((a) => a.lnk === it.key), x: e.clientX, y: e.clientY } }}
            // a drag isn't a click (the click after a drop finds the drag already ended, so check the flag it leaves)
            onClick={() => { if (justDropped.current) return; it.run() }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); it.lnk ? window.art?.appMenu(it.lnk, pinned) : window.art?.dockMenu(it.stack, pinned) }}
            // orange glow + ring on the icon under the cursor (and on an open stack)
            className={`relative flex shrink-0 items-center justify-center rounded-[22%] bg-card transition-[transform,box-shadow] duration-150 hover:shadow-[0_0_16px_rgba(232,101,10,.75)] hover:ring-1 hover:ring-accent ${it.active ? 'shadow-[0_0_16px_rgba(232,101,10,.75)] ring-1 ring-accent' : 'shadow-lg'} ${dragging ? 'z-10 ring-1 ring-accent shadow-[0_0_16px_rgba(232,101,10,.75)] !transition-none' : ''} ${dragDelta ? 'cursor-grabbing' : ''}`}
            style={{ width: tile, height: tile, transform: move }}>
            {it.running && (
              // running dot on the screen-edge side; a hollow ring when every window of the app is minimized
              <span className={`absolute h-1.5 w-1.5 rounded-full ${it.running.every((w) => w.min) ? 'ring-1 ring-accent' : 'bg-accent'}`}
                style={{ left: { left: -4, right: 'auto', top: '50%', bottom: '50%' }[edge], right: edge === 'right' ? -4 : 'auto',
                  top: { top: -4, bottom: 'auto', left: '50%', right: '50%' }[edge], bottom: edge === 'bottom' ? -4 : 'auto',
                  transform: vertical ? 'translateY(-50%)' : 'translateX(-50%)' }} />
            )}
            {it.img ? <img src={it.img} draggable={false} className={`${it.full ? 'h-[108%] w-[108%]' : 'h-[68%] w-[68%]'} object-contain`}
              style={{ filter: 'saturate(.8) brightness(.9)' }} />
              : it.Icon && <it.Icon size={tile * 0.5} className={it.on ? 'text-accent' : 'text-[#d8d8d8]'} />}
          </button>
        )
      })}
    </div>
  )
  // the frame is as big as its files and sits by the stack's icon, kept inside the window
  useLayoutEffect(() => {
    const icon = stack && refs.current['stack:' + stack.name]?.getBoundingClientRect(), box = frame.current?.getBoundingClientRect()
    if (!icon || !box) return
    const len = vertical ? box.height : box.width, middle = vertical ? icon.top + icon.height / 2 : icon.left + icon.width / 2
    setFrameAt(Math.max(8, Math.min((vertical ? size.h : size.w) - len - 8, middle - len / 2)))
  }, [stack, size, listed])
  const grid = stack && (
    <div ref={frame} className="m-2 flex max-h-[calc(100%-16px)] min-h-0 w-fit flex-col gap-3 self-start overflow-hidden rounded-2xl bg-[#050505]/85 p-4 shadow-2xl ring-1 ring-white/10"
      style={{ [vertical ? 'marginTop' : 'marginLeft']: frameAt }}>
      <div className="flex items-center gap-4">
        <span className="font-semibold">{t(stack.network ? 'Network' : stack.name)}</span>
        <button className="ml-auto rounded-full bg-card px-3 py-1 text-xs hover:text-accent"
          onClick={() => { window.art?.openFile(stack.network ? NETWORK : stack.path); closeStack(); setOpen(false) }}>
          {t('Open in Explorer')}</button>
        <button title={t(listed ? 'Show as grid' : 'Show as list')} className="rounded-full bg-card p-1.5 hover:text-accent" onClick={switchView}>
          {listed ? <LayoutGrid size={14} /> : <List size={14} />}</button>
      </div>
      {!stack.items ? <p className="text-sm text-muted">…</p> : !stack.items.length ? <p className="text-sm text-muted">{t('Empty')}</p> : listed ? (
        <div className="flex min-h-0 w-80 flex-col gap-0.5 overflow-y-auto">
          {stack.items.map((f) => (
            <button key={f.path} title={f.name} className="flex shrink-0 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-accent/25" onClick={() => openItem(f)}>
              <img src={f.icon} draggable={false} className="h-6 w-6 shrink-0 object-contain" />
              <span className="min-w-0 truncate text-[13px] text-[#e4e5ea]">{f.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid min-h-0 gap-3 overflow-y-auto" style={{ gridTemplateColumns: `repeat(${Math.min(4, stack.items.length)}, 84px)` }}>
          {stack.items.map((f) => (
            <button key={f.path} title={f.name} className="group flex flex-col items-center gap-1 rounded-xl p-1 hover:bg-white/5"
              onClick={() => openItem(f)}>
              <img src={f.icon} draggable={false} className="h-14 w-14 rounded-lg object-contain group-hover:drop-shadow-[0_0_8px_rgba(232,101,10,.7)]" />
              <span className="w-full truncate text-center text-[11px] text-[#c9cbd3]">{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
  // the strip hugs its edge; an open stack's grid sits beside it, away from the edge
  const first = edge === 'left' || edge === 'top'
  return (
    // the strip always hugs its screen edge, whatever size the window is at that moment
    <div className={`flex h-full w-full ${vertical ? 'flex-row' : 'flex-col'} ${first ? 'justify-start' : 'justify-end'}`} onMouseEnter={enter}
      onContextMenu={(e) => { e.preventDefault(); window.art?.dockMenu(undefined, pinned) }}>
      {open && (first ? <>{stripBox}{grid}</> : <>{grid}{stripBox}</>)}
    </div>
  )
}
