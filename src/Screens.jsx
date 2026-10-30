import { useEffect, useState } from 'react'
import { t } from './i18n.js'
import { house } from './house.js'
import { ExternalLink, RefreshCw, MoonStar, Plus } from 'lucide-react'

// Live device screens from HA's ADB Control (ha-adb-control on .20): its /viewdata lists the devices it is connected to,
// ws-scrcpy (:8001) draws each screen, Stream Control's players come with ?mode=stream. The PC opens no ADB connection.
// ADB Control's API and ws-scrcpy (house.json "adbControl"); VNC from house.json "vnc"
const API = () => house.adbControl?.api
const SCRCPY = () => house.adbControl?.scrcpy

// same URL ha-adb-control's /view builds for each screen
function scrcpyLink(ip) {
  const udid = `${ip}:5555`
  const ws = SCRCPY().replace(/^http/, 'ws') + `?action=proxy-adb&remote=tcp%3A8886&udid=${encodeURIComponent(udid)}`
  return SCRCPY() + '#!' + new URLSearchParams({ action: 'stream', udid, player: 'mse', ws, fitToScreen: 'true' })
}

// HA's VNC connector: name, address, port, optional password and screen resolution; add/update or remove by name
function VncForm({ done }) {
  const [busy, setBusy] = useState(false)
  const field = 'rounded-lg bg-ink/80 px-3 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent'
  const run = async (e, op) => {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target.form ?? e.target))
    if (!f.name || (op === 'add' && !f.ip)) return done(t('Enter at least the name') + (op === 'add' ? ' ' + t('and the IP') : ''))
    setBusy(true)
    const r = await (op === 'add' ? window.art.ha('vncAdd', f) : window.art.ha('vncRemove', f.name))
    setBusy(false)
    done(r.error ? `VNC: ${r.error}` : '')
  }
  return (
    <form onSubmit={(e) => run(e, 'add')} className="grid shrink-0 grid-cols-2 gap-2 rounded-2xl bg-card/80 p-3">
      <input name="name" placeholder={t('Name (same name = update)')} className={`${field} col-span-2`} />
      <input name="ip" placeholder={t('IP or computer name')} className={field} />
      <input name="port" placeholder={t('Port (5900)')} inputMode="numeric" className={field} />
      <input name="password" type="password" placeholder={t('VNC password (optional)')} className={field} />
      <input name="resolution" placeholder={t('Resolution (e.g. 1920x1080)')} className={field} />
      <button disabled={busy} className="rounded-full bg-accent py-1.5 text-sm font-semibold text-ink disabled:opacity-50">{t('Add / update')}</button>
      <button type="button" disabled={busy} onClick={(e) => run(e, 'remove')} className="rounded-full bg-[#3a3a3c] py-1.5 text-sm disabled:opacity-50">{t('Remove (by name)')}</button>
    </form>
  )
}

// only = one mode, without the mode chips (the dashboard's ADB / Stream panels)
export default function Screens({ only }) {
  // the modes this house has: ADB Control / Stream Control need adbControl, VNC needs vnc
  const modes = only ? [only] : [...(house.adbControl ? ['ADB', 'Stream'] : []), ...(house.vnc ? ['VNC'] : [])]
  const [mode, setMode] = useState(modes[0])
  const [devs, setDevs] = useState(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState(null)
  const [vnc, setVnc] = useState(null) // VNC Control: { url, up } from HA
  const [adding, setAdding] = useState(false) // the + form (HA's "Conectar otro VNC")
  const load = () => mode === 'VNC'
    ? window.art?.ha('vnc').then((r) => { if (r.error) setError(`VNC Control: ${r.error}`); else { setVnc(r.value); setError('') } })
    : fetch(`${API()}/viewdata${mode === 'Stream' ? '?mode=stream' : ''}`, { signal: AbortSignal.timeout(8000) })
    .then((r) => r.json()).then((j) => { setDevs(j.devices.filter((d) => d.shown !== false)); setError('') })
    .catch((e) => setError(`${t('ADB Control not reachable')} (${e.message})`))
  useEffect(() => { setDevs(null); setVnc(null); load() }, [mode])

  const d = devs?.find((x) => x.ip === pick) ?? devs?.[0]
  const src = mode === 'VNC' ? (vnc?.up && vnc.url) : d && (mode === 'Stream' ? d.player : scrcpyLink(d.ip))
  const chip = (on) => `whitespace-nowrap rounded-full px-3 py-1 text-sm ${on ? 'bg-accent font-semibold text-ink' : 'bg-card text-[#c9cbd3]'}`
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        {modes.map((m) => <button key={m} className={chip(mode === m)} onClick={() => setMode(m)}>{m} Control</button>)}
        {mode === 'VNC' && <button title={t('Connect another VNC')} onClick={() => setAdding(!adding)}
          className={`ml-1 flex h-7 w-7 items-center justify-center rounded-full ${adding ? 'bg-accent text-ink' : 'bg-card text-accent hover:brightness-125'}`}><Plus size={16} /></button>}
        <button title={t('Reload devices')} className="ml-auto rounded-full p-1 text-muted hover:text-white" onClick={load}><RefreshCw size={15} /></button>
        {src && <a href={src} target="_blank" title={t('Open bigger in its own window')} className="rounded-full p-1 text-muted hover:text-white"><ExternalLink size={15} /></a>}
      </div>
      {error && <p className="text-sm text-muted">{error}</p>}
      {mode === 'VNC' && adding && <VncForm done={(msg) => { setError(msg || ''); if (!msg) { setAdding(false); load() } }} />}
      {mode === 'VNC' && vnc && (vnc.up && vnc.url
        ? <iframe key={vnc.url} src={vnc.url} className="min-h-0 flex-1 rounded-xl bg-black" allow="autoplay; clipboard-read; clipboard-write" />
        : <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted">
            <MoonStar size={28} /><span className="font-semibold">{vnc.host} {t('is off')}</span>
            <span className="text-xs">{t('The screen will come back here as soon as it is on.')}</span>
          </div>)}
      {mode !== 'VNC' && devs && !devs.length && <p className="text-sm text-muted">
        {t(mode === 'Stream' ? "Nothing is streaming. Turn a device's Video on in HA's Stream Control." : 'No device is connected to ADB Control.')}</p>}
      {mode !== 'VNC' && devs?.length > 0 && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {devs.map((x) => (
              <button key={x.ip} className={chip(x.ip === d.ip)} onClick={() => setPick(x.ip)}>
                {x.name || x.model}{x.battery != null && <span className="ml-1 opacity-70">{x.battery}%</span>}
              </button>
            ))}
          </div>
          <iframe key={src} src={src} className="min-h-0 flex-1 rounded-xl bg-black" allow="autoplay" />
        </>
      )}
    </div>
  )
}
