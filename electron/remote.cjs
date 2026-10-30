// Remote page backend: HA remotes (Android TV, IR) and Joint Remote peers.
// Port of art-linux-desktop/panel/art-panel; config lives in ~/.config/art-desktop like on Linux
// (not %APPDATA%: writes there are sandboxed when started from the Claude app).
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const house = require('./house.cjs')

const DIR = path.join(os.homedir(), '.config', 'art-desktop')
const HA_CONF = path.join(DIR, 'ha.json') // {"url": "...", "token": "...", "music": "media_player.spotify"}
const REMOTES = path.join(DIR, 'remotes.json') // [{"name","type":"atv|ir|jr","entity","device","host","commands":[[label,cmd]]}]
const JR_STORE = path.join(DIR, 'joint-remote.json')
const JR_PORT = 8733

// Android TV key names for HA's remote.send_command (androidtv_remote integration)
const REMOTE_KEYS = { up: 'DPAD_UP', down: 'DPAD_DOWN', left: 'DPAD_LEFT', right: 'DPAD_RIGHT', ok: 'DPAD_CENTER',
  back: 'BACK', home: 'HOME', play: 'MEDIA_PLAY_PAUSE', vol_down: 'VOLUME_DOWN', mute: 'VOLUME_MUTE', vol_up: 'VOLUME_UP',
  next: 'MEDIA_NEXT', previous: 'MEDIA_PREVIOUS' }
// Joint Remote key names (its Receiver), for the same buttons
const JR_KEYS = { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'center', back: 'back', home: 'home',
  play: 'play_pause', vol_down: 'volume_down', mute: 'mute', vol_up: 'volume_up', recents: 'recents', next: 'next',
  previous: 'previous' }

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeSecret = (f, obj) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(obj), { mode: 0o600 }) }

function ha() {
  const c = readJson(HA_CONF, {})
  return { url: (c.url || '').replace(/\/$/, ''), token: c.token || '', music: c.music || '', ok: !!(c.url && c.token) }
}

async function haCall(domain, service, data) {
  const h = ha()
  if (!h.ok) throw new Error('No HA token yet')
  const r = await fetch(`${h.url}/api/services/${domain}/${service}`, { method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!r.ok) throw new Error(`HA ${r.status}`)
}

function devices() {
  const ok = ha().ok
  return readJson(REMOTES, []).filter((d) => d.type === 'jr' || ok)
    .map((d) => ({ ...d, paired: !!(d.host && jrStore().peers[d.host]) }))
}

// ---- Joint Remote client (protocol: joint-remote Receiver.kt / Auth.kt)
function jrSign(secret, method, p, t, nonce, body) {
  return crypto.createHmac('sha256', secret).update(`${method}\n${p}\n${t}\n${nonce}\n${body}`).digest('base64')
}

function jrStore() {
  const st = readJson(JR_STORE, {})
  if (!st.id) st.id = crypto.randomBytes(9).toString('base64url')
  st.peers ??= {}
  return st
}

async function jrPost(host, p, body, headers = {}, ms = 6000) {
  const r = await fetch(`http://${host}:${JR_PORT}${p}`, { method: 'POST', body, signal: AbortSignal.timeout(ms),
    headers: { 'Content-Type': 'application/json', ...headers } })
  if (!r.ok) throw new Error(`Joint Remote ${r.status}`)
  const t = await r.text()
  return t ? JSON.parse(t) : {}
}

const jrPairStart = (host) => jrPost(host, '/pair/start', '{}')

async function jrPairFinish(host, code) {
  const st = jrStore()
  const j = await jrPost(host, '/pair/finish', JSON.stringify({ id: st.id, name: os.hostname(), kind: 'desktop', code: code.trim() }))
  st.peers[host] = { name: j.name || host, secret: j.secret }
  writeSecret(JR_STORE, st)
}

async function jrSend(host, cmd, ms) {
  const st = jrStore()
  const peer = st.peers[host]
  if (!peer) throw new Error('not paired')
  const body = JSON.stringify(cmd), t = Date.now(), nonce = crypto.randomBytes(9).toString('base64url')
  const sig = jrSign(Buffer.from(peer.secret, 'base64'), 'POST', '/cmd', t, nonce, body)
  return jrPost(host, '/cmd', body, { 'x-id': st.id, 'x-time': String(t), 'x-nonce': nonce, 'x-sig': sig }, ms)
}

// what each paired device is playing (Joint Remote's {"type":"now"}: phones, tablet, TV, watch, the Linux desktop), asked in
// parallel; a device that doesn't answer is left alone for a while, so polling never piles up on one that's off
const jrQuiet = {}
async function jrNow() {
  const peers = jrStore().peers
  const list = devices().filter((d) => d.host && peers[d.host] && !(jrQuiet[d.host] > Date.now()))
  const got = await Promise.all(list.map((d) => jrSend(d.host, { type: 'now' }, 2500)
    .then((n) => ({ device: d.name, host: d.host, ...n }), () => { jrQuiet[d.host] = Date.now() + 30000 })))
  return got.filter((n) => n && n.state && n.state !== 'none')
}
// play_pause / next / previous on a paired device's player
const jrMedia = (host, key) => jrStore().peers[host] && ['play_pause', 'next', 'previous'].includes(key) ? jrSend(host, { type: 'key', key }) : Promise.reject(new Error('Not allowed'))

// press(k): k is a button name, or a raw learned command for IR devices
function press(d, k) {
  if (d.type === 'atv') return haCall('remote', 'send_command', { entity_id: d.entity, command: REMOTE_KEYS[k] })
  if (d.type === 'ir') return haCall('remote', 'send_command', { entity_id: d.entity, command: k, ...(d.device ? { device: d.device } : {}) })
  return jrSend(d.host, { type: 'key', key: JR_KEYS[k] })
}

const text = (d, t) => jrSend(d.host, { type: 'text', text: t })
const link = (d, url) => jrSend(d.host, { type: 'link', url })
const openOnTv = (d, url) => haCall('remote', 'turn_on', { entity_id: d.entity, activity: url })

const haUrl = () => ha().url // address only, never the token

async function haGet(p) {
  const h = ha()
  if (!h.ok) throw new Error('No HA token yet')
  const r = await fetch(h.url + p, { headers: { Authorization: `Bearer ${h.token}` }, signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`HA ${r.status}`)
  return r
}

// states of the notch's HA tiles; only what the tiles draw goes to the page
// qBittorrent's active torrents through HA's integration: [{ name, percent_done, status, eta, ... }]
async function haTorrents() {
  const h = ha()
  if (!h.ok) throw new Error('No HA token yet')
  const r = await fetch(`${h.url}/api/services/qbittorrent/get_all_torrents?return_response`, { method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ torrent_filter: 'active' }) })
  if (!r.ok) throw new Error(`HA ${r.status}`)
  const all = (await r.json()).service_response?.all_torrents ?? {}
  return Object.values(all).flatMap((ts) => Object.entries(ts).map(([name, x]) => ({ ...x, name })))
}

// what the dashboard overlay can show: every entity of the domains its tiles handle, for its "add a tile" search
const OVERLAY_DOMAINS = ['light', 'switch', 'input_boolean', 'fan', 'scene', 'script', 'button', 'sensor', 'binary_sensor', 'cover', 'lock', 'climate']
async function haEntities() {
  const all = await (await haGet('/api/states')).json()
  return all.filter((s) => OVERLAY_DOMAINS.includes(s.entity_id.split('.')[0]))
    .map((s) => ({ id: s.entity_id, name: s.attributes.friendly_name || s.entity_id })).sort((a, b) => a.name.localeCompare(b.name))
}

// calendars (the overlay's calendar tile): HA's list, and each chosen calendar's events between two times
async function haCalendars() { return (await haGet('/api/calendars')).json() }
async function haEvents(ids, start, end) {
  const lists = await Promise.all(ids.filter((id) => /^calendar\.[\w]+$/.test(id)).map(async (id) =>
    ((await (await haGet(`/api/calendars/${id}?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)).json()) ?? []).map((e) => ({ ...e, calendar: id }))))
  return lists.flat()
}

// to-do lists and notifications (the dashboard's Listas / Notificaciones panels)
async function haTodoItems(entity) {
  const h = ha()
  if (!h.ok) throw new Error('No HA token yet')
  const r = await fetch(`${h.url}/api/services/todo/get_items?return_response`, { method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${h.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ entity_id: entity, status: 'needs_action' }) })
  if (!r.ok) throw new Error(`HA ${r.status}`)
  return (await r.json()).service_response?.[entity]?.items ?? []
}
const haTodoDone = (entity, uid) => haCall('todo', 'update_item', { entity_id: entity, item: uid, status: 'completed' })
const haNotifications = () => haWs({ type: 'persistent_notification/get' })
const haDismiss = (id) => haCall('persistent_notification', 'dismiss', { notification_id: id })

async function haStates(ids) {
  const all = await (await haGet('/api/states')).json()
  const want = new Set(ids)
  return Object.fromEntries(all.filter((s) => want.has(s.entity_id)).map((s) => [s.entity_id, tile(s)]))
}
const tile = (s) => ({
    state: s.state, last_changed: s.last_changed, name: s.attributes.friendly_name, unit: s.attributes.unit_of_measurement,
    options: s.attributes.options, picture: s.attributes.entity_picture, last_answer_by: s.attributes.last_answer_by,
    title: s.attributes.media_title, artist: s.attributes.media_artist, volume: s.attributes.volume_level,
    album: s.attributes.media_album_name, position: s.attributes.media_position, duration: s.attributes.media_duration,
    positionAt: s.attributes.media_position_updated_at, group: Array.isArray(s.attributes.entity_id) || undefined })

// the house's player in use, for the media widget's "remote" side: playing, else paused (the music one first in each),
// else a TV that is on with an app open (the Android TV remote can't tell playing from paused), else the music one
async function haNowPlaying() {
  const all = (await (await haGet('/api/states')).json()).filter((s) => s.entity_id.startsWith('media_player.'))
  const music = all.find((s) => s.entity_id === haMusic())
  const list = [music, ...all].filter(Boolean)
  const s = list.find((x) => x.state === 'playing') || list.find((x) => x.state === 'paused')
    || list.find((x) => x.state === 'on' && x.attributes.app_name) || music
  // volume only where the player can set it (feature bit 4)
  return s ? { id: s.entity_id, ...tile(s), app: s.attributes.app_name, volume: s.attributes.supported_features & 4 ? s.attributes.volume_level : undefined } : null
}

// HA pictures as data URLs (camera_proxy / media_player_proxy need the token, so they can't be an <img src>)
async function haImage(p) {
  const r = await haGet(p)
  return `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`
}
const haCamera = (id) => haImage(`/api/camera_proxy/${id}`)

// one request over HA's WebSocket API (for what REST doesn't offer, e.g. dashboard configs)
function haWs(msg) {
  const h = ha()
  if (!h.ok) return Promise.reject(new Error('No HA token yet'))
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(h.url.replace(/^http/, 'ws') + '/api/websocket')
    const t = setTimeout(() => { ws.close(); reject(new Error('HA timeout')) }, 10000)
    ws.onerror = () => { clearTimeout(t); reject(new Error('HA not reachable')) }
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.type === 'auth_required') ws.send(JSON.stringify({ type: 'auth', access_token: h.token }))
      else if (m.type === 'auth_ok') ws.send(JSON.stringify({ id: 1, ...msg }))
      else if (m.id === 1) { clearTimeout(t); ws.close(); m.success ? resolve(m.result) : reject(new Error(m.error?.message)) }
    }
  })
}

// VNC Control (house.json "vnc"): the viewer an HA dashboard view embeds (its address can carry a private key, so it
// is read from HA each time, never stored here), and whether the machine serving it is up
async function vnc() {
  const v = house().vnc
  if (!v) throw new Error('No VNC set up (house.json)')
  const cfg = await haWs({ type: 'lovelace/config', url_path: v.dashboard })
  const view = cfg.views.find((x) => x.path === v.view)
  let url = ''
  JSON.stringify(view, (k, x) => { if (k === 'url' && typeof x === 'string' && /vnc/i.test(x)) url ||= x; return x })
  const s = v.upSensor ? (await haStates([v.upSensor]))[v.upSensor]?.state : 'up'
  return { url, up: s === 'up' || s === 'on', host: v.host }
}
const haMusic = () => ha().music

// HA's VNC connector: fill its helpers, then run its own add / remove script (the same as the view's "Conectar otro VNC")
async function vncAdd({ name, ip, port, password, resolution }) {
  const { helpers: h, addScript } = house().vnc
  const set = (id, value) => id && haCall(id.split('.')[0], 'set_value', { entity_id: id, value })
  await set(h.name, name)
  await set(h.ip, ip)
  await set(h.port, Number(port) || 5900)
  await set(h.password, password || '')
  await set(h.resolution, resolution || '')
  await haCall('script', addScript, {})
}
async function vncRemove(name) {
  const { helpers: h, removeScript } = house().vnc
  await haCall('input_text', 'set_value', { entity_id: h.name, value: name })
  await haCall('script', removeScript, {})
}

const jrSave = (st) => writeSecret(JR_STORE, st)

// Circle to Ask through HA's Google AI Task (Gemini, set up in HA): the picture goes up to HA's local media for the
// question and is removed again right after
async function haAskImage(png, question) {
  const h = ha()
  if (!h.ok) throw new Error('No HA token yet')
  const auth = { Authorization: `Bearer ${h.token}` }
  const form = new FormData()
  form.append('media_content_id', 'media-source://media_source/local/.')
  form.append('file', new Blob([png], { type: 'image/png' }), `art-ask-${Date.now()}.png`)
  const up = await fetch(`${h.url}/api/media_source/local_source/upload`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(20000) })
  if (!up.ok) throw new Error(`HA upload ${up.status}`)
  const id = (await up.json()).media_content_id
  try {
    const r = await fetch(`${h.url}/api/services/ai_task/generate_data?return_response`, { method: 'POST', signal: AbortSignal.timeout(90000),
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: 'A.R.T. Circle to Ask', entity_id: 'ai_task.google_ai_task', instructions: question,
        attachments: [{ media_content_id: id, media_content_type: 'image/png' }] }) })
    if (!r.ok) throw new Error(`HA ${r.status}: ${(await r.text()).slice(0, 160)}`)
    return String((await r.json()).service_response?.data ?? '')
  } finally { haWs({ type: 'media_source/local_source/remove', media_content_id: id }).catch(() => {}) }
}

module.exports = { haTodoItems, haTodoDone, haNotifications, haDismiss, haCalendars, haEvents, haEntities, haAskImage, jrStore, jrSave, haUrl, haStates, haTorrents, haNowPlaying, jrNow, jrMedia, haCamera, haImage, haMusic, haCall, vnc, vncAdd, vncRemove, devices, press, text, link, openOnTv, jrPairStart, jrPairFinish, jrSign, REMOTE_KEYS, JR_KEYS }
