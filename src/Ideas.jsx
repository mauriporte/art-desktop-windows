import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Brain, Map as MapIcon, Search } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { t } from './i18n.js'

const open = (n) => window.art?.ideas.open(n.id)

// one collection's notes (or a search over all): newest first, click = open the note in Obsidian
function NoteList({ notes, title, back }) {
  const [q, setQ] = useState('')
  const shown = notes.filter((n) => !q || `${n.title} ${n.summary ?? ''}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200)
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        {back && <button onClick={back} className="flex items-center gap-1 rounded-full bg-card/80 px-3 py-1 text-sm hover:text-accent"><ArrowLeft size={14} />{t('Brain Map')}</button>}
        <span className="font-semibold">{title}</span><span className="text-xs text-muted">{notes.length}</span>
        <label className="ml-auto flex items-center gap-1.5 rounded-full bg-card/80 px-3 py-1 text-sm">
          <Search size={13} className="text-muted" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search')} className="w-36 bg-transparent outline-none" /></label>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {shown.map((n) => (
          <button key={n.id} onClick={() => open(n)} className="flex shrink-0 flex-col rounded-2xl bg-card/70 px-3 py-2 text-left hover:ring-1 hover:ring-accent">
            <span className="truncate text-sm font-semibold">{n.title}</span>
            <span className="truncate text-xs text-muted">{n.created} · {n.summary}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// the collections as a mind map round the whole: each bubble sized by how many ideas it holds
function BrainMap({ notes, pick }) {
  const groups = useMemo(() => {
    const m = {}
    for (const n of notes) (m[n.collection] ||= []).push(n)
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length)
  }, [notes])
  const W = 680, H = 400, cx = W / 2, cy = H / 2
  const nodes = groups.map(([name, list], i) => {
    const a = (i / groups.length) * Math.PI * 2 - Math.PI / 2
    return { name, list, r: 10 + Math.sqrt(list.length) * 1.7, x: cx + Math.cos(a) * 158 * 1.25, y: cy + Math.sin(a) * 158 }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {nodes.map((n) => <line key={n.name} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#E8650A" strokeOpacity=".35" />)}
      {nodes.map((n) => (
        <g key={n.name} className="cursor-pointer" onClick={() => pick(n.name, n.list)}>
          <circle cx={n.x} cy={n.y} r={n.r} fill="#1C1C1E" stroke="#E8650A" strokeWidth="1.5" className="transition hover:fill-[#E8650A]" />
          <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#E8650A" fontSize="11" fontWeight="700" pointerEvents="none">{n.list.length}</text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r="38" fill="#E8650A" />
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#050505" fontSize="14" fontWeight="800">{t('Ideas')}</text>
      <text x={cx} y={cy + 15} textAnchor="middle" fill="#050505" fontSize="12" fontWeight="600">{notes.length}</text>
      {/* the collection names last, so they sit on top of every bubble and line */}
      {nodes.map((n) => (
        <text key={n.name} x={n.x} y={n.y + n.r + 13} textAnchor="middle" fill="#d8d8d8" fontSize="12" fontWeight="600" stroke="#050505" strokeWidth="3"
          paintOrder="stroke" className="cursor-pointer" onClick={() => pick(n.name, n.list)}>{t(n.name)}</text>
      ))}
    </svg>
  )
}

// every note with a place, as orange dots on a dark map (places are looked up once, then kept)
function IdeasMap({ notes }) {
  const box = useRef(), map = useRef(), layer = useRef()
  const [geo, setGeo] = useState({ geo: {}, pending: null })
  useEffect(() => {
    const read = () => window.art?.ideas.geo().then(setGeo)
    read(); const id = setInterval(read, 5000); return () => clearInterval(id)
  }, [])
  useEffect(() => {
    map.current = L.map(box.current, { zoomControl: false, attributionControl: true }).setView([41.39, 2.17], 12)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 19 }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    return () => map.current.remove()
  }, [])
  useEffect(() => {
    layer.current.clearLayers()
    for (const n of notes) {
      const p = n.place && geo.geo[n.place]
      if (!p) continue
      L.circleMarker(p, { radius: 6, color: '#E8650A', weight: 2, fillColor: '#E8650A', fillOpacity: 0.55 })
        .bindTooltip(`<b>${n.title.replace(/</g, '&lt;')}</b><br>${t(n.collection)}`).on('click', () => open(n)).addTo(layer.current)
    }
  }, [geo, notes])
  const placed = notes.filter((n) => n.place && geo.geo[n.place]).length
  return (
    <div className="relative h-full overflow-hidden rounded-2xl">
      <div ref={box} className="h-full w-full bg-ink" />
      <div className="pointer-events-none absolute left-2 top-2 z-[500] rounded-full bg-ink/85 px-3 py-1 text-xs text-[#d8d8d8]">
        {placed} {t('on the map')}{geo.pending ? ` · ${t('finding')} ${geo.pending} ${t('more places…')}` : ''}</div>
    </div>
  )
}

// Ideas tab: a summary tile, then the Brain Map (collections) or the Map (places); a collection opens its list
export default function Ideas() {
  const [notes, setNotes] = useState(null)
  const [error, setError] = useState('')
  const [view, setView] = useState('brain')
  const [coll, setColl] = useState(null) // [name, notes]
  useEffect(() => { window.art?.ideas.list().then((r) => r.error ? setError(r.error) : setNotes(r.notes)) }, [])
  if (error) return <p className="text-sm text-muted">{error}</p>
  if (!notes) return <p className="text-sm text-muted">…</p>
  const fresh = notes.filter((n) => n.status === 'nueva').length
  const chip = (on) => `flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${on ? 'bg-accent font-semibold text-ink' : 'bg-card/80 text-muted hover:text-white'}`
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="flex items-baseline gap-2 rounded-2xl bg-card/70 px-3 py-1.5">
          <span className="text-lg font-semibold text-accent">{fresh}</span><span className="text-xs text-muted">{t('new')}</span>
          <span className="text-lg font-semibold">{notes.length}</span><span className="text-xs text-muted">{t('in total')}</span>
        </div>
        <button className={`ml-auto ${chip(view === 'brain' && !coll)}`} onClick={() => { setView('brain'); setColl(null) }}><Brain size={14} />{t('Brain Map')}</button>
        <button className={chip(view === 'map')} onClick={() => { setView('map'); setColl(null) }}><MapIcon size={14} />{t('Map')}</button>
      </div>
      <div className="min-h-0 flex-1">
        {coll ? <NoteList notes={coll[1]} title={t(coll[0])} back={() => setColl(null)} />
          : view === 'map' ? <IdeasMap notes={notes} /> : <BrainMap notes={notes} pick={(name, list) => setColl([name, list])} />}
      </div>
    </div>
  )
}
