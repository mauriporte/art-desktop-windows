import { useEffect, useState } from 'react'
import { Pin, PinOff, Play, Pause, SkipBack, SkipForward, Volume1 } from 'lucide-react'
import Remote from './Remote.jsx'
import { Today, useCity } from './Notch.jsx'
import { load, save, query, useSlider } from './slider.js'
import { t, useLang } from './i18n.js'

const ha = (op, ...a) => window.art?.ha(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })

// Music: HA's Spotify media player (as on the Linux desktop's panel)
function Music({ open }) {
  const [id, setId] = useState(null)
  const [s, setS] = useState(null)
  const [art, setArt] = useState(null)
  useEffect(() => { window.art?.ha('music').then(setId) }, [])
  const refresh = () => id && ha('states', [id]).then((r) => setS(r.value?.[id] ?? null))
  useEffect(() => { if (!open || !id) return; refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t) }, [id, open])
  useEffect(() => { if (s?.picture) ha('image', s.picture).then((r) => r.value && setArt(r.value)); else setArt(null) }, [s?.picture])
  const call = (service, data) => ha('call', 'media_player', service, { entity_id: id, ...data }).then(refresh)
  if (!id) return <p className="text-sm text-muted">{t('No music player set (ha.json "music").')}</p>
  const playing = s?.state === 'playing'
  const btn = 'flex h-14 w-14 items-center justify-center rounded-full bg-card hover:brightness-125 active:bg-accent active:text-ink'
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="aspect-square w-full overflow-hidden rounded-2xl bg-card">
        {art && <img src={art} className="h-full w-full object-cover" />}
      </div>
      <div className="w-full text-center">
        <div className="truncate text-lg font-semibold">{s?.title || (s ? t('Nothing playing') : '…')}</div>
        <div className="truncate text-sm text-muted">{s?.artist || (s?.state ?? '')}</div>
      </div>
      <div className="flex items-center gap-4">
        <button className={btn} onClick={() => call('media_previous_track')}><SkipBack size={22} /></button>
        <button className={`${btn} h-[72px] w-[72px] border-2 border-accent`} onClick={() => call('media_play_pause')}>
          {playing ? <Pause size={28} /> : <Play size={28} />}</button>
        <button className={btn} onClick={() => call('media_next_track')}><SkipForward size={22} /></button>
      </div>
      {s?.volume != null && (
        <label className="flex w-full items-center gap-3 text-muted">
          <Volume1 size={18} />
          <input type="range" min="0" max="100" defaultValue={Math.round(s.volume * 100)} className="flex-1 accent-[#E8650A]"
            onMouseUp={(e) => call('volume_set', { volume_level: Number(e.target.value) / 100 })} />
        </label>
      )}
    </div>
  )
}

// the Linux desktop's slide-in panel on the right edge: Music, Weather and Remote, see-through, pin keeps it out
export default function Panel() {
  useLang()
  const { open, pinned, togglePin, enter } = useSlider()
  const [page, setPage] = useState(load('panelPage', 'Remote'))
  const [city, setCity] = useCity()
  const tint = Number(load('tint', 55))
  // the window's glass follows the pin (frosted pinned, floating unpinned); main ignores it when already matching
  useEffect(() => { window.art?.panelPinned(pinned) }, [])
  return (
    <div className="relative h-full w-full overflow-hidden" onMouseEnter={enter} style={{ textShadow: '0 1px 3px rgba(0,0,0,.85)' }}>
      {/* see-through like the notch: the Glass/Solid setting only adds a dark tint */}
      <div className="absolute inset-0 rounded-l-3xl" style={{ background: `rgba(5,5,5,${tint / 100})` }} />
      {open && (
        <div className="relative flex h-full flex-col gap-4 p-5">
          <div className="flex items-center gap-2">
            {['Music', 'Weather', 'Remote'].map((p) => (
              <button key={p} onClick={() => { setPage(p); save('panelPage', p) }}
                className={`rounded-full px-3 py-1 text-sm ${page === p ? 'bg-accent font-semibold text-ink' : 'bg-card/80 text-muted hover:text-white'}`}>{t(p)}</button>
            ))}
            <button onClick={() => { togglePin(); window.art?.panelPinned(!pinned) }} title={t(pinned ? 'Unpin (auto-hide again)' : 'Pin open')}
              className={`ml-auto rounded-full p-2 ${pinned ? 'text-accent' : 'text-muted hover:text-white'}`}>
              {pinned ? <Pin size={16} /> : <PinOff size={16} />}
            </button>
          </div>
          <div className="min-h-0 flex-1">
            {page === 'Music' ? <Music open={open} /> : page === 'Weather' ? <Today city={city} setCity={setCity} /> : <Remote />}
          </div>
        </div>
      )}
    </div>
  )
}
