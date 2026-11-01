import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Droplet, MousePointerClick, MousePointerBan, Pin, PinOff, LockKeyhole, LockKeyholeOpen, CalendarDays, ChevronRight, Lightbulb, ToggleLeft, Fan, Sparkles, ScrollText, CircleDot, Gauge, Activity, Blinds, Lock, Thermometer, Pencil, Check, X, Plus, Search, MoveDiagonal2 } from 'lucide-react'
import Sortable from './Sortable.jsx'
import Screens from './Screens.jsx'
import { Switch } from './HaTiles.jsx'
import { load, save } from './slider.js'
import { t, useLang, words, locale } from './i18n.js'

const ha = (op, ...a) => window.art?.ha(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })
const ICON = { light: Lightbulb, switch: ToggleLeft, input_boolean: ToggleLeft, fan: Fan, scene: Sparkles, script: ScrollText, button: CircleDot,
  sensor: Gauge, binary_sensor: Activity, cover: Blinds, lock: Lock, climate: Thermometer }
// what a tap does per domain (sensors only show their value)
const TAP = { light: 'toggle', switch: 'toggle', input_boolean: 'toggle', fan: 'toggle', cover: 'toggle', scene: 'turn_on', script: 'turn_on', button: 'press' }
const isOn = (s) => ['on', 'open', 'unlocked', 'heat', 'cool', 'playing'].includes(s?.state)
const CELL = 140, GAP = 14, COLS = 10 // the grid: tiles span 1-4 cells each way; CELL is the largest a cell gets
// the named tile colours, from the phone widget's palette
const TONES = { blue: '#29B6F6', purple: '#AB47BC', amber: '#FFC107', green: '#66BB6A', red: '#f44336', yellow: '#FFEB3B', cyan: '#26C6DA',
  indigo: '#7E57C2', darkblue: '#1E66D0', white: '#F2F2F2', teal: '#26A69A' }
const SIZES = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 2], [4, 2]]

// one glass tile: icon, name, state; orange while on
// a tile is an HA entity ({ entity }), optionally with HA's own touches from an imported dashboard: icon (an MDI path),
// color, confirm (text: a second tap does it), action ({ service, entity }: e.g. trigger an automation), assist (opens
// the voice assistant's talk card), nav (an HA path, opened in the browser), camera (a live picture)
function Tile({ tile, s, edit, remove, flash, open, resize, projects, loaded, cell = CELL }) {
  const domain = tile.entity?.split('.')[0], Icon = ICON[domain] ?? CircleDot, on = isOn(s)
  const link = tile.nav || tile.url || tile.app || tile.action || tile.assist || tile.relay || tile.projects // opens or does something (it may still show its entity's value)
  // before the first read nothing is "unavailable" yet: the tile just waits
  const missing = tile.entity ? (s ? s.state === 'unavailable' : loaded) : !link
  const [armed, setArmed] = useState(false)
  // the phone widget's look in the A.R.T. accent
  const toggles = ['light', 'switch', 'input_boolean', 'fan', 'cover', 'lock'].includes(domain) && !tile.action
  // orange, with a few exceptions: the alarm red, groups (a light/switch made of others) a darker orange, and a
  // colour named on the tile (the modes, the buttons)
  const hue = domain === 'alarm_control_panel' ? '#f44336' : TONES[tile.color] ?? (s?.group ? '#B34700' : '#E8650A')
  const lit = toggles ? on : !missing // things that aren't on/off always show in their colour
  const [img, setImg] = useState(null)
  useEffect(() => {
    if (!tile.camera) return
    let live = true
    const read = () => ha('camera', tile.entity).then((r) => live && r.value && setImg(r.value))
    read(); const id = setInterval(read, 2000); return () => { live = false; clearInterval(id) }
  }, [tile.camera, tile.entity])
  const value = tile.camera || !tile.entity ? '' : !s && !loaded ? '…' : missing ? t('Unavailable') : domain === 'todo' ? `${s.state} ${t('pending')}`
    : ['sensor', 'climate', 'alarm_control_panel'].includes(domain) ? `${t(s.state)}${s.unit ? ` ${s.unit}` : ''}`
    : ['scene', 'script', 'button'].includes(domain) ? '' : t(on ? 'On' : 'Off')
  // the corner handle (edit mode): drag to resize, snapping to whole cells; committed when let go
  const grab = (e) => {
    e.stopPropagation(); e.preventDefault()
    const x0 = e.clientX, y0 = e.clientY, w0 = tile.w ?? 1, h0 = tile.h ?? 1
    const size = (ev) => [Math.max(1, Math.min(4, Math.round(w0 + (ev.clientX - x0) / (cell + GAP)))), Math.max(1, Math.min(4, Math.round(h0 + (ev.clientY - y0) / (cell + GAP))))]
    const move = (ev) => resize(...size(ev), false)
    const up = (ev) => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); resize(...size(ev), true) }
    addEventListener('pointermove', move); addEventListener('pointerup', up)
  }
  const tap = () => {
    if (edit) return open()
    const go = () => tile.url ? window.art?.overlay.openUrl(tile.url) : tile.app ? window.art?.overlay.openApp(tile.app) : tile.nav && window.art?.overlay.openHa(tile.nav)
    if (tile.assist) return window.art?.overlay.talk()
    if (tile.projects) return projects()
    // a request to another Claude session (e.g. "make a new Home Info"), sent as the user's own words, then whatever it opens
    if (tile.relay) {
      if (tile.confirm && !armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return flash(t(tile.confirm)) }
      setArmed(false); flash(t('Asked') + ' ' + tile.relay.session)
      window.art?.overlay.relay(tile.relay.session, tile.relay.text).then((r) => r?.error && flash(`${tile.relay.session}: ${r.error}`))
      return go()
    }
    if (!tile.action && (tile.url || tile.app || tile.nav)) return go()
    if (missing) return
    if (tile.confirm && !armed) { setArmed(true); setTimeout(() => setArmed(false), 5000); return flash(t(tile.confirm)) }
    setArmed(false)
    const [d, service, id] = tile.action ? [tile.action.service.split('.')[0], tile.action.service.split('.')[1], tile.action.entity]
      : [domain, domain === 'lock' ? (s.state === 'locked' ? 'unlock' : 'lock') : TAP[domain], tile.entity]
    if (service) ha('call', d, service, { entity_id: id }).then((r) => r.error && flash(`${tile.name || s?.name}: ${r.error}`))
    if (tile.action) go() // then what it opens, if anything (Herald: its page)
  }
  return (
    // the phone widget's look (JLP), in orange: active = tinted and outlined, status in orange,
    // inactive = grey; a small rounded badge holds the icon, the name sits at the bottom
    <button onClick={tap} style={lit ? { background: `color-mix(in srgb, ${hue} calc(20% * var(--glass, 1)), transparent)`, boxShadow: `inset 0 0 0 2px ${hue}` } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}
      className={`relative flex h-full w-full flex-col justify-between overflow-hidden rounded-2xl p-3 text-left shadow-xl transition hover:brightness-110
      ${armed ? 'outline outline-2 outline-accent' : ''} ${missing ? 'opacity-50' : ''}`}>
      {tile.camera && img && <img src={img} className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: lit ? `${hue}55` : 'rgba(255,255,255,.08)', color: lit ? '#fff' : '#8a8a8e' }}>
        {tile.icon ? <svg viewBox="0 0 24 24" width="18" height="18"><path d={tile.icon} fill="currentColor" /></svg> : <Icon size={18} />}
      </span>
      <div className={`relative min-w-0 ${tile.camera ? 'rounded-lg bg-[#050505]/60 px-1.5 py-0.5' : ''}`}>
        <div className={`line-clamp-2 text-sm font-bold leading-tight ${lit ? 'text-white' : 'text-[#9e9e9e]'}`}>{armed ? t('Tap again to confirm') : words(t(tile.name || s?.name || tile.entity))}</div>
        {value && <div className="truncate text-xs" style={{ color: lit ? hue : '#8a8a8e' }}>{value}</div>}
      </div>
      {edit && <span onClick={(e) => { e.stopPropagation(); remove() }} title={t('Remove')}
        className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-white ring-1 ring-accent hover:bg-accent hover:text-ink"><X size={14} /></span>}
      {edit && <span onPointerDown={grab} onClick={(e) => e.stopPropagation()} title={t('Drag to resize')}
        className="absolute bottom-1.5 right-1.5 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-full bg-ink/80 text-accent ring-1 ring-accent/60"><MoveDiagonal2 size={14} /></span>}
    </button>
  )
}

// edit one tile: its name (empty = HA's) and size
function Editor({ tile, s, done, close }) {
  const [name, setName] = useState(tile.name ?? '')
  const [size, setSize] = useState([tile.w ?? 1, tile.h ?? 1])
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/40 pt-32" onClick={close}>
      <form className="flex w-[420px] flex-col gap-4 rounded-3xl bg-[#050505]/95 p-5 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); done({ ...tile, name: name.trim() || undefined, w: size[0], h: size[1] }) }}>
        <div className="text-xs text-muted">{tile.entity ?? tile.nav ?? tile.url ?? tile.app ?? t('Calendar')}</div>
        <label className="flex flex-col gap-1 text-sm">{t('Name')}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={s?.name ?? tile.entity} className="rounded-full bg-card px-4 py-2 outline-none ring-1 ring-white/10 focus:ring-accent" /></label>
        <div className="flex flex-col gap-1 text-sm">{t('Size')}
          <div className="flex flex-wrap gap-2">{SIZES.map(([w, h]) => (
            <button type="button" key={`${w}x${h}`} onClick={() => setSize([w, h])}
              className={`rounded-full px-3 py-1 text-sm ${size[0] === w && size[1] === h ? 'bg-accent font-semibold text-ink' : 'bg-card text-muted hover:text-white'}`}>{w}×{h}</button>
          ))}</div></div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-full bg-[#3a3a3c] px-4 py-1.5 text-sm">{t('Cancel')}</button>
          <button type="submit" className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-ink">{t('Save')}</button>
        </div>
      </form>
    </div>
  )
}

// the "add a tile" search: every light, switch, scene, sensor… HA has
function Picker({ have, add, close }) {
  const [all, setAll] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { ha('entities').then((r) => setAll(r.value ?? [])) }, [])
  const shown = (all ?? []).filter((e) => !have.includes(e.id) && `${e.name} ${e.id}`.toLowerCase().includes(q.toLowerCase())).slice(0, 80)
  return (
    <div className="absolute inset-0 z-30 flex items-start justify-center bg-black/40 pt-24" onClick={close}>
      <div className="flex max-h-[70vh] w-[520px] flex-col gap-3 rounded-3xl bg-[#050505]/95 p-4 shadow-2xl ring-1 ring-white/10" onClick={(e) => e.stopPropagation()}>
        <label className="flex items-center gap-2 rounded-full bg-card px-4 py-2">
          <Search size={16} className="text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search a light, switch, scene, sensor…')} className="flex-1 bg-transparent outline-none" />
        </label>
        <div className="flex min-h-0 flex-col gap-1 overflow-y-auto">
          {!all && <p className="text-sm text-muted">…</p>}
          {shown.map((e) => {
            const Icon = ICON[e.id.split('.')[0]] ?? CircleDot
            return (
              <button key={e.id} onClick={() => add(e.id)} className="flex items-center gap-3 rounded-2xl px-3 py-2 text-left hover:bg-card">
                <Icon size={18} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate">{e.name}</span><span className="truncate text-xs text-muted">{e.id}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// the calendar tile: what's coming in the next two weeks from the chosen calendars; a chip per calendar shows or
// hides it (kept on this PC)
const CAL_TONES = ['#E8650A', '#29B6F6', '#AB47BC', '#66BB6A', '#FFC107', '#f44336', '#26C6DA', '#EC407A']
export function CalendarTile({ edit, remove, open }) {
  const [cals, setCals] = useState([])
  const [events, setEvents] = useState(null)
  const [hidden, setHidden] = useState(() => { try { return JSON.parse(load('calHidden', '[]')) } catch { return [] } })
  const [failed, setFailed] = useState(false) // the last read didn't answer; it's being retried
  // HA may not answer yet (the app starts with Windows): keep asking until it does
  useEffect(() => {
    let timer, gone = false
    const get = () => ha('calendars').catch(() => ({})).then((r) => {
      if (gone) return
      setFailed(!r?.value)
      if (r?.value) { setCals(r.value); if (!r.value.length) setEvents([]) } else timer = setTimeout(get, 15000)
    })
    get()
    return () => { gone = true; clearTimeout(timer) }
  }, [])
  useEffect(() => {
    const ids = cals.map((c) => c.entity_id).filter((id) => !hidden.includes(id))
    if (!cals.length) return
    let retry
    const read = () => {
      clearTimeout(retry)
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const end = new Date(start.getTime() + 14 * 86400000)
      // all-day events end at midnight of the next day: one that ended by today's start is yesterday's
      const ends = (e) => new Date(e.end?.dateTime ?? `${e.end?.date}T00:00`)
      ha('events', ids, start.toISOString(), end.toISOString()).catch(() => ({})).then((r) => {
        setFailed(!r?.value)
        if (r?.value) setEvents(r.value.filter((e) => ends(e) > start).sort((a, b) => when(a) - when(b)))
        else retry = setTimeout(read, 30000)
      })
    }
    read(); const id = setInterval(read, 5 * 60000); return () => { clearInterval(id); clearTimeout(retry) }
  }, [cals, hidden])
  const when = (e) => new Date(e.start.dateTime ?? `${e.start.date}T00:00`)
  const toggle = (id) => { const h = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id]; setHidden(h); save('calHidden', JSON.stringify(h)) }
  const tone = (id) => CAL_TONES[cals.findIndex((c) => c.entity_id === id) % CAL_TONES.length]
  const day = (d) => { const t0 = new Date(); t0.setHours(0, 0, 0, 0); const n = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0) / 86400000)
    return n === 0 ? t('Today') : n === 1 ? t('Tomorrow') : new Date(d).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }) }
  let last = ''
  return (
    <div onClick={() => edit && open()} className="relative flex h-full w-full flex-col gap-2 overflow-hidden rounded-2xl p-3 shadow-xl"
      style={{ background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: '#E8650A55' }}><CalendarDays size={18} /></span>
        <span className="text-sm font-bold">{t('Calendar')}</span>
      </div>
      <div className="flex flex-wrap gap-1">{cals.map((c) => {
        const off = hidden.includes(c.entity_id)
        return <button key={c.entity_id} onClick={(e) => { e.stopPropagation(); toggle(c.entity_id) }}
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={off ? { color: '#8a8a8e', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)' } : { color: '#fff', background: `${tone(c.entity_id)}55`, boxShadow: `inset 0 0 0 1px ${tone(c.entity_id)}` }}>{c.name}</button>
      })}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1 text-xs">
        {!events ? <span className="text-muted">{failed ? t("Can't read the calendar, trying again") : '…'}</span> : !events.length ? <span className="text-muted">{t('Nothing in the next two weeks.')}</span> : events.map((e, i) => {
          const d = day(when(e)), head = d !== last; last = d
          return (
            <div key={i}>
              {head && <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{d}</div>}
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone(e.calendar) }} />
                <span className="w-[4.5rem] shrink-0 whitespace-nowrap text-muted">{e.start.dateTime ? when(e).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : t('All day')}</span>
                <span className="truncate">{e.summary}</span>
              </div>
            </div>
          )
        })}
      </div>
      {edit && <span onClick={(e) => { e.stopPropagation(); remove() }} title={t('Remove')}
        className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-ink text-white ring-1 ring-accent hover:bg-accent hover:text-ink"><X size={14} /></span>}
    </div>
  )
}

// the projects panel (Proyectos tile): every repo, newest change first, with what's pending on this PC, and the open
// pull requests; a tap opens it on GitHub
function ProjectsPanel({ close }) {
  const [d, setD] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { window.art?.overlay.projects().then((r) => (r.error ? setError(r.error) : setD(r.value))) }, [])
  const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d` }
  const row = (key, on, title, sub, status, url) => (
    <button key={key} onClick={() => window.art?.overlay.openUrl(url)} style={on ? { background: 'color-mix(in srgb, #E8650A calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #E8650A' } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}
      className="flex shrink-0 flex-col rounded-2xl px-3 py-2 text-left transition hover:brightness-110">
      <span className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span><span className="shrink-0 text-xs" style={{ color: on ? '#E8650A' : '#8a8a8e' }}>{status}</span></span>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </button>
  )
  return (
    <div className="absolute inset-0 z-20" onClick={close}>
      <div className="absolute inset-y-0 right-0 flex w-[440px] flex-col gap-3 bg-[#050505]/90 p-5 shadow-2xl ring-1 ring-white/10 animate-[slidein_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">{t('Projects')}</span>
          {d && <span className="text-sm text-muted">{d.repos.length}</span>}
          <button onClick={close} className="ml-auto rounded-full p-1 text-muted hover:text-white"><X size={18} /></button>
        </div>
        {error && <p className="text-sm text-muted">{error}</p>}
        {!d && !error && <p className="text-sm text-muted">…</p>}
        {d && <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {d.prs.length > 0 && <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('Open pull requests')}</div>}
          {d.prs.map((p) => row(p.url, true, `${p.repo}#${p.number}`, p.title, t('Open'), p.url))}
          <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('Repositories')}</div>
          {d.repos.map((r) => {
            const pending = r.local && (r.local.changed || r.local.unpushed)
            const status = !r.local ? (r.private ? t('Private') : t('Public')) : pending
              ? [r.local.changed && `${r.local.changed} ${t('unsaved')}`, r.local.unpushed && `${r.local.unpushed} ${t('not pushed')}`].filter(Boolean).join(' · ') : t('Up to date')
            return row(r.url, !!pending, `${r.private ? '🔒 ' : ''}${r.name}`, [r.description, `${t('changed')} ${ago(r.pushedAt)}`, r.release].filter(Boolean).join(' · '), status, r.url)
          })}
        </div>}
      </div>
    </div>
  )
}

// ADB Control / Stream Control (an entry with "screens": "ADB" | "Stream"): its device switches on top, as in HA, and the
// live device screens underneath (the notch's Screens view)
function ScreensPanel({ server, close, flash }) {
  const [states, setStates] = useState({})
  const read = () => ha('states', server.apps.map((a) => a.entity)).then((r) => r.value && setStates(r.value))
  useEffect(() => { read(); const id = setInterval(read, 2000); return () => clearInterval(id) }, [server])
  return (
    <div className="absolute inset-0 z-20" onClick={close}>
      <div className="absolute inset-y-0 right-0 flex w-[760px] flex-col gap-3 bg-[#050505]/90 p-5 shadow-2xl ring-1 ring-white/10 animate-[slidein_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">{server.name}</span>
          <button onClick={close} className="ml-auto rounded-full p-1 text-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2">
          {server.apps.map((a) => {
            const s = states[a.entity], on = s?.state === 'on'
            return (
              <div key={a.entity} className="flex items-center gap-2 rounded-2xl px-3 py-2"
                style={on ? { background: 'color-mix(in srgb, #E8650A calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #E8650A' } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}>
                <span className={`min-w-0 flex-1 truncate text-sm font-bold ${on ? 'text-white' : 'text-[#9e9e9e]'}`}>{a.name}</span>
                <Switch on={on} disabled={!s || s.state === 'unavailable'}
                  onClick={() => ha('call', 'switch', 'toggle', { entity_id: a.entity }).then((r) => { if (r.error) flash(r.error); read() })} />
              </div>
            )
          })}
        </div>
        <div className="min-h-0 flex-1"><Screens only={server.screens} /></div>
      </div>
    </div>
  )
}

// the side bar shared by the info panels (Seguridad, Listas, Notificaciones)
function SideBar({ title, count, close, children, wide }) {
  return (
    <div className="absolute inset-0 z-20" onClick={close}>
      <div className={`absolute inset-y-0 right-0 flex ${wide ? 'w-[560px]' : 'w-[440px]'} flex-col gap-3 bg-[#050505]/90 p-5 shadow-2xl ring-1 ring-white/10 animate-[slidein_.18s_ease-out]`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">{title}</span>{count != null && <span className="text-sm text-muted">{count}</span>}
          <button onClick={close} className="ml-auto rounded-full p-1 text-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  )
}
const lit = (on) => (on ? { background: 'color-mix(in srgb, #E8650A calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #E8650A' } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' })
const Head = ({ children }) => <div className="mt-1 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{children}</div>

// Seguridad: the alarm and the cameras, live
function SecurityPanel({ server, close }) {
  const [states, setStates] = useState({})
  const [imgs, setImgs] = useState({})
  useEffect(() => {
    const read = () => {
      ha('states', [server.alarm]).then((r) => r.value && setStates(r.value))
      server.cameras.forEach((c) => ha('camera', c.entity).then((r) => r.value && setImgs((m) => ({ ...m, [c.entity]: r.value }))))
    }
    read(); const id = setInterval(read, 3000); return () => clearInterval(id)
  }, [server])
  const a = states[server.alarm]
  return (
    <SideBar title={server.name} close={close} wide>
      <div className="flex shrink-0 items-center gap-3 rounded-2xl px-3 py-3" style={{ background: 'color-mix(in srgb, #f44336 calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #f44336' }}>
        <svg viewBox="0 0 24 24" width="22" height="22"><path d={server.icon} fill="currentColor" /></svg>
        <span className="flex-1 text-sm font-bold">{a?.name ?? t('Alarm')}</span><span className="text-sm" style={{ color: '#f44336' }}>{a ? t(a.state) : '…'}</span>
      </div>
      <Head>{t('Cameras')}</Head>
      <div className="grid shrink-0 grid-cols-2 gap-2">{server.cameras.map((c) => (
        <div key={c.entity} className="relative aspect-video overflow-hidden rounded-2xl bg-black ring-1 ring-white/10">
          {imgs[c.entity] ? <img src={imgs[c.entity]} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">{t('No picture')}</div>}
          <span className="absolute bottom-1.5 left-1.5 rounded-lg bg-[#050505]/70 px-2 py-0.5 text-xs font-semibold">{c.name}</span>
        </div>
      ))}</div>
    </SideBar>
  )
}

// Listas: each to-do list with its pending items; tick one to complete it
function ListsPanel({ server, close, flash }) {
  const [items, setItems] = useState({})
  const read = () => server.lists.forEach((l) => ha('todoItems', l.entity).then((r) => r.value && setItems((m) => ({ ...m, [l.entity]: r.value }))))
  useEffect(() => { read() }, [server])
  const done = (l, it) => ha('todoDone', l.entity, it.uid).then((r) => { if (r.error) flash(r.error); read() })
  return (
    <SideBar title={server.name} close={close}>
      {server.lists.map((l) => (
        <div key={l.entity} className="flex shrink-0 flex-col gap-1.5">
          <Head>{l.name} · {items[l.entity]?.length ?? '…'}</Head>
          {items[l.entity]?.length === 0 && <span className="text-sm text-muted">{t('Nothing pending.')}</span>}
          {items[l.entity]?.slice(0, l.max ?? 50).map((it) => (
            <div key={it.uid} className="flex items-center gap-3 rounded-2xl px-3 py-2" style={lit(true)}>
              <button title={t('Done')} onClick={() => done(l, it)} className="h-5 w-5 shrink-0 rounded-md ring-2 ring-accent hover:bg-accent" />
              <span className="min-w-0 flex-1 truncate text-sm">{it.summary}</span>
            </div>
          ))}
        </div>
      ))}
    </SideBar>
  )
}

// Notificaciones: HA's own (dismiss) and the house's notification list, newest first (✓ marks one read)
function NotificationsPanel({ server, close, flash }) {
  const [ha_, setHa] = useState([])
  const [items, setItems] = useState(null)
  const read = () => {
    ha('notifications').then((r) => r.value && setHa(r.value))
    ha('todoItems', server.list).then((r) => r.value && setItems([...r.value].reverse().slice(0, 80)))
  }
  useEffect(() => { read() }, [server])
  return (
    <SideBar title={server.name} count={items?.length} close={close}>
      {ha_.map((n) => (
        <div key={n.notification_id} className="flex shrink-0 items-start gap-3 rounded-2xl px-3 py-2" style={lit(true)}>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{n.title || 'Home Assistant'}</span><span className="block text-xs text-muted">{n.message}</span></span>
          <button title={t('Dismiss')} onClick={() => ha('dismiss', n.notification_id).then(read)} className="rounded-full p-1 text-muted hover:text-white"><X size={14} /></button>
        </div>
      ))}
      {!items && <span className="text-sm text-muted">…</span>}
      {items?.map((it) => (
        <div key={it.uid} className="flex shrink-0 items-start gap-3 rounded-2xl px-3 py-2" style={lit(false)}>
          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{it.summary}</span>
            {it.description && <span className="line-clamp-2 block text-xs text-muted">{it.description.replace(/\*\*/g, '').replace(/\(id: [^)]*\)/, '').trim()}</span>}</span>
          <button title={t('Mark as read')} onClick={() => ha('todoDone', server.list, it.uid).then((r) => { if (r.error) flash(r.error); read() })}
            className="rounded-full p-1 text-muted hover:text-accent"><Check size={14} /></button>
        </div>
      ))}
    </SideBar>
  )
}

// a folder of the notes vault (an entry with "kind": "notes"): its tree, folders fold open, a note opens in Obsidian
function NotesPanel({ server, close }) {
  const [tree, setTree] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState({})
  useEffect(() => { window.art?.overlay.notesTree(server.folder).then((r) => (r.error ? setError(r.error) : setTree(r.value))) }, [server])
  const count = (n) => n.reduce((a, x) => a + (x.children ? count(x.children) : 1), 0)
  const rows = (nodes, depth) => nodes.flatMap((n) => [
    <button key={n.path} onClick={() => (n.children ? setOpen((o) => ({ ...o, [n.path]: !o[n.path] })) : window.art?.overlay.openNote(n.path))}
      className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm hover:bg-white/5" style={{ paddingLeft: 8 + depth * 16 }}>
      {n.children ? <ChevronRight size={14} className={`shrink-0 text-accent transition-transform ${open[n.path] ? 'rotate-90' : ''}`} /> : <span className="w-3.5 shrink-0" />}
      <span className={`min-w-0 flex-1 truncate ${n.children ? 'font-bold' : 'text-[#c9cbd3]'}`}>{n.name}</span>
      {n.children && <span className="text-xs text-muted">{count(n.children)}</span>}
    </button>,
    ...(n.children && open[n.path] ? rows(n.children, depth + 1) : []),
  ])
  return (
    <SideBar title={server.name} count={tree ? count(tree) : null} close={close}>
      {error && <p className="text-sm text-muted">{error}</p>}
      {!tree && !error && <p className="text-sm text-muted">…</p>}
      {tree && rows(tree, 0)}
    </SideBar>
  )
}

// a server: its apps (containers) as a list sliding in from the right; tap one to start or stop it (HA's own
// confirmation text first, a second tap does it). Apps come from the dashboard import: { entity, svg (its icon), confirm }
function ServerPanel({ server, close, flash }) {
  const [states, setStates] = useState({})
  const [armed, setArmed] = useState(null)
  useEffect(() => {
    const read = () => ha('states', server.apps.map((a) => a.entity)).then((r) => r.value && setStates(r.value))
    read(); const id = setInterval(read, 2000); return () => clearInterval(id)
  }, [server])
  const tap = (a) => {
    if (server.readonly) return a.url && window.art?.overlay.openUrl(a.url)
    if (a.confirm && armed !== a.entity) { setArmed(a.entity); setTimeout(() => setArmed((x) => (x === a.entity ? null : x)), 5000); return }
    setArmed(null)
    ha('call', 'switch', 'toggle', { entity_id: a.entity }).then((r) => r.error && flash(r.error))
  }
  const running = server.apps.filter((a) => states[a.entity]?.state === 'on').length
  return (
    <div className="absolute inset-0 z-20" onClick={close}>
      <div className="absolute inset-y-0 right-0 flex w-[400px] flex-col gap-3 bg-[#050505]/90 p-5 shadow-2xl ring-1 ring-white/10 animate-[slidein_.18s_ease-out]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="text-xl font-semibold">{server.name}</span>
          <span className="text-sm text-muted">{running}/{server.apps.length} {t(server.readonly ? 'online' : 'running')}</span>
          <button onClick={close} className="ml-auto rounded-full p-1 text-muted hover:text-white"><X size={18} /></button>
        </div>
        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
          {server.apps.map((a) => {
            const s = states[a.entity], on = s?.state === 'on'
            return (
              <button key={a.entity} onClick={() => tap(a)} style={on ? { background: 'color-mix(in srgb, #E8650A calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #E8650A' } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}
                className={`flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:brightness-110 ${armed === a.entity ? 'outline outline-2 outline-accent' : ''}`}>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: on ? '#E8650A55' : 'rgba(255,255,255,.08)', color: on ? '#fff' : '#8a8a8e' }}>
                  {a.svg ? <svg viewBox="0 0 256 256" width="20" height="20" fill="currentColor" stroke="currentColor" dangerouslySetInnerHTML={{ __html: a.svg }} />
                    : a.icon ? <svg viewBox="0 0 24 24" width="20" height="20"><path d={a.icon} fill="currentColor" /></svg> : <CircleDot size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-bold ${on ? 'text-white' : 'text-[#9e9e9e]'}`}>{armed === a.entity ? a.confirm : a.name ?? (s?.name ?? a.entity).replace(/ Contenedor$/i, '')}</span>
                  <span className="block text-xs" style={{ color: on ? '#E8650A' : '#8a8a8e' }}>{!s ? '…' : s.state === 'unavailable' ? t('Unavailable') : t(server.readonly ? (on ? 'Online' : 'Offline') : on ? 'Running' : 'Stopped')}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// a server's tile, under the dashboard's tiles: name and how many of its apps are running
function ServerTile({ server, open }) {
  const [n, setN] = useState(null)
  const [info, setInfo] = useState(null) // the info kinds' one-line summary
  useEffect(() => {
    if (server.kind === 'notes') {
      window.art?.overlay.notesTree(server.folder).then((r) => {
        const count = (n) => n.reduce((a, x) => a + (x.children ? count(x.children) : 1), 0)
        if (r.value) setInfo({ text: `${count(r.value)} ${t('notes')}`, on: true })
      })
      return
    }
    if (server.kind) {
      const ids = server.kind === 'security' ? [server.alarm] : server.kind === 'lists' ? server.lists.map((l) => l.entity) : [server.list]
      const read = () => ha('states', ids).then((r) => {
        if (!r.value) return
        const v = Object.values(r.value)
        setInfo(server.kind === 'security' ? { text: t(v[0]?.state ?? '—'), on: true }
          : (() => { const c = v.reduce((a, s) => a + (Number(s.state) || 0), 0); return { text: `${c} ${t(server.kind === 'lists' ? 'pending' : 'unread')}`, on: c > 0 } })())
      })
      read(); const id = setInterval(read, 10000); return () => clearInterval(id)
    }
    const read = () => ha('states', server.apps.map((a) => a.entity)).then((r) => r.value && setN(Object.values(r.value).filter((s) => s.state === 'on').length))
    read(); const id = setInterval(read, 5000); return () => clearInterval(id)
  }, [server])
  const lit = info ? info.on : n > 0
  return (
    <button onClick={open} style={lit ? { background: 'color-mix(in srgb, #E8650A calc(20% * var(--glass, 1)), transparent)', boxShadow: 'inset 0 0 0 2px #E8650A' } : { background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,.10)' }}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left shadow-xl transition hover:brightness-110" >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: lit ? '#E8650A55' : 'rgba(255,255,255,.08)', color: lit ? '#fff' : '#8a8a8e' }}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d={server.icon} fill="currentColor" /></svg></span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold ${lit ? 'text-white' : 'text-[#9e9e9e]'}`}>{server.name}</span>
        <span className="block text-xs" style={{ color: lit ? '#E8650A' : '#8a8a8e' }}>{info ? info.text : n == null ? '…' : `${n}/${server.apps.length} ${t(server.screens ? 'on' : server.readonly ? 'online' : 'running')}`}</span>
      </span>
      <ChevronRight size={16} className="text-muted" />
    </button>
  )
}

// the dashboard overlay: a see-through layer over the whole screen; click the background or press Esc to close
export default function Overlay() {
  useLang()
  const [tiles, setTiles] = useState(null)
  const [states, setStates] = useState({})
  const [statesLoaded, setStatesLoaded] = useState(false)
  const [edit, setEdit] = useState(false)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState(null) // the tile being edited
  const [servers, setServers] = useState([])
  const [pinned, setPinned] = useState(false)
  // everything fits on one screen: the cells shrink while the layout runs off the bottom, and grow back (up to
  // CELL) when a whole row of room opens up
  const [cell, setCell] = useState(CELL)
  const body = useRef()
  useLayoutEffect(() => {
    const b = body.current?.getBoundingClientRect().bottom
    if (!b) return
    if (b > innerHeight - 24 && cell > 64) setCell((c) => c - 6)
    else if (b < innerHeight - 24 - (cell + GAP) && cell < CELL) setCell((c) => Math.min(CELL, c + 6))
  })
  const [locked, setLocked] = useState(false)
  const [server, setServer] = useState(null) // the server whose apps are showing
  const [projectsOpen, setProjectsOpen] = useState(false)
  const [glass, setGlass] = useState(Number(load('overlayGlass', 3))) // opacity, 3-100 %: the dim layer and the tiles' backgrounds
  const [through, setThrough] = useState(false) // click-through: clicks reach the windows behind; only its own button stays clickable
  const throughBtn = useRef()
  // at the glass end the tiles themselves almost vanish; the slider and the header stay
  const fade = 0.1 + 0.9 * ((glass - 3) / 97)
  // a control: a small tile like the rest (orange outline while on), fading with them
  const ctl = `flex h-9 min-w-9 items-center justify-center rounded-xl px-2 transition hover:brightness-125 ${through ? '' : 'flex-1'}`
  const ctlStyle = (on) => ({ opacity: fade, color: on ? '#E8650A' : '#d8d8d8', background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))',
    boxShadow: on ? 'inset 0 0 0 2px #E8650A' : 'inset 0 0 0 1.5px rgba(255,255,255,.10)' })
  const [msg, setMsg] = useState('')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 4000) }
  useEffect(() => { window.art?.overlay.tiles().then((d) => { setTiles(d.tiles ?? []); setServers(d.servers ?? []); setPinned(!!d.pinned); setLocked(!!d.locked); setThrough(!!d.through); window.art?.overlay.through(!!d.through) }) }, [])
  // the main process keeps the click-through button clickable: it needs that button's place on screen
  useEffect(() => { const b = throughBtn.current?.getBoundingClientRect(); if (b) window.art?.overlay.throughSpot({ x: Math.round(screenX + b.left), y: Math.round(screenY + b.top), width: Math.round(b.width), height: Math.round(b.height) }) })
  useEffect(() => {
    if (!tiles?.length) return
    const read = () => ha('states', tiles.map((x) => x.entity).filter(Boolean)).then((r) => { if (r.value) { setStates(r.value); setStatesLoaded(true) } })
    read(); const id = setInterval(read, 2000); return () => clearInterval(id)
  }, [tiles])
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') picking ? setPicking(false) : editing ? setEditing(null) : server ? setServer(null) : projectsOpen ? setProjectsOpen(false) : close() }
    addEventListener('keydown', key); return () => removeEventListener('keydown', key)
  }, [picking, editing, server, pinned, projectsOpen])
  const change = (list, more = {}) => { setTiles(list); window.art?.overlay.save({ tiles: list, servers, pinned, locked, through, ...more }) }
  const close = () => { if (!pinned) window.art?.overlay.toggle() } // a pinned dashboard only closes from its own × button
  if (!tiles) return null
  return (
    <div className="fixed inset-0 select-none text-white" style={{ background: `rgba(5,5,5,${glass * 0.006})`, '--glass': glass / 100, textShadow: '0 1px 3px rgba(0,0,0,.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !edit) close() }}>
      <div className="mx-auto flex h-full w-fit flex-col gap-5 px-10 py-8" onClick={(e) => { if (e.target === e.currentTarget && !edit) close() }}>
        {!tiles.length && !edit && <p className="text-muted">{t('No tiles yet: press Edit, then + to add your lights, switches and scenes.')}</p>}
        {/* the tile grid (square cells; big tiles span several and the rest fill the gaps; drag any tile to move it),
            with the servers in a column beside it */}
        <div ref={body} className="flex items-stretch justify-center gap-5">
        <div className="flex flex-col gap-3">
        {/* no title; this row only holds the flash message, level with the controls in the side column */}
        <div className="flex h-9 items-center gap-3">
          <span className="text-sm text-accent">{msg}</span>
        </div>
        <Sortable name="overlay" locked={locked} className="grid content-start transition-opacity" style={{ opacity: fade, gridTemplateColumns: `repeat(${COLS}, ${cell}px)`, gridAutoRows: `${cell}px`, gridAutoFlow: 'dense', gap: GAP }}>
          {tiles.map((x) => x.calendar ? <CalendarTile key={x.id} span={[x.w ?? 4, x.h ?? 2]} edit={edit} open={() => setEditing(x)} remove={() => change(tiles.filter((y) => y !== x))} />
            : <Tile key={x.id ?? x.entity} span={[x.w ?? 1, x.h ?? 1]} tile={x} s={states[x.entity]} loaded={statesLoaded} edit={edit} flash={flash} cell={cell}
            open={() => setEditing(x)} remove={() => change(tiles.filter((y) => y !== x))} projects={() => setProjectsOpen(true)}
            resize={(w, h, keep) => { const list = tiles.map((y) => (y === x ? { ...y, w, h } : y)); keep ? change(list) : setTiles(list) }} />)}
          {edit && <button key="+" onClick={() => setPicking(true)} title={t('Add a tile')}
            className="flex h-full w-full items-center justify-center rounded-3xl border-2 border-dashed border-accent/60 text-accent hover:bg-accent/10"><Plus size={36} /></button>}
        </Sortable>
        </div>
        {/* the servers, one under the other; a tap slides its apps in from the right */}
        {/* drag to reorder them too (locked with the rest) */}
        <div className="flex w-[250px] shrink-0 flex-col gap-2">
          {/* the controls: an invisible tile on top of the first side tile, outside the grid's margins */}
          {/* right-aligned: the click-through button keeps its corner whether or not the others show */}
          <div className="flex h-9 items-center justify-end gap-2">
            {!through && <>
              <button title={t(pinned ? 'Unpin (closes when you click outside)' : 'Pin (stays open behind your windows)')}
                onClick={() => { const p = !pinned; setPinned(p); window.art?.overlay.pin(p) }} className={ctl} style={ctlStyle(pinned)}>{pinned ? <Pin size={16} /> : <PinOff size={16} />}</button>
              <button title={t(locked ? 'Unlock editing' : 'Lock editing')} onClick={() => { const l = !locked; setLocked(l); if (l) setEdit(false); change(tiles, { locked: l }) }}
                className={ctl} style={ctlStyle(locked)}>{locked ? <LockKeyhole size={16} /> : <LockKeyholeOpen size={16} />}</button>
              {!locked && <button onClick={() => setEdit(!edit)} title={t(edit ? 'Done editing' : 'Edit')} className={ctl} style={ctlStyle(edit)}>
                {edit ? <Check size={16} /> : <Pencil size={16} />}</button>}
              <button onClick={() => window.art?.overlay.toggle()} title={t('Close')} className={ctl} style={ctlStyle(false)}><X size={16} /></button>
            </>}
            <button ref={throughBtn} title={t(through ? 'Clickable again' : 'Click-through (clicks reach the windows behind)')}
              onClick={() => { const v = !through; setThrough(v); change(tiles, { through: v }); window.art?.overlay.through(v) }}
              className={ctl} style={{ ...ctlStyle(through), opacity: 1 }}>{through ? <MousePointerBan size={16} /> : <MousePointerClick size={16} />}</button>
          </div>

          {servers.length > 0 && <Sortable name="overlay-servers" locked={locked} className="mt-1 flex flex-col gap-2 transition-opacity" style={{ opacity: fade }}>
            {servers.map((sv) => <ServerTile key={sv.name} server={sv} open={() => setServer(sv)} />)}
          </Sortable>}
          {/* the see-through slider, a tile like the ones above, always at the bottom of this column (the dashboard's
              bottom-right corner) */}
          <div className="mt-auto flex flex-col gap-2 rounded-2xl px-3 py-2.5 shadow-xl transition-opacity"
            style={{ opacity: fade, background: 'rgba(58,58,62,calc(.55 * var(--glass, 1)))', boxShadow: 'inset 0 0 0 2px #E8650A' }}>
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: 'color-mix(in srgb, #E8650A calc(35% * var(--glass, 1) + 20%), transparent)' }}><Droplet size={18} /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{t('Glass')} ↔ {t('Solid')}</span>
                <span className="block text-xs text-accent">{glass}%</span></span>
            </div>
            <input type="range" min="3" max="100" value={glass} className="w-full accent-[#E8650A]" onChange={(e) => { setGlass(Number(e.target.value)); save('overlayGlass', e.target.value) }} />
          </div>
        </div>
        </div>
      </div>
      {projectsOpen && <ProjectsPanel close={() => setProjectsOpen(false)} />}
      {server && (server.kind === 'security' ? <SecurityPanel server={server} close={() => setServer(null)} />
        : server.kind === 'lists' ? <ListsPanel server={server} close={() => setServer(null)} flash={flash} />
        : server.kind === 'notes' ? <NotesPanel server={server} close={() => setServer(null)} />
        : server.kind === 'notifications' ? <NotificationsPanel server={server} close={() => setServer(null)} flash={flash} />
        : server.screens ? <ScreensPanel server={server} close={() => setServer(null)} flash={flash} />
        : <ServerPanel server={server} close={() => setServer(null)} flash={flash} />)}
      {editing && <Editor tile={editing} s={states[editing.entity]} close={() => setEditing(null)}
        done={(n) => { change(tiles.map((y) => (y === editing ? n : y))); setEditing(null) }} />}
      {picking && <Picker have={tiles.map((x) => x.entity)} close={() => setPicking(false)} add={(id) => { change([...tiles, { id, entity: id }]); setPicking(false) }} />}
    </div>
  )
}
