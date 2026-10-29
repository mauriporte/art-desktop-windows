import { load } from './slider.js'

// The microphone as 16 kHz 16-bit mono PCM chunks (what HA's Whisper pipeline takes), with the input picked and the
// boost set on the the assistant talk card (micId / micBoost). Returns stop().
export async function startMic(onChunk, onLevel = () => {}) {
  const deviceId = load('micId', ''), boost = () => Number(load('micBoost', 3))
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true,
    autoGainControl: true, ...(deviceId ? { deviceId: { exact: deviceId } } : {}) } })
  const ctx = new AudioContext({ sampleRate: 16000 })
  const src = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(2048, 1, 1)
  proc.onaudioprocess = (e) => {
    const f = e.inputBuffer.getChannelData(0), pcm = new Int16Array(f.length), g = boost()
    let sum = 0
    for (let i = 0; i < f.length; i++) { const v = Math.max(-1, Math.min(1, f[i] * g)); pcm[i] = v * 0x7fff; sum += v * v }
    onLevel(Math.min(1, Math.sqrt(sum / f.length) * 4))
    onChunk(pcm.buffer)
  }
  src.connect(proc); proc.connect(ctx.destination)
  return () => { proc.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); ctx.close(); onLevel(0) }
}
