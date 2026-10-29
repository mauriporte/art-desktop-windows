import { useEffect, useRef, useState } from 'react'
import { MoveUpRight, Square, Type, Droplets, Highlighter, Undo2, Copy, Save, Pin, X, Sparkles, Send, Square as StopIcon } from 'lucide-react'
import { load, save } from './slider.js'
import { t, useLang } from './i18n.js'

const ORANGE = '#E8650A'
const useGrab = () => { const [g, setG] = useState(null); useEffect(() => { window.art?.grab.data().then(setG) }, []); return g }

// one screen's overlay: its frozen picture; drag = a region, click = the window under the cursor (or the whole screen
// where there is none), double-click / Enter = the whole screen, Esc = cancel
export function GrabSelect() {
  useLang()
  const g = useGrab()
  const [hover, setHover] = useState(null)
  const [drag, setDrag] = useState(null) // { x0, y0, x, y }
  const W = innerWidth, H = innerHeight
  const whole = { x: 0, y: 0, w: W, h: H }
  const clip = (r) => { const x = Math.max(0, r.x), y = Math.max(0, r.y); return { x, y, w: Math.min(W, r.x + r.w) - x, h: Math.min(H, r.y + r.h) - y } }
  const under = (x, y) => g?.rects.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') window.art.grab.pick(null); if (e.key === 'Enter') window.art.grab.pick(whole) }
    addEventListener('keydown', key); return () => removeEventListener('keydown', key)
  }, [])
  if (!g) return null
  if (g.mode === 'ask') return <AskCircle g={g} />
  const sel = drag && Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) > 4
    ? { x: Math.min(drag.x, drag.x0), y: Math.min(drag.y, drag.y0), w: Math.abs(drag.x - drag.x0), h: Math.abs(drag.y - drag.y0) }
    : hover && clip(hover)
  return (
    <div className="fixed inset-0 cursor-crosshair select-none" style={{ background: `url(${g.image}) 0 0 / ${W}px ${H}px no-repeat` }}
      onMouseMove={(e) => { if (drag) setDrag({ ...drag, x: e.clientX, y: e.clientY }); else setHover(under(e.clientX, e.clientY) ?? null) }}
      onMouseDown={(e) => e.button === 0 && setDrag({ x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY })}
      onMouseUp={() => { if (!drag) return; const moved = Math.abs(drag.x - drag.x0) + Math.abs(drag.y - drag.y0) > 4; setDrag(null); window.art.grab.pick(moved ? sel : hover ? clip(hover) : whole) }}
      onDoubleClick={() => window.art.grab.pick(whole)} onContextMenu={() => window.art.grab.pick(null)}>
      {/* everything outside the choice is dimmed; the choice has an orange edge and its size */}
      {sel ? (
        <div className="pointer-events-none absolute border-2 border-accent" style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h, boxShadow: '0 0 0 9999px rgba(0,0,0,.45)' }}>
          <span className="absolute -top-6 left-0 rounded bg-accent px-1.5 text-xs font-semibold text-ink">{Math.round(sel.w)} × {Math.round(sel.h)}</span>
        </div>
      ) : <div className="pointer-events-none absolute inset-0 bg-black/45" />}
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#050505]/85 px-4 py-1.5 text-sm text-[#d8d8d8] ring-1 ring-white/10">
        {t('Drag: area · Click: window · Enter: whole screen · Esc: cancel')}</div>
    </div>
  )
}

// Circle to Ask's overlay: draw round anything (freehand); what the line encloses goes to the ask window. Esc cancels
function AskCircle({ g }) {
  const [pts, setPts] = useState(null)
  const W = innerWidth, H = innerHeight
  useEffect(() => {
    const key = (e) => e.key === 'Escape' && window.art.grab.pick(null)
    addEventListener('keydown', key); return () => removeEventListener('keydown', key)
  }, [])
  const done = () => {
    const p = pts
    setPts(null)
    if (!p || p.length < 5) return
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]), pad = 8
    const x = Math.max(0, Math.min(...xs) - pad), y = Math.max(0, Math.min(...ys) - pad)
    const r = { x, y, w: Math.min(W, Math.max(...xs) + pad) - x, h: Math.min(H, Math.max(...ys) + pad) - y }
    if (r.w > 20 && r.h > 20) window.art.grab.pick(r)
  }
  return (
    <div className="fixed inset-0 cursor-crosshair select-none" style={{ background: `url(${g.image}) 0 0 / ${W}px ${H}px no-repeat` }}
      onMouseDown={(e) => e.button === 0 && setPts([[e.clientX, e.clientY]])} onMouseMove={(e) => pts && setPts([...pts, [e.clientX, e.clientY]])}
      onMouseUp={done} onContextMenu={() => window.art.grab.pick(null)}>
      <div className="pointer-events-none absolute inset-0 bg-black/30" />
      <svg className="pointer-events-none absolute inset-0" width={W} height={H}>
        {pts && <polyline points={pts.map((q) => q.join(',')).join(' ')} fill="rgba(232,101,10,.12)" stroke="#E8650A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0 0 6px rgba(232,101,10,.8))' }} />}
      </svg>
      <div className="pointer-events-none absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#050505]/85 px-4 py-1.5 text-sm text-[#d8d8d8] ring-1 ring-white/10">
        <Sparkles size={14} className="text-accent" />{t('Circle anything to ask about it · Esc: cancel')}</div>
    </div>
  )
}

// the ask window: the circled picture, a question, the model and the answer as it comes
// Ollama on this PC (4B quick, 9B better), Claude (Claude Code, the user's Pro plan) or Gemini (HA's Google AI Task)
const MODELS = [['qwen3.5:4b', '4B'], ['huihui_ai/qwen3.5-abliterated:9b', '9B'], ['claude', 'Claude'], ['gemini', 'Gemini']]
export function GrabAsk() {
  useLang()
  const g = useGrab()
  const [q, setQ] = useState(t('What is this?'))
  const [model, setModel] = useState(load('askModel', MODELS[0][0]))
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => window.art?.grab.onAnswer((piece) => setAnswer((a) => a + piece)), [])
  useEffect(() => { const key = (e) => e.key === 'Escape' && window.art.grab.close(); addEventListener('keydown', key); return () => removeEventListener('keydown', key) }, [])
  const ask = async () => {
    if (!q.trim() || busy) return
    setAnswer(''); setError(''); setBusy(true)
    const r = await window.art.grab.ask(g.image, q, model)
    setBusy(false)
    if (r?.error && r.error !== 'stopped') setError(r.error)
  }
  useEffect(() => { if (g) ask() }, [g]) // asks the default question straight away
  if (!g) return null
  return (
    <div className="flex h-screen flex-col gap-3 bg-ink p-3 text-white">
      <div className="flex items-center gap-2 [-webkit-app-region:drag]">
        <Sparkles size={16} className="text-accent" /><span className="font-semibold">{t('Circle to Ask')}</span>
        <div className="ml-auto flex overflow-hidden rounded-full ring-1 ring-white/10 [-webkit-app-region:no-drag]">
          {MODELS.map(([id, label]) => <button key={id} onClick={() => { setModel(id); save('askModel', id) }}
            className={`px-3 py-0.5 text-xs font-semibold ${model === id ? 'bg-accent text-ink' : 'text-muted hover:text-white'}`}>{label}</button>)}
        </div>
        <button onClick={() => window.art.grab.close()} className="rounded-full p-1 text-muted hover:text-white [-webkit-app-region:no-drag]"><X size={16} /></button>
      </div>
      <img src={g.image} className="max-h-40 self-center rounded-lg object-contain ring-1 ring-white/10" />
      <form className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5" onSubmit={(e) => { e.preventDefault(); ask() }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        {busy ? <button type="button" title={t('Stop')} onClick={() => window.art.grab.stopAsk()} className="text-accent"><StopIcon size={16} /></button>
          : <button type="submit" title={t('Ask')} className="text-accent"><Send size={16} /></button>}
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-card/60 p-3 text-sm leading-relaxed">
        {error ? <span className="text-muted">{error}</span> : answer || <span className="text-muted">{busy ? t('Thinking…') : ''}</span>}
      </div>
    </div>
  )
}

// the editor: arrow, box, text, blur, highlight (orange), undo; copy / save / pin
const TOOLS = [['arrow', MoveUpRight, 'Arrow'], ['box', Square, 'Box'], ['text', Type, 'Text'], ['blur', Droplets, 'Blur'], ['mark', Highlighter, 'Highlight']]
function draw(ctx, img, shapes) {
  ctx.drawImage(img, 0, 0)
  const lw = Math.max(3, img.width / 400)
  for (const s of shapes) {
    const x = Math.min(s.x1, s.x2), y = Math.min(s.y1, s.y2), w = Math.abs(s.x2 - s.x1), h = Math.abs(s.y2 - s.y1)
    ctx.save()
    if (s.type === 'blur' && w > 1 && h > 1) { ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.filter = `blur(${Math.max(6, img.width / 150)}px)`; ctx.drawImage(img, 0, 0) }
    if (s.type === 'mark') { ctx.fillStyle = 'rgba(232,101,10,.35)'; ctx.fillRect(x, y, w, h) }
    if (s.type === 'box') { ctx.strokeStyle = ORANGE; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h) }
    if (s.type === 'arrow') {
      const a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1), head = lw * 5
      ctx.strokeStyle = ctx.fillStyle = ORANGE; ctx.lineWidth = lw; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2 - Math.cos(a) * head * 0.8, s.y2 - Math.sin(a) * head * 0.8); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(s.x2, s.y2); ctx.lineTo(s.x2 - head * Math.cos(a - 0.45), s.y2 - head * Math.sin(a - 0.45))
      ctx.lineTo(s.x2 - head * Math.cos(a + 0.45), s.y2 - head * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill()
    }
    if (s.type === 'text') {
      ctx.font = `600 ${lw * 7}px Inter, Segoe UI, sans-serif`; ctx.fillStyle = ORANGE; ctx.textBaseline = 'top'
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = lw * 2; ctx.fillText(s.text, s.x1, s.y1)
    }
    ctx.restore()
  }
}

export function GrabEdit() {
  useLang()
  const g = useGrab()
  const canvas = useRef()
  const [img, setImg] = useState(null)
  const [tool, setTool] = useState('arrow')
  const [shapes, setShapes] = useState([])
  const [live, setLive] = useState(null)
  const [typing, setTyping] = useState(null) // { x, y, cx, cy } canvas + screen position of a text being typed
  const [msg, setMsg] = useState('')
  useEffect(() => { if (!g) return; const i = new Image(); i.onload = () => setImg(i); i.src = g.image }, [g])
  useEffect(() => { if (img) { canvas.current.width = img.width; canvas.current.height = img.height; draw(canvas.current.getContext('2d'), img, live ? [...shapes, live] : shapes) } }, [img, shapes, live])
  const at = (e) => { const r = canvas.current.getBoundingClientRect(), k = canvas.current.width / r.width; return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k } }
  const url = () => canvas.current.toDataURL('image/png')
  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  const copy = () => window.art.grab.copy(url()).then(() => flash(t('Copied')))
  const saveIt = () => window.art.grab.save(url()).then((p) => flash(`${t('Saved')}: ${p.split(/[\\/]/).pop()}`))
  useEffect(() => {
    const key = (e) => {
      if (typing) return
      if (e.key === 'Escape') window.art.grab.close()
      if (e.ctrlKey && e.key === 'z') setShapes((s) => s.slice(0, -1))
      if (e.ctrlKey && e.key === 'c') copy()
      if (e.ctrlKey && e.key === 's') saveIt()
    }
    addEventListener('keydown', key); return () => removeEventListener('keydown', key)
  })
  const btn = (on) => `flex items-center gap-1.5 rounded-full px-3 py-1 text-sm [-webkit-app-region:no-drag] ${on ? 'bg-accent font-semibold text-ink' : 'bg-card text-[#d8d8d8] hover:text-accent'}`
  return (
    <div className="flex h-screen flex-col bg-ink text-white">
      <div className="flex shrink-0 items-center gap-1.5 p-2 [-webkit-app-region:drag]">
        {TOOLS.map(([id, Icon, label]) => <button key={id} title={t(label)} className={btn(tool === id)} onClick={() => setTool(id)}><Icon size={15} />{t(label)}</button>)}
        <button title={t('Undo')} className={btn(false)} onClick={() => setShapes(shapes.slice(0, -1))} disabled={!shapes.length}><Undo2 size={15} /></button>
        <span className="ml-auto text-xs text-muted">{msg}</span>
        <button className={btn(false)} onClick={copy}><Copy size={15} />{t('Copy')}</button>
        <button className={btn(false)} onClick={saveIt}><Save size={15} />{t('Save')}</button>
        <button className={btn(false)} onClick={() => window.art.grab.pin(url())}><Pin size={15} />{t('Pin')}</button>
        <button title={t('Close')} className={btn(false)} onClick={() => window.art.grab.close()}><X size={15} /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3">
        <canvas ref={canvas} className="max-h-full max-w-full cursor-crosshair rounded-lg shadow-2xl ring-1 ring-white/10"
          onMouseDown={(e) => {
            const p = at(e)
            if (tool === 'text') { setTyping({ x: p.x, y: p.y, cx: e.clientX, cy: e.clientY }); return }
            setLive({ type: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y })
          }}
          onMouseMove={(e) => live && setLive({ ...live, ...((p) => ({ x2: p.x, y2: p.y }))(at(e)) })}
          onMouseUp={() => { if (live && Math.abs(live.x2 - live.x1) + Math.abs(live.y2 - live.y1) > 3) setShapes([...shapes, live]); setLive(null) }} />
        {typing && (
          <input autoFocus className="fixed rounded bg-ink/80 px-1 text-accent outline-none ring-1 ring-accent" style={{ left: typing.cx, top: typing.cy }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target.value) { setShapes([...shapes, { type: 'text', x1: typing.x, y1: typing.y, text: e.target.value }]); setTyping(null) }
              if (e.key === 'Escape') setTyping(null)
            }} onBlur={() => setTyping(null)} />
        )}
      </div>
    </div>
  )
}

// a pinned picture: stays on top, drag it anywhere, resize from its edges; × (on hover) or Esc closes it
export function GrabPin() {
  const g = useGrab()
  useEffect(() => { const key = (e) => e.key === 'Escape' && window.art.grab.close(); addEventListener('keydown', key); return () => removeEventListener('keydown', key) }, [])
  if (!g) return null
  return (
    <div className="group relative h-screen w-screen overflow-hidden bg-ink [-webkit-app-region:drag]">
      <img src={g.image} className="h-full w-full object-contain" draggable={false} />
      <button onClick={() => window.art.grab.close()} className="absolute right-1.5 top-1.5 hidden rounded-full bg-ink/80 p-1 text-white hover:text-accent group-hover:block [-webkit-app-region:no-drag]"><X size={14} /></button>
    </div>
  )
}
