import { useEffect, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume1, Music2, Pin, PinOff } from 'lucide-react'
import { useSlider, load } from './slider.js'
import { t, useLang } from './i18n.js'

const ha = (op, ...a) => window.art?.ha(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })
const clock = (s) => (s == null || isNaN(s) ? '' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`)

// What's playing, with its cover, see-through like the notch and panel: this PC's own players first (Windows' media
// controls: exact song and time, no lag), then my paired devices (Joint Remote: phones, tablet, TV, watch, the Linux desktop),
// then the house's players in Home Assistant (Spotify elsewhere...). The right panel's player shows only this PC and the
// corner slide-in only what plays outside it, each with its own controls; the desktop widget shows whichever comes first.
// Song, artist and cover change together, only once the new cover has loaded.
// As a desktop widget (slide = false) it drags anywhere and right-click gives "Always on top"; as the slide-in it lives
// at the top of the left edge and collapses to the left like the panel.
const ART_WAIT = 3000
// Spotify's web app (a Brave app) gives Windows only Brave's icon as the cover: its cover comes from HA's Spotify player,
// once HA has caught up with the same song (HA can lag well over 10 s): the song shows after ART_WAIT, its cover when it comes
const WEB_SPOTIFY = /pjibgcllelbfgfagdaldikeohf/
const ART_KEEP_TRYING = 60000
const same = (a = '', b = '') => (a = a.toLowerCase(), b = b.toLowerCase(), !!a && !!b && (a.startsWith(b) || b.startsWith(a)))

// an app id as a name: org.smarttube.beta -> Smarttube
const appName = (id = '') => { const w = id.split('.').filter((x) => !/^(org|com|tv|android|app|beta|stable|debug)$/.test(x))[0] || ''; return w && w[0].toUpperCase() + w.slice(1) }

// every source in one shape; at = when position was true (ms). Order: this PC playing, a device of mine playing,
// an HA player playing, a device paused, this PC paused, then HA's (Spotify idle, a TV that only says "on")
async function nowPlaying(scope) {
  const l = await ha('local')
  const local = l?.title && { local: true, app: l.app, key: l.raw, title: l.title, artist: l.artist, album: l.album, playing: !!l.playing, position: l.position, at: l.updatedAt, duration: l.duration }
  if (scope === 'local') return local || null
  const here = scope === 'global' && local ? { title: local.title, playing: local.playing, spotify: /spotify/i.test(local.app) || WEB_SPOTIFY.test(local.app) } : undefined
  const [devs, r] = await Promise.all([ha('devicesNow').then((x) => x.value ?? []), ha('nowPlaying', here).then((x) => x.value)])
  const dev = devs.map((n) => ({ host: n.host, key: `${n.host}|${n.app}|${n.title}|${n.artist}`, title: n.title || appName(n.app), artist: n.artist, album: n.device,
    playing: n.state === 'playing', paused: n.state === 'paused', position: n.position, at: n.updatedAt, duration: n.duration, art: n.art ?? null }))
  // HA's TV with no song info (nor playing/paused): unknown, so no play/pause button at all until a real state arrives
  const app = r?.app && !r.title ? appName(r.app) : ''
  const remote = r && { id: r.id, key: `${r.id}|${r.title || r.app}|${r.artist}|${r.picture}`, title: r.title || app, artist: r.title ? r.artist : app && r.name, album: r.album,
    playing: r.state === 'playing', unknown: r.state === 'on', position: r.position, at: r.positionAt && Date.parse(r.positionAt), duration: r.duration, volume: r.volume, picture: r.picture }
  if (scope === 'global') return dev.find((d) => d.playing) || (remote?.playing && remote) || dev.find((d) => d.paused) || remote || null
  return (local?.playing && local) || dev.find((d) => d.playing) || (remote?.playing && remote) || dev.find((d) => d.paused) || local || remote || null
}

// the cover of that song, or null; a local cover only counts once Windows has it for this very song
async function coverOf(c, prevArt) {
  if (c.host) return c.art // a device sends its cover with the song
  if (c.local && WEB_SPOTIFY.test(c.app)) {
    const id = await ha('music')
    const h = id && (await ha('states', [id])).value?.[id]
    return h?.picture && same(h.title, c.title) ? (await ha('image', h.picture)).value ?? undefined : undefined
  }
  if (c.local) {
    const r = await ha('localArt')
    return r?.title === c.key && r.art !== prevArt ? r.art : undefined
  }
  return c.picture ? (await ha('image', c.picture)).value ?? undefined : null
}

export function SpotifyPlayer({ slide = false, scope }) {
  useLang()
  const [cur, setCur] = useState(undefined) // latest reading
  const [shown, setShown] = useState(null) // what's on screen: {...song, art}
  const [now, setNow] = useState(Date.now())
  const refresh = () => nowPlaying(scope).then(setCur, () => {})
  useEffect(() => { refresh(); const a2 = setInterval(refresh, 1500); return () => clearInterval(a2) }, [])
  useEffect(() => { const t2 = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t2) }, [])
  // a new song: keep the old one on screen while its cover loads (retrying), then switch all of it at once
  useEffect(() => {
    if (cur === undefined || (cur?.key ?? null) === (shown?.key ?? null)) return
    if (!cur) { setShown(null); return }
    let gone = false, timer, blank = false
    const start = Date.now()
    const prevArt = shown?.art
    const web = cur.local && WEB_SPOTIFY.test(cur.app)
    if (web) ha('musicRefresh') // one re-read of Spotify by HA per song, so its cover catches up sooner
    const tryArt = async () => {
      const art = await coverOf(cur, prevArt).catch(() => undefined)
      if (gone) return
      if (art !== undefined) return setShown({ ...cur, art })
      const waited = Date.now() - start
      // no cover yet after the wait: the song with the blank cover (never the old one); web Spotify keeps trying for its own
      if (waited > ART_WAIT && !blank) blank = true, setShown(web ? { ...cur, art: null } : { ...cur, art: cur.local ? (await ha('localArt'))?.art ?? null : null })
      if (web ? waited < ART_KEEP_TRYING : waited <= ART_WAIT) timer = setTimeout(tryArt, web ? 1500 : 500)
    }
    tryArt()
    return () => { gone = true; clearTimeout(timer) }
  }, [cur?.key])
  const call = (service, data) => {
    const done = () => { refresh(); setTimeout(refresh, 800) }
    if (shown?.host) return ha('deviceKey', shown.host, { media_play_pause: 'play_pause', media_next_track: 'next', media_previous_track: 'previous' }[service]).then(done)
    if (shown?.local) return ha('localCtl', { media_play_pause: 'play', media_next_track: 'next', media_previous_track: 'prev' }[service]).then(done)
    return ha('call', 'media_player', service, { entity_id: shown?.id, ...data }).then(() => { done(); setTimeout(() => ha('music').then((m) => m === shown?.id && ha('musicRefresh').then(refresh)), 1200) })
  }

  // play state and time only from a reading of the song on screen
  const s = cur && shown && cur.key === shown.key ? { ...shown, ...cur, art: shown.art } : shown
  const art = s?.art
  const playing = !!s?.playing
  // where the song is now: the last known position plus the time since, while playing
  const pos = s?.position == null ? null : Math.min(s.duration ?? Infinity, s.position + (playing && s.at ? (now - s.at) / 1000 : 0))
  const btn = 'flex items-center justify-center rounded-full bg-card/80 hover:brightness-125 active:bg-accent active:text-ink'
  const noDrag = { WebkitAppRegion: 'no-drag' }
  return (
    // the whole widget drags the window, except its controls
    <div className="flex h-full w-full flex-col gap-2.5 p-3" style={{ WebkitAppRegion: slide ? 'no-drag' : 'drag', textShadow: '0 1px 3px rgba(0,0,0,.85)' }}
      onContextMenu={(e) => { if (!slide) { e.preventDefault(); window.art?.widgetMenu() } }}>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-card/60 shadow-2xl ring-1 ring-white/10">
        {art ? <img src={art} draggable={false} className="h-full w-full object-cover" />
          : <div className="flex h-full items-center justify-center text-muted"><Music2 size={56} /></div>}
      </div>
      <div className="min-w-0 text-center">
        <div className="truncate text-lg font-semibold">{s?.title || (cur !== undefined ? t('Nothing playing') : '…')}</div>
        <div className="truncate text-sm text-muted">{[s?.artist, s?.album].filter(Boolean).join(' · ')}</div>
      </div>
      {s?.duration > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span className="w-8 text-right">{clock(pos)}</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-accent" style={{ width: `${(100 * (pos ?? 0)) / s.duration}%` }} /></div>
          <span className="w-8">{clock(s.duration)}</span>
        </div>
      )}
      <div className="flex items-center justify-center gap-4" style={noDrag}>
        <button className={`${btn} h-11 w-11`} onClick={() => call('media_previous_track')}><SkipBack size={18} /></button>
        {/* only a real state gets the button */}
        {!s?.unknown && <button className={`${btn} h-14 w-14 border-2 border-accent`} onClick={() => call('media_play_pause')}>{playing ? <Pause size={24} /> : <Play size={24} />}</button>}
        <button className={`${btn} h-11 w-11`} onClick={() => call('media_next_track')}><SkipForward size={18} /></button>
      </div>
      {s?.volume != null && (
        <label className="flex items-center gap-3 text-muted" style={noDrag}>
          <Volume1 size={16} />
          <input type="range" min="0" max="100" defaultValue={Math.round(s.volume * 100)} className="flex-1 accent-[#E8650A]"
            onMouseUp={(e) => call('volume_set', { volume_level: Number(e.target.value) / 100 })} />
        </label>
      )}
    </div>
  )
}

export default SpotifyPlayer

// the slide-in on the left edge, its tab in the middle like the right panel's (touch it to bring it out; the pin keeps it out)
export function SpotifySlide() {
  const { open, pinned, togglePin, enter } = useSlider()
  const tint = Number(load('tint', 55))
  return (
    <div className="relative h-full w-full overflow-hidden" onMouseEnter={enter}>
      <div className="absolute inset-0 rounded-r-3xl" style={{ background: `rgba(5,5,5,${tint / 100})` }} />
      {open && (
        <div className="relative h-full">
          <button onClick={togglePin} title={t(pinned ? 'Unpin (auto-hide again)' : 'Pin open')}
            className={`absolute right-2 top-2 z-10 rounded-full p-2 ${pinned ? 'text-accent' : 'text-muted hover:text-white'}`}>
            {pinned ? <Pin size={16} /> : <PinOff size={16} />}
          </button>
          <SpotifyPlayer slide scope="global" />
        </div>
      )}
    </div>
  )
}
