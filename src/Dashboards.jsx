import { useEffect, useState } from 'react'
import { ArrowLeft, ExternalLink, House, Cpu, Clapperboard, Cctv, Network, Lightbulb, FolderKanban, Gamepad2, Mail, MessageCircle, AtSign, Map, LayoutGrid } from 'lucide-react'
import HaView from './HaView.jsx'
import Sortable from './Sortable.jsx'
import { house } from './house.js'
import { t } from './i18n.js'

// icon names in house.json "dashboards" -> icons
const ICONS = { home: House, devices: Cpu, media: Clapperboard, cameras: Cctv, network: Network, ideas: Lightbulb, projects: FolderKanban,
  remotes: Gamepad2, mail: Mail, chat: MessageCircle, social: AtSign, map: Map }

// tile shortcuts to the main HA dashboards (house.json "dashboards": [{ name, path, icon }]); a tile opens the dashboard
// right here, drawn by HA (back arrow returns to the tiles, the arrow-out opens it in the browser)
export default function Dashboards() {
  const list = house.dashboards ?? []
  const [open, setOpen] = useState(null)
  const [url, setUrl] = useState('')
  useEffect(() => { window.art?.haUrl().then((u) => setUrl(u || '')) }, [])
  if (open) return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(null)} className="flex items-center gap-1 rounded-full bg-card/80 px-3 py-1 text-sm hover:text-accent"><ArrowLeft size={14} />{t('Dashboards')}</button>
        <span className="font-semibold">{t(open.name)}</span>
        {url && <a href={`${url}/${open.path}`} target="_blank" title={t('Open bigger in its own window')} className="ml-auto rounded-full p-1 text-muted hover:text-white"><ExternalLink size={15} /></a>}
      </div>
      <div className="min-h-0 flex-1"><HaView key={open.path} path={open.path} /></div>
    </div>
  )
  return (
    <Sortable name="dashboards" className="grid grid-cols-4 gap-2">
      {list.map((d) => {
        const Icon = ICONS[d.icon] ?? LayoutGrid
        return (
          <button key={d.path} onClick={() => setOpen(d)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl bg-card/80 p-3 transition hover:shadow-[0_0_16px_rgba(232,101,10,.5)] hover:ring-1 hover:ring-accent">
            <Icon size={28} className="text-accent" />
            <span className="truncate text-sm font-semibold">{t(d.name)}</span>
          </button>
        )
      })}
    </Sortable>
  )
}
