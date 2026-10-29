import { useEffect, useRef, useState } from 'react'
import { Camera, RotateCcw, BatteryMedium, Circle } from 'lucide-react'
import JarvisTalk from './JarvisTalk.jsx'
import Sortable from './Sortable.jsx'
import { house } from './house.js'
import { t as tr, ago } from './i18n.js'

const ha = (op, ...a) => window.art?.ha(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })

// tile tabs come from house.json ("tiles": { <tab id>: { label, talk?, sections: [{ section, cols, tiles }] } }):
// entity tiles (switch / select / sensor / binary_sensor / button) and camera tiles with an optional capture button.
// Icon names in the file map to these icons.
const ICONS = { battery: BatteryMedium, restart: RotateCcw }

const card = 'rounded-2xl bg-card/70 p-3'

function Switch({ on, onClick, disabled }) {
  return (
    <button role="switch" aria-checked={on} onClick={onClick} disabled={disabled}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-[#3a3a3c]'} ${disabled ? 'opacity-40' : ''}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function CameraTile({ t, states, flash }) {
  const [img, setImg] = useState(null)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    let live = true
    const load = () => ha('camera', t.camera).then((r) => live && r.value && setImg(r.value))
    load()
    const id = setInterval(load, 2000)
    return () => { live = false; clearInterval(id) }
  }, [t.camera])
  const cap = states[t.capture]
  return (
    <div className="flex flex-col gap-2">
      <div className="aspect-video overflow-hidden rounded-2xl bg-black">
        {img ? <img src={img} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">{tr(t.name)}…</div>}
      </div>
      <button className={`${card} flex items-center gap-3 text-left hover:brightness-125 ${armed ? 'ring-1 ring-accent' : ''}`}
        onClick={() => ha('call', 'button', 'press', { entity_id: t.capture }).then((r) => { flash(r.error ? `${tr(t.name)}: ${r.error}` : `${tr('Capture of')} ${tr(t.name)}`); setArmed(true); setTimeout(() => setArmed(false), 800) })}>
        <Camera size={18} className="text-accent" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{tr('Capture')} {tr(t.name)}</div>
          <div className="text-xs text-muted">{cap ? ago(cap.state) : '—'}</div>
        </div>
      </button>
    </div>
  )
}

function EntityTile({ t, s, flash, refresh }) {
  const [confirming, setConfirming] = useState(false)
  const domain = t.entity.split('.')[0]
  const missing = !s || s.state === 'unavailable'
  const call = (service, data) => ha('call', domain, service, { entity_id: t.entity, ...data })
    .then((r) => { if (r.error) flash(`${tr(t.name)}: ${r.error}`); refresh() })
  const Icon = ICONS[t.icon] ?? (t.entity?.startsWith('button.') ? RotateCcw : null)
  // numbers: at most one decimal, no trailing .0
  const value = missing ? '' : isNaN(Number(s.state)) || s.state === '' ? s.state : String(Math.round(Number(s.state) * 10) / 10)
  let right = null, sub = missing ? tr('Unavailable') : value + (s.unit ? ` ${s.unit}` : '')
  if (domain === 'switch' || domain === 'light') { right = <Switch on={s?.state === 'on'} disabled={missing} onClick={() => call('toggle')} />; sub = missing ? sub : tr(s.state === 'on' ? 'On' : 'Off') }
  if (domain === 'binary_sensor') { right = <Circle size={12} className={s?.state === 'on' ? 'fill-accent text-accent' : 'text-muted'} />; sub = tr(s?.state === 'on' ? 'Connected' : 'Disconnected') }
  if (domain === 'sensor' && s?.last_answer_by) sub = `${s.state} · ${s.last_answer_by}`
  if (domain === 'button') {
    sub = confirming ? tr('Press again to confirm') : `${tr('Last')}: ${ago(s?.state)}`
    right = <button className={`rounded-full px-3 py-1 text-xs font-semibold ${confirming ? 'bg-accent text-ink' : 'bg-[#3a3a3c]'}`}
      onClick={() => { if (t.confirm && !confirming) { setConfirming(true); setTimeout(() => setConfirming(false), 4000); return } setConfirming(false); call('press') }}>
      {confirming ? tr('Confirm') : <Icon size={14} />}</button>
  }
  return (
    <div className={`${card} flex flex-col gap-2`}>
      <div className="flex items-center gap-3">
        {Icon && domain !== 'button' && <Icon size={18} className="text-accent" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{tr(t.name)}</div>
          <div className="truncate text-xs text-muted">{sub}</div>
        </div>
        {right}
      </div>
      {domain === 'select' && s?.options && (
        <div className="flex flex-wrap gap-1">
          {s.options.map((o) => (
            <button key={o} onClick={() => call('select_option', { option: o })}
              className={`rounded-full px-2.5 py-0.5 text-xs ${o === s.state ? 'bg-accent font-semibold text-ink' : 'bg-[#3a3a3c] text-[#c9cbd3]'}`}>{o}</button>
          ))}
        </div>
      )}
    </div>
  )
}

export { Switch }

export default function HaTiles({ tab }) {
  const sections = house.tiles?.[tab]?.sections ?? []
  const [states, setStates] = useState({})
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const timer = useRef()
  const ids = sections.flatMap((s) => s.tiles.flatMap((t) => [t.entity, t.capture].filter(Boolean)))
  const refresh = () => ha('states', ids).then((r) => { if (r.error) setError(r.error); else { setStates(r.value); setError('') } })
  useEffect(() => { refresh(); const id = setInterval(refresh, 3000); return () => clearInterval(id) }, [tab])
  const flash = (m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 4000) }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {house.tiles?.[tab]?.talk && <JarvisTalk />}
      {error && <p className="text-sm text-muted">Home Assistant: {error}</p>}
      {sections.map((sec) => (
        <div key={sec.section} className="flex shrink-0 flex-col gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">{tr(sec.section)}</div>
          <Sortable name={`${tab}:${sec.section}`} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${sec.cols}, minmax(0, 1fr))` }}>
            {sec.tiles.map((t) => t.camera
              ? <CameraTile key={t.camera} t={t} states={states} flash={flash} />
              : <EntityTile key={t.entity} t={t} s={states[t.entity]} flash={flash} refresh={refresh} />)}
          </Sortable>
        </div>
      ))}
      <div className="h-4 shrink-0 text-center text-xs text-muted">{msg}</div>
    </div>
  )
}
