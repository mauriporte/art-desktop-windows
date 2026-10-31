import { useEffect, useState } from 'react'
import { Pin, PinOff } from 'lucide-react'
import { SpotifyPlayer } from './SpotifyWidget.jsx'
import Remote from './Remote.jsx'
import { Today, useCity } from './Notch.jsx'
import { load, save, query, useSlider } from './slider.js'
import { t, useLang } from './i18n.js'

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
            {page === 'Music' ? <SpotifyPlayer slide scope="local" /> : page === 'Weather' ? <Today city={city} setCity={setCity} /> : <Remote />}
          </div>
        </div>
      )}
    </div>
  )
}
