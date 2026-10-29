import { useEffect, useRef, useState } from 'react'
import { t } from './i18n.js'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Play, Volume2, Volume1, VolumeX, SkipForward, SkipBack,
  Undo2, Home, Keyboard, Link, ExternalLink } from 'lucide-react'

const call = (op, ...a) => window.art?.remote(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })

// Joint Remote's remote: round D-pad with OK, a ring of eight buttons, links underneath (as on the Linux desktop)
function Face({ d, flash }) {
  const [typing, setTyping] = useState(false)
  const held = useRef()
  const talk = !!d.host // Joint Remote reachable: typing and links (an Android TV can have both)
  const run = (p, okMsg) => p.then((r) => flash(r.error ? `${d.name}: ${r.error}` : okMsg))
  const press = (k) => run(call('press', d.name, k), '')
  const needsPair = (fn) => () => (d.type === 'jr' || d.paired || !talk ? fn() : flash(`${t('Pair')} ${d.name} ${t('first (Joint Remote)')}`))

  const FACE = 300, RING = 52, r = FACE / 2 - RING / 2 - 4
  const ring = [
    [Play, t('Play or pause'), () => press('play')],
    [Volume2, t('Volume up'), () => press('vol_up')],
    [SkipForward, t('Next'), () => press('next')],
    [Volume1, t('Volume down, hold to mute'), null],
    talk ? [Keyboard, t('Type'), needsPair(() => setTyping(true))] : [VolumeX, t('Mute'), () => press('mute')],
    [Undo2, t('Back'), () => press('back')],
    [SkipBack, t('Previous'), () => press('previous')],
    [Home, t('Home'), () => press('home')],
  ]
  const btn = 'flex items-center justify-center rounded-full bg-card hover:brightness-125 active:bg-accent active:text-ink'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: FACE, height: FACE }}>
        {ring.map(([Icon, tip, cb], i) => {
          const a = (i * 45 * Math.PI) / 180
          const style = { width: RING, height: RING, left: FACE / 2 + r * Math.sin(a) - RING / 2, top: FACE / 2 - r * Math.cos(a) - RING / 2 }
          // volume down: click = down, hold = mute
          const hold = cb ? { onClick: cb } : {
            onPointerDown: () => { held.current = setTimeout(() => { held.current = null; press('mute') }, 500) },
            onPointerUp: () => { if (held.current) { clearTimeout(held.current); press('vol_down') } },
          }
          return <button key={tip} title={tip} className={`absolute ${btn}`} style={style} {...hold}><Icon size={20} /></button>
        })}
        <div className="absolute rounded-full bg-card" style={{ width: 168, height: 168, left: 66, top: 66 }}>
          {[[ChevronUp, 'up', 59, 4], [ChevronDown, 'down', 59, 114], [ChevronLeft, 'left', 4, 59], [ChevronRight, 'right', 114, 59]].map(([Icon, k, x, y]) => (
            <button key={k} onClick={() => press(k)} className="absolute flex h-[50px] w-[50px] items-center justify-center rounded-full active:bg-accent/35"
              style={{ left: x, top: y }}><Icon size={26} /></button>
          ))}
          <button onClick={() => press('ok')} className="absolute left-[52px] top-[52px] h-16 w-16 rounded-full border-2 border-accent bg-[#2c2c2e] text-lg active:bg-accent">OK</button>
        </div>
      </div>
      <div className="flex gap-3">
        {talk && <button title={t('Paste & send link')} className={`${btn} h-[52px] w-[52px]`}
          onClick={needsPair(() => run(call('link', d.name, 'jr'), `${t('Link copied on')} ${d.name}`))}><Link size={20} /></button>}
        {d.type === 'atv' && <button title={t('Paste & open on the TV')} className={`${btn} h-[52px] w-[52px]`}
          onClick={() => run(call('link', d.name, 'tv'), `${t('Opening on')} ${d.name}`)}><ExternalLink size={20} /></button>}
      </div>
      {typing && (
        <input autoFocus placeholder={`${t('Type for')} ${d.name}, ${t('Enter sends')}`} className="w-72 rounded-lg bg-ink px-3 py-2 outline-none ring-1 ring-accent"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.value) { run(call('text', d.name, e.target.value), `${t('Typed on')} ${d.name}`); setTyping(false) }
            if (e.key === 'Escape') setTyping(false)
          }} onBlur={() => setTyping(false)} />
      )}
    </div>
  )
}

function IrPage({ d, flash }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {d.commands.map(([label, cmd]) => (
        <button key={label} className="min-h-[52px] rounded-xl bg-card px-2 hover:brightness-125 active:bg-accent active:text-ink"
          onClick={() => call('press', d.name, cmd).then((r) => r.error && flash(`${d.name}: ${r.error}`))}>{label}</button>
      ))}
    </div>
  )
}

function Pair({ d, flash, done }) {
  const [code, setCode] = useState('')
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card/80 p-4">
      <div className="font-semibold">{t('Pair with Joint Remote on')} {d.name}</div>
      <div className="text-sm text-muted">{t('Press Pair: a 6-digit code appears on the device. Type it here.')}</div>
      <button className="rounded-full bg-accent py-2 font-semibold text-ink"
        onClick={() => call('pairStart', d.name).then((r) => flash(r.error ? `${d.name}: ${t('not reachable')}` : `${t('Code shown on')} ${d.name}`))}>{t('Pair')}</button>
      <input value={code} maxLength={6} placeholder={t('6-digit code')} inputMode="numeric"
        className="rounded-lg bg-ink px-3 py-2 outline-none ring-1 ring-card focus:ring-accent"
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && call('pairFinish', d.name, code).then((r) => {
          if (r.error) flash(t('Pairing failed: press Pair for a new code'))
          else { flash(`${t('Paired with')} ${d.name}`); done() }
        })} />
    </div>
  )
}

export default function Remote() {
  const [devs, setDevs] = useState(null)
  const [pick, setPick] = useState(0)
  const [msg, setMsg] = useState('')
  const timer = useRef()
  const load = () => call('devices').then((r) => setDevs(r.value ?? []))
  useEffect(() => { load() }, [])
  const flash = (m) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(''), 4000) }

  if (!devs) return <p className="text-muted">{t('Loading devices…')}</p>
  if (!devs.length) return (
    <p className="text-sm text-muted">{t('No remotes set up yet. They come from')} <code>~/.config/art-desktop/remotes.json</code>;
      {t('the TV and IR remotes also need the Home Assistant token in')} <code>ha.json</code>.</p>
  )
  const d = devs[Math.min(pick, devs.length - 1)]
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {devs.map((x, i) => (
          <button key={x.name} onClick={() => setPick(i)}
            className={`whitespace-nowrap rounded-full px-3 py-1 text-sm ${i === pick ? 'bg-accent font-semibold text-ink' : 'bg-card text-[#c9cbd3]'}`}>{x.name}</button>
        ))}
      </div>
      <div className="flex-1">
        {d.type === 'ir' ? <IrPage d={d} flash={flash} />
          : d.type === 'jr' && !d.paired ? <Pair d={d} flash={flash} done={load} />
          // an Android TV is driven through HA; pairing its Joint Remote adds typing, links and what it's playing
          : <div className="flex flex-col gap-3"><Face d={d} flash={flash} />{d.host && !d.paired && <Pair d={d} flash={flash} done={load} />}</div>}
      </div>
      <div className="h-4 text-center text-xs text-muted">{msg}</div>
    </div>
  )
}
