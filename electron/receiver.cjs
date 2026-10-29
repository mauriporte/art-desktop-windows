// Joint Remote receiver for this PC: his other devices see what's playing here
// and use the PC like they use each other. Same protocol as Joint Remote's Receiver.kt and the Linux desktop's art-receiver:
//   POST /pair/start   shows a 6-digit code on this screen (a Windows notification)
//   POST /pair/finish  {id, name, kind, code} -> {id, name, kind, secret}; the code works once, for a minute, 3 tries
//   POST /cmd          signed: {type: now} | {type: key, key} | {type: text, text} | {type: link, url}
// Identity and paired devices are the ones the PC uses as a sender (~/.config/art-desktop/joint-remote.json), so each
// device sees one this PC whichever side paired. Announced as _jointremote._tcp (announce.ps1).
const http = require('http')
const crypto = require('crypto')
const os = require('os')
const path = require('path')
const { Notification, shell } = require('electron')
const remote = require('./remote.cjs')

const PORT = 8733, SKEW_MS = 30000
const seen = new Map() // nonce -> ms: a signed request can't be sent twice
let pairing = { code: null, until: 0, tries: 0 }

const sign = (secret, method, p, t, nonce, body) => crypto.createHmac('sha256', secret).update(`${method}\n${p}\n${t}\n${nonce}\n${body}`).digest('base64')
function verify(secret, method, p, t, nonce, body, sig, now) {
  if (Math.abs(now - t) > SKEW_MS || nonce.length < 8 || nonce.length > 64) return false
  for (const [n, at] of seen) if (now - at > 2 * SKEW_MS) seen.delete(n)
  const want = Buffer.from(sign(secret, method, p, t, nonce, body)), got = Buffer.from(String(sig))
  if (seen.has(nonce) || want.length !== got.length || !crypto.timingSafeEqual(want, got)) return false
  seen.set(nonce, now)
  return true
}
// paired by id, or (pairs made from this PC as the sender keep no id) by address
const peerFor = (peers, id, host) => Object.values(peers).find((p) => p.id && p.id === id) ?? peers[host]

// Windows virtual keys for Joint Remote's key names; Win+key ones open Windows' own panels
const VK = { up: 0x26, down: 0x28, left: 0x25, right: 0x27, center: 0x0D, back: 0xA6, volume_up: 0xAF, volume_down: 0xAE, mute: 0xAD }
const WIN = { home: 0x44 /* Win+D: the desktop */, recents: 0x09 /* Win+Tab */, notifications: 0x4E /* Win+N */ }
const MEDIA = { play_pause: 'play', next: 'next', previous: 'prev' }

function setup({ winCmd }) {
  async function nowPlaying() {
    const m = await winCmd('media')
    if (!m || m.error || !m.app) return { state: 'none' }
    const art = m.hasArt ? (await winCmd('mediaart'))?.art ?? null : null
    return { app: m.app, title: m.title, artist: m.artist, state: m.playing ? 'playing' : 'paused', position: m.position ?? 0,
      duration: m.duration ?? 0, updatedAt: m.updatedAt ?? Date.now(), art }
  }
  async function command(j) {
    if (j.type === 'now') return [200, await nowPlaying()]
    if (j.type === 'key') {
      if (MEDIA[j.key]) { const r = await winCmd(`mediactl ${MEDIA[j.key]}`); return r ? [200, { ok: true }] : [409, { error: 'nothing is playing here' }] }
      if (VK[j.key]) { await winCmd(`key ${VK[j.key]}`); return [200, { ok: true }] }
      if (WIN[j.key]) { await winCmd(`winvk ${WIN[j.key]}`); return [200, { ok: true }] }
      return [501, { error: `this device can't press ${j.key}` }]
    }
    if (j.type === 'text') { await winCmd(`type ${Buffer.from(String(j.text ?? '')).toString('base64')}`); return [200, { ok: true }] }
    if (j.type === 'link') {
      if (!/^https?:\/\//i.test(String(j.url))) return [400, { error: 'only web links' }]
      await shell.openExternal(j.url)
      return [200, { ok: true }]
    }
    return [400, { error: 'unknown command' }]
  }
  function pairStart() {
    if (Date.now() < pairing.until - 55000) return [429, { error: 'wait a moment' }] // a new code at most every 5 s
    const code = String(crypto.randomInt(1000000)).padStart(6, '0')
    pairing = { code, until: Date.now() + 60000, tries: 0 }
    new Notification({ title: 'Joint Remote pairing code', body: code, urgency: 'critical', timeoutType: 'never' }).show()
    return [200, { ok: true }]
  }
  function pairFinish(j, host) {
    if (!pairing.code || Date.now() > pairing.until) return [403, { error: 'no code on screen: start pairing again' }]
    if (String(j.code ?? '') !== pairing.code) { if (++pairing.tries >= 3) pairing.code = null; return [403, { error: 'wrong code' }] }
    pairing.code = null
    const st = remote.jrStore(), secret = crypto.randomBytes(32)
    st.peers[host] = { name: j.name || host, id: j.id, kind: j.kind || '', secret: secret.toString('base64') }
    remote.jrSave(st)
    return [200, { id: st.id, name: os.hostname(), kind: 'desktop', secret: secret.toString('base64') }]
  }

  const server = http.createServer((req, res) => {
    const reply = (status, obj) => { const b = JSON.stringify(obj); res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), Connection: 'close' }); res.end(b) }
    if (req.method !== 'POST') return reply(405, { error: 'POST only' })
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (d) => { body += d; if (body.length > 20000) { reply(413, { error: 'too big' }); req.destroy() } })
    req.on('end', async () => {
      try {
        const j = JSON.parse(body || '{}'), host = req.socket.remoteAddress.replace(/^::ffff:/, '')
        if (req.url === '/pair/start') return reply(...pairStart())
        if (req.url === '/pair/finish') return reply(...pairFinish(j, host))
        if (req.url !== '/cmd') return reply(404, { error: 'not found' })
        const peer = peerFor(remote.jrStore().peers, req.headers['x-id'] ?? '', host)
        if (!peer) return reply(401, { error: 'not paired' })
        if (!verify(Buffer.from(peer.secret, 'base64'), 'POST', '/cmd', Number(req.headers['x-time'] ?? 0), String(req.headers['x-nonce'] ?? ''), body, req.headers['x-sig'] ?? '', Date.now()))
          return reply(401, { error: 'bad signature or clock' })
        reply(...await command(j))
      } catch (e) { reply(400, { error: e.message || 'bad request' }) }
    })
  })
  server.on('error', (e) => console.error('receiver:', e.message))
  server.listen(PORT, '0.0.0.0')

  // the network announcement, for as long as the app runs (one left by a killed app is stopped first)
  try { require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | ? CommandLine -match 'announce\.ps1' | % { Stop-Process -Id $_.ProcessId -Force }"], { windowsHide: true, timeout: 15000 }) } catch {}
  const ann = require('child_process').spawn('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'announce.ps1'),
    '-Name', os.hostname(), '-Port', String(PORT), '-Id', remote.jrStore().id], { windowsHide: true })
  remote.jrSave(remote.jrStore()) // the announced id is the one pairing hands out
  return () => { server.close(); ann.kill() }
}

// quick checks, no network: electron.exe electron/receiver.cjs --selftest (ELECTRON_RUN_AS_NODE=1)
if (process.argv.includes('--selftest')) {
  const k = Buffer.alloc(32, 'k'), s = sign(k, 'POST', '/cmd', 1000, 'abcdefgh', '{}')
  console.assert(!verify(k, 'POST', '/cmd', 1000, 'abcdefgh', '{"x":1}', s, 1000), 'body changed')
  console.assert(!verify(k, 'POST', '/cmd', 1000, 'abcdefgh', '{}', s, 1000 + SKEW_MS + 1), 'stale')
  console.assert(verify(k, 'POST', '/cmd', 1000, 'abcdefgh', '{}', s, 1000), 'good')
  console.assert(!verify(k, 'POST', '/cmd', 1000, 'abcdefgh', '{}', s, 1000), 'replayed')
  const peers = { '1.1.1.1': { id: 'a' }, '2.2.2.2': {} }
  console.assert(peerFor(peers, 'a', '9.9.9.9') === peers['1.1.1.1'] && peerFor(peers, 'b', '2.2.2.2') === peers['2.2.2.2'] && !peerFor(peers, 'b', '9.9.9.9'), 'peers')
  console.log('selftest done')
}

module.exports = { setup }
