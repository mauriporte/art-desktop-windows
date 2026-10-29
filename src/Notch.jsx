import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronsUp, Crop, Sparkles, Mic, Pin, PinOff, Settings2, Volume2, VolumeX, Cable, Unplug, MoonStar, Cast, MonitorUp, SlidersHorizontal, Wifi, WifiOff,
  Bluetooth, BluetoothOff, Plane, PanelBottom, PanelBottomClose, Droplets, Wind, Shuffle, Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react'
import { Brain, Bot, Asterisk, ClipboardList, MonitorSmartphone, MonitorPlay, Lightbulb, Download, LayoutGrid, Power as PowerIcon, Smile } from 'lucide-react'
import Remote from './Remote.jsx'
import Screens from './Screens.jsx'
import HaView from './HaView.jsx'
import ClaudeTab from './ClaudeTab.jsx'
import HaTiles from './HaTiles.jsx'
import Sortable from './Sortable.jsx'
import Torrents from './Torrents.jsx'
import Dashboards from './Dashboards.jsx'
import Clipboard from './Clipboard.jsx'
import Power from './Power.jsx'
import Ideas from './Ideas.jsx'
import FlipClock, { useNow } from './FlipClock.jsx'
import { describe, useWeather } from './weather.js'
import { load, save, query, useSlider } from './slider.js'
import { t, useLang, getLang, setLang, locale } from './i18n.js'

import { house } from './house.js'

// tab ids (kept in storage) -> shown label: the built-in tabs, then the house's tile tabs and HA views (house.json:
// a view is drawn by HA itself, e.g. a custom card), then Claude
const TABS = () => ({
  Today: 'Today', Controls: 'Controls', Remote: 'Remote', Screens: 'Screens',
  ...Object.fromEntries(Object.entries(house.tiles ?? {}).map(([id, t]) => [id, t.label ?? id])),
  ...Object.fromEntries(Object.keys(house.views ?? {}).map((id) => [id, id])),
  ...(house.torrents ? { Torrents: 'Torrents' } : {}),
  ...(house.dashboards ? { Dashboards: 'Dashboards' } : {}),
  ...(house.ideas ? { Ideas: 'Ideas' } : {}),
  Clipboard: 'Clipboard', Power: 'Power',
  Claude: 'Claude',
})

// two of HA's own Material Design icons, drawn like the lucide ones
const mdi = (d) => ({ size }) => <svg viewBox="0 0 24 24" width={size} height={size}><path d={d} fill="currentColor" /></svg>
const RemoteTv = mdi('M9,2C7.89,2 7,2.89 7,4V20C7,21.11 7.89,22 9,22H15C16.11,22 17,21.11 17,20V4C17,2.89 16.11,2 15,2H13V4H11V2H9M11,6H13V8H15V10H13V12H11V10H9V8H11V6M9,14H11V16H9V14M13,14H15V16H13V14M9,18H11V20H9V18M13,18H15V20H13V18Z')
const Cctv = mdi('M6.03 12.03L8.03 15.5L5.5 18.68L2 12.62L6.03 12.03M17 18V15.29C17.88 14.9 18.5 14.03 18.5 13C18.5 12.43 18.3 11.9 17.97 11.5L19.94 10.35C20.95 9.76 21.3 8.47 20.71 7.46L19.33 5.06C18.74 4.05 17.45 3.7 16.44 4.28L8.31 9C7.36 9.53 7.03 10.75 7.58 11.71L9.08 14.31C9.63 15.26 10.86 15.59 11.81 15.04L13.69 13.96C13.94 14.55 14.41 15.03 15 15.29V18C15 19.1 15.9 20 17 20H22V18H17Z')

// each tab is an icon; its name shows on hover. The house's own tabs pick one by name in house.json
// ("tabIcons": { <tab id>: "cctv" }); a tab with none gets a grid
const ICONS = { lights: Lightbulb, cctv: Cctv, bot: Bot, smile: Smile, play: MonitorPlay, grid: LayoutGrid, brain: Brain, remote: RemoteTv }
const TAB_ICONS = { Today: CloudSun, Controls: SlidersHorizontal, Remote: RemoteTv, Screens: MonitorSmartphone, Torrents: Download,
  Dashboards: LayoutGrid, Ideas: Brain, Clipboard: ClipboardList, Power: PowerIcon, Claude: Asterisk }
const tabIcon = (id) => TAB_ICONS[id] ?? ICONS[house.tabIcons?.[id]] ?? LayoutGrid

export function useCity() {
  const [city, setCity] = useState(load('city', house.city || 'London'))
  return [city, (c) => { setCity(c); save('city', c) }]
}

const Icons = { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning }

function WeatherIcon({ code, ...p }) {
  const Icon = Icons[describe(code)[1]]
  return <Icon {...p} />
}

function useRadios(open) {
  const [state, setState] = useState(null)
  const refresh = () => window.art?.getRadios().then(setState)
  useEffect(() => {
    refresh()
    // re-read every poll so a USB Wi-Fi adapter shows up as soon as it is plugged in
    const id = setInterval(refresh, open ? 5000 : 30000)
    return () => clearInterval(id)
  }, [open])
  const set = async (kind, on) => setState(await window.art.setRadio(kind, on))
  return { state, set, refresh }
}

// link speed without decimals: "144.4 Mbps" -> "144 Mbps"
const speed = (s) => String(s ?? '').replace(/(\d+)\.\d+/, '$1')

function Tile({ on, icon: Icon, label, sub, sub2, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex items-center gap-2.5 rounded-2xl p-3 text-left transition ${disabled ? 'opacity-40' : 'hover:brightness-125'} ${on ? 'bg-accent text-ink' : 'bg-card/80'}`}
      style={on ? { textShadow: 'none' } : undefined}>
      <Icon size={20} className="shrink-0" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{label}</div>
        <div className={`truncate text-xs ${on ? 'text-ink/70' : 'text-muted'}`}>{sub}</div>
        {sub2 && <div className={`truncate text-xs ${on ? 'text-ink/70' : 'text-muted'}`}>{sub2}</div>}
      </div>
    </button>
  )
}

function Controls({ radios }) {
  const list = radios.state?.radios ?? []
  const wifi = list.find((r) => r.kind === 'WiFi')
  const bt = list.find((r) => r.kind === 'Bluetooth')
  // Windows' own airplane flag, or our toggle's result (Wi-Fi present and every radio off)
  const airplane = radios.state?.airplane || (!!wifi && list.every((r) => !r.on))
  // volume, energy saver, night light (windows.ps1), refreshed while this tab shows
  const [q, setQ] = useState(null)
  const readQ = () => window.art?.quick().then((r) => r && !r.error && setQ(r))
  useEffect(() => { readQ(); const id = setInterval(readQ, 3000); return () => clearInterval(id) }, [])
  const setQuick = (op, v) => window.art?.setQuick(op, v).then(readQ)
  // traffic switch: which adapter carries internet traffic; asks first, then Windows' admin prompt
  const [ask, setAsk] = useState(null) // 'vpn' | 'lan' while the question shows
  const [tmsg, setTmsg] = useState('')
  // the Windows taskbar switch (same as the dock's): on = taskbar hidden for good
  const [taskbarHidden, setTaskbarHidden] = useState(false)
  useEffect(() => { window.art?.getTaskbarHidden().then(setTaskbarHidden); window.art?.onTaskbar(setTaskbarHidden) }, [])
  if (!radios.state) return <p className="text-muted">{t('Reading radios…')}</p>
  if (radios.state.error) return <p className="text-muted">{t('Radios unavailable')}: {radios.state.error}</p>
  const lan = (radios.state.lan ?? []).find((l) => l.up), wa = radios.state.wifi
  const viaVpn = wa && radios.state.route === wa.name
  const switchTraffic = async (via) => {
    setAsk(null); setTmsg(t('Switching…'))
    const r = await window.art.setTraffic(via, wa.name, lan.name)
    setTmsg(r?.error ? (r.error === 'cancelled' ? t('Cancelled') : r.error) : '')
    radios.refresh()
  }
  return (
    <div className="flex flex-col gap-3">
      {q && (
        <div className="flex items-center gap-3 rounded-2xl bg-card/70 px-4 py-3">
          <button title={q.mute ? t('Unmute') : t('Mute')} onClick={() => setQuick('mute', q.mute ? 0 : 1)} className={q.mute ? 'text-accent' : ''}>
            {q.mute ? <VolumeX size={20} /> : <Volume2 size={20} />}</button>
          <input type="range" min="0" max="100" value={Math.round(q.vol * 100)} className="flex-1 accent-[#E8650A]"
            onChange={(e) => { const v = Number(e.target.value) / 100; setQ({ ...q, vol: v }); window.art?.setQuick('vol', v.toFixed(2)) }} />
          <span className="w-9 text-right text-xs text-muted">{Math.round(q.vol * 100)}%</span>
        </div>
      )}
      {ask && (
        <div className="flex items-center gap-3 rounded-2xl bg-card p-3 ring-1 ring-accent">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t(ask === 'vpn' ? 'Are you changing the traffic to the VPN?' : 'Are you switching back to Local IP?')}</div>
            <div className="text-xs text-muted">{t('Windows will ask for permission.')}</div>
          </div>
          <button className="rounded-full bg-accent px-4 py-1 text-sm font-semibold text-ink" onClick={() => switchTraffic(ask)}>{t('Yes')}</button>
          <button className="rounded-full bg-[#3a3a3c] px-4 py-1 text-sm" onClick={() => setAsk(null)}>{t('No')}</button>
        </div>
      )}
      <Sortable name="controls" className="grid grid-cols-3 gap-2">
        {(radios.state.lan ?? []).map((l) => (
          <Tile key={l.name} on={l.up} icon={l.up ? Cable : Unplug} label={l.name === 'Ethernet' ? 'LAN' : l.name}
            sub={l.up ? `${l.ip ?? ''} · ${speed(l.speed)}` : t('Disconnected')} sub2={l.up && l.network} />
        ))}
        <Tile on={wifi?.on} icon={wifi?.on ? Wifi : WifiOff} key="wifi" label="Wi-Fi" disabled={!wifi}
          sub={!wifi ? t('No adapter (USB)') : !wifi.on ? t('Off') : wa ? `${wa.ip ?? ''} · ${speed(wa.speed)}` : t('Not connected')}
          sub2={wifi?.on && radios.state.ssid}
          onClick={() => radios.set('WiFi', !wifi.on)} />
        {/* always shown: on whenever traffic flows; with only one network up it shows that one, and switching needs both */}
        <Tile on={!!lan || !!wa} icon={Shuffle} key="traffic" label={t('Traffic')} disabled={!lan && !wa}
          sub={tmsg || t(!lan && !wa ? 'No network' : (lan && wa ? !viaVpn : !!lan) ? 'Via LAN' : 'Via VPN')}
          sub2={lan && wa ? (viaVpn ? radios.state.ssid : lan.network) : lan ? lan.network : wa ? radios.state.ssid : ''}
          onClick={() => lan && wa && setAsk(viaVpn ? 'lan' : 'vpn')} />
        <Tile on={bt?.on} icon={bt?.on ? Bluetooth : BluetoothOff} key="bt" label="Bluetooth" disabled={!bt}
          sub={!bt ? t('No adapter') : t(bt.on ? 'On' : 'Off')} onClick={() => radios.set('Bluetooth', !bt.on)} />
        <Tile on={airplane} icon={Plane} key="airplane" label={t('Airplane')} sub={t(airplane ? 'All radios off' : 'Off')}
          onClick={() => radios.set('All', airplane)} disabled={!list.length} />
        <Tile on={q?.night} icon={MoonStar} key="night" label={t('Night light')} sub={t(q?.night ? 'On' : 'Off')} disabled={!q || q.night == null}
          onClick={() => setQuick('night', q.night ? 0 : 1)} />
        <Tile icon={Cast} key="cast" label={t('Cast')} sub={t('Wireless display')} onClick={() => setQuick('winkey', 'K')} />
        <Tile icon={MonitorUp} key="project" label={t('Project')} sub={t('Screen mode')} onClick={() => setQuick('winkey', 'P')} />
        <Tile on={taskbarHidden} icon={taskbarHidden ? PanelBottomClose : PanelBottom} key="taskbar" label={t('Taskbar')} sub={t(taskbarHidden ? 'Hidden' : 'Shown')}
          onClick={() => window.art?.setTaskbarHidden(!taskbarHidden).then(setTaskbarHidden)} />
      </Sortable>
    </div>
  )
}

export function Today({ city, setCity }) {
  const now = useNow(60000)
  const { data, error } = useWeather(city)
  const [editing, setEditing] = useState(false)
  const c = data?.current
  return (
    <div className="flex flex-col gap-5">
      {/* flip clock centred, the date centred under it */}
      <div className="flex flex-col items-center gap-2">
        <FlipClock big />
        <div className="text-center">
          <span className="text-lg font-semibold">{now.toLocaleDateString(locale(), { weekday: 'long' })}</span>
          <span className="text-muted"> · {now.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>
      {/* no card behind the weather: it floats like the rest */}
      <div className="px-4">
        <div className="flex items-center justify-between">
          {editing ? (
            <input autoFocus defaultValue={city} className="rounded bg-ink px-2 py-1 outline-none ring-1 ring-accent"
              onKeyDown={(e) => { if (e.key === 'Enter') { setCity(e.target.value.trim() || city); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
              onBlur={() => setEditing(false)} />
          ) : (
            <button className="text-left hover:text-accent" title={t('Change city')} onClick={() => setEditing(true)}>
              <span className="font-semibold">{data?.place ?? city}</span> <span className="text-muted text-xs">{data?.country}</span>
            </button>
          )}
          {c && <div className="flex gap-3 text-xs text-muted">
            <span className="flex items-center gap-1"><Droplets size={12} />{c.relative_humidity_2m}%</span>
            <span className="flex items-center gap-1"><Wind size={12} />{Math.round(c.wind_speed_10m)} km/h</span>
          </div>}
        </div>
        {error && <p className="mt-2 text-sm text-muted">{t(error)}</p>}
        {data && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <WeatherIcon code={c.weather_code} size={40} className="text-accent" />
              <div>
                <div className="text-3xl font-semibold">{Math.round(c.temperature_2m)}°</div>
                <div className="text-xs text-muted">{t(describe(c.weather_code)[0])}</div>
              </div>
            </div>
            <div className="flex gap-4">
              {data.daily.time.slice(1).map((d, i) => (
                <div key={d} className="flex flex-col items-center gap-1 text-xs">
                  <span className="text-muted">{new Date(d).toLocaleDateString(locale(), { weekday: 'short' })}</span>
                  <WeatherIcon code={data.daily.weather_code[i + 1]} size={18} />
                  <span>{Math.round(data.daily.temperature_2m_max[i + 1])}° <span className="text-muted">{Math.round(data.daily.temperature_2m_min[i + 1])}°</span></span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Notch() {
  useLang()
  const { open, pinned, togglePin, enter } = useSlider()
  const [tab, setTab] = useState(query.get('tab') || load('tab', 'Today'))
  const [tint, setTint] = useState(Number(load('tint', 55)))
  const [city, setCity] = useCity()
  const [showLook, setShowLook] = useState(false)
  // one strip of tabs; arrows on either side (when there's more that way) move it one tab at a time
  const tabRow = useRef(), wheelAt = useRef(0)
  const [tip, setTip] = useState(null) // { text, x, y } of the hovered tab
  const talkTab = Object.keys(house.tiles ?? {}).find((k) => house.tiles[k].talk)
  const [edges, setEdges] = useState({ l: false, r: false })
  const strip = () => tabRow.current?.firstChild
  const readEdges = () => { const el = strip(); if (!el) return; const l = el.scrollLeft > 1, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1; if (l !== edges.l || r !== edges.r) setEdges({ l, r }) }
  useLayoutEffect(readEdges)
  const step = (dir) => {
    setTip(null) // the strip moves under the label
    const el = strip(), kids = [...el.children], x = el.scrollLeft
    const to = dir > 0 ? kids.find((k) => k.offsetLeft > x + 1) : kids.filter((k) => k.offsetLeft < x - 1).pop()
    if (to) el.scrollTo({ left: Math.min(to.offsetLeft, el.scrollWidth - el.clientWidth), behavior: 'smooth' })
  }
  const radios = useRadios(open)

  return (
    <div className="relative h-full w-full overflow-hidden" onMouseEnter={enter}
      style={{ textShadow: '0 1px 3px rgba(0,0,0,.85)' }}>
      {/* the window itself is see-through: the controls float; the Glass/Solid slider only adds a dark tint */}
      <div className="absolute inset-0 rounded-b-3xl" style={{ background: `rgba(5,5,5,${tint / 100})` }} />
      {open && tip && <div className="pointer-events-none fixed z-50 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#050505]/90 px-2.5 py-0.5 text-xs font-semibold text-[#d8d8d8] ring-1 ring-accent/60"
        style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      {!open ? null : (
        <div className="relative flex h-full flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            {/* drag a tab to move it; one strip, the arrows show the rest one tab at a time */}
            {edges.l && <button title={t('Previous')} onClick={() => step(-1)} className="rounded-full bg-card/80 p-1 text-muted hover:text-white"><ChevronLeft size={16} /></button>}
            <div ref={tabRow} className="min-w-0 flex-1" onScroll={readEdges}
              // the mouse wheel moves the strip one tab per notch (at most every 120 ms, so a fast spin doesn't skip many)
              onWheel={(e) => { const now = Date.now(); if (now - wheelAt.current < 120) return; wheelAt.current = now; step(e.deltaY + e.deltaX > 0 ? 1 : -1) }}>
            <Sortable name="tabs" className="flex gap-1.5 overflow-hidden" onScroll={readEdges}>
            {Object.entries(TABS()).map(([id, label, I = tabIcon(id)]) => (
              <button key={id} onClick={() => { setTab(id); save('tab', id) }} aria-label={t(label)}
                // the name in a small label under the icon (native tooltips don't show in these see-through windows)
                onMouseEnter={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ text: t(label), x: r.left + r.width / 2, y: r.bottom + 6 }) }}
                onMouseLeave={() => setTip(null)}
                className={`shrink-0 rounded-full p-1.5 ${tab === id ? 'bg-accent text-ink' : 'bg-card/80 text-muted hover:text-white'}`}>
                <I size={17} /></button>
            ))}
            </Sortable>
            </div>
            {edges.r && <button title={t('Next')} onClick={() => step(1)} className="rounded-full bg-card/80 p-1 text-muted hover:text-white"><ChevronRight size={16} /></button>}
            <button title={t('Circle to Ask')} className="rounded-full p-2 text-muted hover:text-white" onClick={() => window.art?.grab.start('ask')}><Sparkles size={16} /></button>
            <button title={t('Screen grab')} className="rounded-full p-2 text-muted hover:text-white" onClick={() => window.art?.grab.start()}><Crop size={16} /></button>
            <button title={t('Tray icons (shows the taskbar for a moment)')} className="rounded-full p-2 text-muted hover:text-white"
              onClick={() => window.art?.showTray()}><ChevronsUp size={16} /></button>
            {/* the mic opens the tile tab that has the talk card (house.json "talk": true) and starts listening */}
            {talkTab && <button title={t('Talk to {a}')} className="ml-auto rounded-full p-2 text-accent hover:brightness-125"
              onClick={() => { setTab(talkTab); save('tab', talkTab); setTimeout(() => dispatchEvent(new Event('jarvis-listen')), 400) }}>
              <Mic size={16} />
            </button>}
            <div className="relative">
              <button onClick={() => setShowLook(!showLook)} title={t('Look')} className={`rounded-full p-2 ${showLook ? 'text-accent' : 'text-muted hover:text-white'}`}>
                <Settings2 size={16} />
              </button>
              {showLook && (
                // settings: transparency and language
                <div className="absolute right-0 top-9 z-10 flex w-60 flex-col gap-3 rounded-xl bg-card p-3 text-xs text-muted shadow-lg">
                  <label className="flex items-center gap-2">
                    {t('Glass')}
                    <input type="range" min="0" max="100" value={tint} className="flex-1 accent-[#E8650A]"
                      onChange={(e) => { setTint(Number(e.target.value)); save('tint', e.target.value) }} />
                    {t('Solid')}
                  </label>
                  <div className="flex items-center gap-2">
                    {t('Language')}
                    <div className="ml-auto flex overflow-hidden rounded-full ring-1 ring-white/10">
                      {['en', 'es'].map((l) => (
                        <button key={l} onClick={() => setLang(l)}
                          className={`px-3 py-1 font-semibold ${getLang() === l ? 'bg-accent text-ink' : 'text-muted hover:text-white'}`}>{l.toUpperCase()}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <button onClick={togglePin} title={t(pinned ? 'Unpin (auto-hide again)' : 'Pin open')}
              className={`rounded-full p-2 ${pinned ? 'text-accent' : 'text-muted hover:text-white'}`}>
              {pinned ? <Pin size={16} /> : <PinOff size={16} />}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'Today' ? <Today city={city} setCity={setCity} /> : tab === 'Controls' ? <Controls radios={radios} /> : tab === 'Remote' ? <Remote /> : tab === 'Screens' ? <Screens /> : tab === 'Claude' ? <ClaudeTab /> : tab === 'Torrents' ? <Torrents /> : tab === 'Dashboards' ? <Dashboards /> : tab === 'Clipboard' ? <Clipboard /> : tab === 'Power' ? <Power /> : tab === 'Ideas' ? <Ideas /> : house.tiles?.[tab] ? <HaTiles key={tab} tab={tab} /> : house.views?.[tab] ? <HaView key={tab} path={house.views[tab]} /> : null}
          </div>
        </div>
      )}
    </div>
  )
}
