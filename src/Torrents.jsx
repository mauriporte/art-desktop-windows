import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Gauge } from 'lucide-react'
import { Switch } from './HaTiles.jsx'
import { house } from './house.js'
import { t } from './i18n.js'

const ha = (op, ...a) => window.art?.ha(op, ...a) ?? Promise.resolve({ error: 'Not running in the app' })
const card = 'rounded-2xl bg-card/70 p-3'
// HA's speeds are MB/s: show KB/s below 1 MB/s
const rate = (s) => { const v = Number(s?.state); return isNaN(v) ? '—' : v >= 1 ? `${v.toFixed(1)} MB/s` : `${Math.round(v * 1024)} KB/s` }

// qBittorrent through HA (house.json "torrents": { download, upload, active, altSpeed } entity ids): speeds, the
// alternative-speed switch and every active torrent with its progress, refreshed every 3 s while the tab shows
export default function Torrents() {
  const cfg = house.torrents ?? {}
  const [states, setStates] = useState({})
  const [list, setList] = useState(null)
  const [error, setError] = useState('')
  const refresh = () => {
    ha('states', [cfg.download, cfg.upload, cfg.active, cfg.altSpeed].filter(Boolean)).then((r) => r.value && setStates(r.value))
    ha('torrents').then((r) => { if (r.error) setError(r.error); else { setError(''); setList(r.value.sort((a, b) => Number(b.percent_done) - Number(a.percent_done))) } })
  }
  useEffect(() => { refresh(); const id = setInterval(refresh, 3000); return () => clearInterval(id) }, [])
  const alt = states[cfg.altSpeed]

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        <div className={`${card} flex items-center gap-2`}><ArrowDown size={18} className="text-accent" />
          <div><div className="text-sm font-semibold">{rate(states[cfg.download])}</div><div className="text-xs text-muted">{t('Download')}</div></div></div>
        <div className={`${card} flex items-center gap-2`}><ArrowUp size={18} className="text-accent" />
          <div><div className="text-sm font-semibold">{rate(states[cfg.upload])}</div><div className="text-xs text-muted">{t('Upload')}</div></div></div>
        <div className={`${card} flex items-center gap-2`}><Gauge size={18} className="text-accent" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{t('Slow mode')}</div>
            <div className="text-xs text-muted">{t(alt?.state === 'on' ? 'On' : 'Off')}</div></div>
          {alt && <Switch on={alt.state === 'on'} onClick={() => ha('call', 'switch', 'toggle', { entity_id: cfg.altSpeed }).then(refresh)} />}</div>
      </div>
      {error && <p className="text-sm text-muted">Home Assistant: {error}</p>}
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('Active')} · {list?.length ?? '…'}</div>
      {list && !list.length && <p className="text-sm text-muted">{t('Nothing is downloading.')}</p>}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {list?.map((x) => {
          const pct = Number(x.percent_done) || 0
          return (
            <div key={x.id} className={`${card} flex shrink-0 flex-col gap-1.5`}>
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={x.name}>{x.name}</span>
                <span className="text-sm font-semibold text-accent">{pct.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#3a3a3c]"><div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></div>
              <div className="text-xs text-muted">{t(x.status)}{x.eta && x.eta !== 'None' ? ` · ${t('ETA')} ${x.eta}` : ''}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
