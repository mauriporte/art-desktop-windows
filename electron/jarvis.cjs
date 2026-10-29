// Talk to the voice assistant from the notch: HA's Assist pipeline named in house.json (jarvis.pipeline), driven over
// HA's WebSocket API. Voice: 16 kHz 16-bit mono PCM chunks streamed into the pipeline's speech-to-text; text: straight
// to the agent. The answer is spoken with house.json's TTS unless the assistant already answers on its own speaker.
const fs = require('fs')
const os = require('os')
const path = require('path')

const HA_CONF = path.join(os.homedir(), '.config', 'art-desktop', 'ha.json')
const house = require('./house.cjs')
let conversationId = null // keeps the conversation going between turns
let run = null // { ws, handler } while a voice turn is open

const conf = () => JSON.parse(fs.readFileSync(HA_CONF, 'utf8'))

// opens an authenticated HA WebSocket; resolves with { ws, send(msg) -> id }
function connect(onMessage) {
  return new Promise((resolve, reject) => {
    const c = conf()
    const ws = new WebSocket(c.url.replace(/^http/, 'ws') + '/api/websocket')
    let id = 0
    const api = { ws, send: (m) => { ws.send(JSON.stringify({ id: ++id, ...m })); return id } }
    ws.binaryType = 'arraybuffer'
    ws.onerror = () => reject(new Error('Home Assistant not reachable'))
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: c.token }))
      else if (m.type === 'auth_invalid') reject(new Error('HA token rejected'))
      else if (m.type === 'auth_ok') resolve(api)
      else onMessage(m, api)
    }
  })
}

async function pipelineId(api) {
  return new Promise((resolve) => {
    const want = api.send({ type: 'assist_pipeline/pipeline/list' })
    api.onList = (m) => m.id === want && resolve(m.result.pipelines.find((p) => p.name === house().jarvis?.pipeline)?.id ?? m.result.preferred_pipeline)
  })
}

// runs one the assistant turn; emit(event) gets {stage, text?, reply?, error?}; resolves when the run is open (voice: ready for audio).
// dictate: speech-to-text only (Whisper writes out what the user said; no agent turn), e.g. for replying to a Claude session
async function start(emit, text, dictate = false) {
  if (run) stop()
  let api
  const opened = new Promise((resolve, reject) => {
    connect((m, a) => {
      a.onList?.(m)
      if (m.type === 'result' && m.success === false) { emit({ stage: 'error', error: m.error?.message }); reject(new Error(m.error?.message)) }
      if (m.type !== 'event') return
      const ev = m.event
      if (ev.type === 'run-start') { if (run) run.handler = ev.data?.runner_data?.stt_binary_handler_id; resolve() }
      if (ev.type === 'stt-end') emit({ stage: 'heard', text: ev.data?.stt_output?.text ?? '' })
      if (ev.type === 'intent-end') {
        const out = ev.data?.intent_output
        conversationId = out?.conversation_id ?? conversationId
        emit({ stage: 'reply', reply: out?.response?.speech?.plain?.speech ?? '' })
      }
      if (ev.type === 'error') emit({ stage: 'error', error: ev.data?.message })
      if (ev.type === 'run-end') { emit({ stage: 'done' }); a.ws.close(); if (run?.ws === a.ws) run = null }
    }).then(async (a) => {
      api = a
      run = { ws: a.ws, handler: null }
      const pipeline = await pipelineId(a)
      a.send({ type: 'assist_pipeline/run', pipeline, conversation_id: conversationId,
        ...(text != null ? { start_stage: 'intent', end_stage: 'intent', input: { text } }
          : { start_stage: 'stt', end_stage: dictate ? 'stt' : 'intent', input: { sample_rate: 16000 } }) })
    }, reject)
  })
  await opened
  return !!api
}

// one chunk of 16 kHz 16-bit mono PCM, prefixed with the pipeline's binary handler id
function audio(chunk) {
  if (run?.handler == null || run.ws.readyState !== 1) return
  run.ws.send(Buffer.concat([Buffer.from([run.handler]), Buffer.from(chunk)]))
}

// end of speech: an empty frame with just the handler id
function stop() {
  if (run?.handler != null && run.ws.readyState === 1) run.ws.send(Buffer.from([run.handler]))
}

// Piper's spoken answer as a URL the page can play (none when the Google Mini answers instead)
async function speech(message, language) {
  const c = conf(), h = { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }
  const j = house().jarvis || {}
  // the assistant already answers on a speaker of its own (house.json jarvis.speakerSwitch on): don't speak twice
  const spk = j.speakerSwitch && await fetch(`${c.url}/api/states/${j.speakerSwitch}`, { headers: h }).then((r) => r.json()).catch(() => null)
  if (spk?.state === 'on') return null
  const r = await fetch(`${c.url}/api/tts_get_url`, { method: 'POST', headers: h, body: JSON.stringify({ engine_id: j.tts || 'tts.piper', message, language }) })
  if (!r.ok) return null
  const { url, path: p } = await r.json()
  return url || (p && c.url + p)
}

module.exports = { start, audio, stop, speech }
