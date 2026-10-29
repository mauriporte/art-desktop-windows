import { useEffect, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { t, ago } from './i18n.js'

// the last 30 things copied (texts and pictures, kept in memory by the app only): click one to copy it again
export default function Clipboard() {
  const [list, setList] = useState([])
  const [msg, setMsg] = useState('')
  const load = () => window.art?.clip.list().then(setList)
  useEffect(() => { load(); return window.art?.clip.onChange(load) }, [])
  const copy = (c) => window.art.clip.copy(c.id).then(() => { setMsg(t('Copied')); setTimeout(() => setMsg(''), 1500) })
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span>{t('Click an item to copy it again. Kept until the app closes.')}</span>
        <span className="ml-auto text-accent">{msg}</span>
        {list.length > 0 && <button className="flex items-center gap-1 rounded-full bg-card/80 px-2.5 py-1 hover:text-accent" onClick={() => window.art.clip.clear().then(load)}>
          <Trash2 size={12} />{t('Clear all')}</button>}
      </div>
      {!list.length && <p className="text-sm text-muted">{t('Nothing copied yet.')}</p>}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {list.map((c) => (
          <div key={c.id} className="group flex shrink-0 cursor-pointer items-center gap-3 rounded-2xl bg-card/70 p-2.5 hover:ring-1 hover:ring-accent" onClick={() => copy(c)}>
            {c.kind === 'image' ? <img src={c.thumb} className="h-12 max-w-[160px] rounded object-contain" />
              : <span className="line-clamp-2 min-w-0 flex-1 whitespace-pre-wrap break-words text-sm">{c.text}</span>}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{ago(new Date(c.at).toISOString())}</span>
            <button title={t('Remove')} className="invisible shrink-0 rounded-full p-1 text-muted hover:text-white group-hover:visible"
              onClick={(e) => { e.stopPropagation(); window.art.clip.remove(c.id).then(load) }}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
