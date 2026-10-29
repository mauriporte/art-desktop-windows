import { useEffect, useRef, useState } from 'react'
import { Mic, Send } from 'lucide-react'
import { load as loadPref, save } from './slider.js'
import { t } from './i18n.js'
import { startMic } from './mic.js'

const J = () => window.art?.jarvis

// Talk to the assistant: the mic streams 16 kHz mono PCM into HA's assistant pipeline (HA notices the end of speech; a second
// click also ends it), or type a message. Shows what the assistant heard and its answer, and plays the spoken answer.
export default function JarvisTalk() {
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('')
  const [log, setLog] = useState([]) // [{who: 'me'|'jarvis', text}]
  const mic = useRef(null)
  const audioEl = useRef(null)
  // input: which microphone, how much boost (quiet webcam mics), and a live level so the user can see it hears him
  const [inputs, setInputs] = useState([])
  const [deviceId, setDeviceId] = useState(loadPref('micId', ''))
  const [boost, setBoost] = useState(Number(loadPref('micBoost', 3)))
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const list = () => navigator.mediaDevices.enumerateDevices().then((d) => setInputs(d.filter((x) => x.kind === 'audioinput')))
    list(); navigator.mediaDevices.addEventListener('devicechange', list)
    return () => navigator.mediaDevices.removeEventListener('devicechange', list)
  }, [])

  const add = (who, text) => text && setLog((l) => [...l.slice(-5), { who, text }])
  const stopMic = () => {
    const stop = mic.current
    mic.current = null
    stop?.()
    setListening(false); setLevel(0)
  }

  useEffect(() => {
    const off = J()?.onEvent(async (ev) => {
      if (ev.stage === 'heard') { stopMic(); J().stop(); add('me', ev.text); setStatus(ev.text ? t('Thinking…') : t("I didn't hear you")) }
      if (ev.stage === 'reply') {
        add('jarvis', ev.reply); setStatus('')
        const r = await J().speech(ev.reply)
        if (r.value && audioEl.current) { audioEl.current.src = r.value; audioEl.current.play().catch(() => {}) }
      }
      if (ev.stage === 'error') { stopMic(); setStatus(ev.error || 'Error') }
      if (ev.stage === 'done') stopMic()
    })
    // the header's mic button (any tab) asks this card to listen
    const listen = () => !mic.current && talk()
    addEventListener('jarvis-listen', listen)
    return () => { off?.(); removeEventListener('jarvis-listen', listen); stopMic() }
  }, [])

  async function talk() {
    if (mic.current) { stopMic(); J()?.stop(); return }
    setStatus(t('Connecting…'))
    const r = await J()?.start()
    if (!r?.ok) return setStatus(r?.error || t('{a} unavailable'))
    try {
      mic.current = await startMic((chunk) => J().audio(chunk), setLevel)
      // device labels only appear once a microphone has been allowed: refresh the list now
      navigator.mediaDevices.enumerateDevices().then((d) => setInputs(d.filter((x) => x.kind === 'audioinput')))
      setListening(true); setStatus(t('Listening…'))
    } catch (err) { J()?.stop(); setStatus(`${t('Microphone')}: ${err.message}`) }
  }

  async function type(e) {
    e.preventDefault()
    const text = e.target.text.value.trim()
    if (!text) return
    e.target.reset(); add('me', text); setStatus(t('Thinking…'))
    const r = await J()?.start(text)
    if (!r?.ok) setStatus(r?.error || t('{a} unavailable'))
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-2xl bg-card/70 p-3">
      <div className="flex items-center gap-3">
        <button onClick={talk} title={listening ? t('Stop') : t('Talk to {a}')}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition ${listening ? 'animate-pulse bg-accent text-ink' : 'bg-[#2c2c2e] ring-2 ring-accent hover:brightness-125'}`}>
          <Mic size={22} />
        </button>
        <form onSubmit={type} className="flex flex-1 items-center gap-2">
          <input name="text" placeholder={t('Write to {a}…')} className="min-w-0 flex-1 rounded-full bg-ink/80 px-4 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-accent" />
          <button className="rounded-full p-2 text-muted hover:text-accent"><Send size={18} /></button>
        </form>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted">
        <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); save('micId', e.target.value) }}
          className="min-w-0 flex-1 truncate rounded-full bg-ink/80 px-2 py-1 outline-none ring-1 ring-white/10">
          <option value="">{t('Default microphone')}</option>
          {inputs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || t('Microphone')}</option>)}
        </select>
        <span>{t('Gain')} {boost}×</span>
        <input type="range" min="1" max="8" step="0.5" value={boost} className="w-20 accent-[#E8650A]"
          onChange={(e) => { setBoost(Number(e.target.value)); save('micBoost', e.target.value) }} />
        {/* live input level while listening */}
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-accent transition-[width] duration-75" style={{ width: `${level * 100}%` }} /></div>
      </div>
      {status && <div className="text-xs text-muted">{status}</div>}
      {log.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {log.map((m, i) => (
            <div key={i} className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${m.who === 'me' ? 'self-end bg-accent/90 text-ink' : 'self-start bg-[#2c2c2e]'}`}>{m.text}</div>
          ))}
        </div>
      )}
      <audio ref={audioEl} className="hidden" />
    </div>
  )
}
