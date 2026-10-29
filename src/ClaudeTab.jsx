import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, ShieldCheck, ShieldX, Mic, Send } from 'lucide-react'
import { startMic } from './mic.js'
import { t, ago } from './i18n.js'

const C = () => window.art?.claude

// what a request would do, in one line (the full command sits behind the drop-down)
function summary(p) {
  const i = p.input || {}
  return i.description || i.command?.split('\n')[0] || i.file_path || i.path || i.url || i.pattern || i.query || p.tool
}

// a permission request: summary first; Allow stays off until the full command has been opened
function Request({ p }) {
  const [shown, setShown] = useState(false)
  const full = p.input?.command ?? JSON.stringify(p.input, null, 2)
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card/80 p-3 ring-1 ring-accent/60">
      <div className="flex items-baseline gap-2">
        <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-ink" style={{ textShadow: 'none' }}>{p.tool}</span>
        <span className="truncate text-sm font-semibold">{p.name}</span>
        <span className="ml-auto shrink-0 text-xs text-muted">{ago(p.at)}</span>
      </div>
      <div className="truncate text-sm">{summary(p)}</div>
      <button className="flex items-center gap-1 self-start text-xs text-muted hover:text-white" onClick={() => setShown(!shown)}>
        {shown ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {t(shown ? 'Hide the full command' : 'Show the full command')}
      </button>
      {shown && <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-ink/90 p-2 font-mono text-xs text-[#d8d8d8]">{full}</pre>}
      <div className="flex gap-2">
        <button disabled={!shown} title={shown ? '' : t('Open the full command first')} onClick={() => C().decide(p.id, true)}
          className="flex items-center gap-1 rounded-full bg-accent px-4 py-1 text-sm font-semibold text-ink disabled:opacity-35" style={{ textShadow: 'none' }}>
          <ShieldCheck size={15} /> {t('Allow')}</button>
        <button onClick={() => C().decide(p.id, false)} className="flex items-center gap-1 rounded-full bg-[#3a3a3c] px-4 py-1 text-sm">
          <ShieldX size={15} /> {t('Deny')}</button>
      </div>
    </div>
  )
}

const DOT = { working: 'bg-accent animate-pulse', waiting: 'bg-accent', done: 'bg-white/60', idle: 'bg-white/25' }

// reply to a session, typed or dictated (HA's Whisper writes it into the box to check before sending); it goes through
// a relay session, which forwards it to that session
function Reply({ name }) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [listening, setListening] = useState(false)
  const [level, setLevel] = useState(0)
  const stopRef = useRef(null)
  const J = () => window.art?.jarvis
  const endMic = () => { stopRef.current?.(); stopRef.current = null; setListening(false) }
  useEffect(() => {
    const off = J()?.onEvent((ev) => {
      if (ev.stage === 'heard') { endMic(); J().stop(); if (ev.text) setText((x) => (x ? x + ' ' : '') + ev.text); setStatus(ev.text ? '' : t("I didn't hear you")) }
      if (ev.stage === 'error') { endMic(); setStatus(ev.error || 'Error') }
      if (ev.stage === 'done') endMic()
    })
    return () => { off?.(); endMic() }
  }, [])
  const dictate = async () => {
    if (stopRef.current) { endMic(); J()?.stop(); return }
    setStatus(t('Connecting…'))
    const r = await J()?.start(undefined, true)
    if (!r?.ok) return setStatus(r?.error || t('{a} unavailable'))
    try { stopRef.current = await startMic((c) => J().audio(c), setLevel); setListening(true); setStatus(t('Listening…')) }
    catch (err) { J()?.stop(); setStatus(`${t('Microphone')}: ${err.message}`) }
  }
  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setStatus(t('Sending…'))
    const r = await C().reply(name, text.trim())
    if (r.error) setStatus(`${t('Not sent')}: ${r.error}`)
    else { setText(''); setStatus(`${t('Sent')} · ${r.value ?? ''}`) }
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-1 px-3 pb-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={dictate} title={t(listening ? 'Stop' : 'Dictate')}
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${listening ? 'animate-pulse bg-accent text-ink' : 'bg-[#2c2c2e] text-accent ring-1 ring-accent'}`}>
          <Mic size={16} />
          {listening && <span className="absolute -bottom-1 h-1 rounded-full bg-white/80" style={{ width: `${Math.max(4, level * 30)}px` }} />}
        </button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`${t('Reply to')} ${name}…`}
          className="min-w-0 flex-1 rounded-full bg-ink/80 px-3 py-1.5 text-sm outline-none ring-1 ring-white/10 focus:ring-accent" />
        <button className="rounded-full p-2 text-muted hover:text-accent" title={t('Send')}><Send size={16} /></button>
      </div>
      {status && <div className="truncate text-xs text-muted">{status}</div>}
    </form>
  )
}

// what a session has been doing: its latest messages and tool calls (from its transcript), refreshed while open
function Steps({ id }) {
  const [steps, setSteps] = useState(null)
  useEffect(() => {
    const load = () => C()?.detail(id).then(setSteps)
    load()
    const t2 = setInterval(load, 4000)
    return () => clearInterval(t2)
  }, [id])
  if (!steps) return <p className="px-3 pb-2 text-xs text-muted">…</p>
  return (
    <div className="flex flex-col gap-1 px-3 pb-3">
      {steps.map((s, i) => s.who === 'tool'
        ? <div key={i} className="truncate font-mono text-[11px] text-muted">▸ {s.text}</div>
        : <div key={i} className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-xs ${s.who === 'user' ? 'self-end bg-accent/90 text-ink' : 'self-start bg-[#2c2c2e]'}`}
            style={s.who === 'user' ? { textShadow: 'none' } : undefined}>{s.text.length > 380 ? s.text.slice(0, 380) + '…' : s.text}</div>)}
    </div>
  )
}

export default function ClaudeTab() {
  const [st, setSt] = useState({ sessions: [], pending: [] })
  const [openId, setOpenId] = useState(null)
  useEffect(() => {
    const load = () => C()?.state().then(setSt)
    load()
    const off = C()?.onChange(load)
    const id = setInterval(load, 5000) // transcripts change without any hook: re-read them now and then
    return () => { off?.(); clearInterval(id) }
  }, [])
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto">
      {st.pending.map((p) => <Request key={p.id} p={p} />)}
      {!st.sessions.length && <p className="text-sm text-muted">{t('No Claude Code sessions have reported in yet.')}</p>}
      <div className="flex flex-col gap-1.5">
        {st.sessions.map((s) => (
          <div key={s.id} className={`rounded-xl ${openId === s.id ? 'bg-card/80' : 'bg-card/60'}`}>
            <button className="flex w-full items-center gap-3 px-3 py-2 text-left" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.state] ?? DOT.idle}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{s.name}</div>
                {s.message && openId !== s.id && <div className="truncate text-xs text-muted">{s.message}</div>}
              </div>
              <span className="shrink-0 text-xs text-muted">{t({ working: 'Working', waiting: 'Waiting for you', done: 'Done', idle: 'Idle' }[s.state] ?? s.state)} · {ago(s.at)}</span>
              {openId === s.id ? <ChevronDown size={14} className="shrink-0 text-muted" /> : <ChevronRight size={14} className="shrink-0 text-muted" />}
            </button>
            {openId === s.id && <><Steps id={s.id} /><Reply name={s.name} /></>}
          </div>
        ))}
      </div>
    </div>
  )
}
