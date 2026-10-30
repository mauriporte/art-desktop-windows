const { app, BrowserWindow, screen, ipcMain, clipboard, webFrameMain, shell, Menu, nativeImage, dialog, globalShortcut } = require('electron')
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const remote = require('./remote.cjs')
const jarvis = require('./jarvis.cjs')
const claude = require('./claude.cjs')
const house = require('./house.cjs')
const grab = require('./grab.cjs')
// one copy at a time: a second one would fight the first over port 8733, the shortcut and the network announcement
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }
const receiver = require('./receiver.cjs')
const ideas = require('./ideas.cjs')
const projects = require('./projects.cjs')
ideas.setup({ house })

// Three auto-hiding glass windows: the notch (top centre of every screen), the side panel (right edge of the rightmost
// screen, like the Linux desktop's) and the dock (bottom of the main screen). Hidden, each moves fully off its edge; a tiny
// see-through window with a short orange dash stays as the hover target (acrylic windows can't be shorter than ~30 px).
const DOCK_THICK = 84, DOCK_STEP = 60 // dock depth, and the space per app icon along it
const KINDS = {
  notch: { size: () => ({ w: 720, h: 560 }), hot: () => ({ w: 120, h: 6 }) },
  // the remote panel opens only from the top-right corner of its screen: a small corner hot spot
  panel: { size: (b) => ({ w: 380, h: b.height }), hot: () => ({ w: CORNER, h: CORNER, corner: 'tr' }) },
  // the Spotify slide-in: top of the left edge of the left screen, collapses to the left like the panel
  // Spotify mirrors it: only from the top-left corner of the left screen, and it opens at the top
  spotify: { size: () => ({ w: 280, h: SPOTIFY_H }), hot: () => ({ w: CORNER, h: CORNER, corner: 'tl' }) },
  // the dock follows its screen's edge: along the edge it fits every pinned app, shrinking icons on short edges
  dock: {
    // along the edge it fits every pinned app + the 3 stacks; an open stack adds its grid beside the dock
    // always the size with a stack open: resizing a see-through window flickers, so the window stays put and its
    // shape (dockShape) shows just the strip until a stack opens
    size: (b, edge) => {
      const along = (edge === 'left' || edge === 'right' ? b.height : b.width) - 40
      const len = Math.min((dockApps().length + extraApps + stacks().length + 2) * DOCK_STEP + 80, along) // apps + open unpinned apps + stacks + trash + taskbar switch
      const thick = DOCK_THICK + STACK_GRID
      return edge === 'left' || edge === 'right' ? { w: thick, h: Math.max(len, 480), len } : { w: Math.max(len, 560), h: thick, len }
    },
    // touch the edge anywhere along it; on top only left of the notch, on the right only above the panel's tab
    hot: (b, edge) => edge === 'top' ? { w: Math.round(b.width / 2) - 90, h: 4, x: b.x }
      : edge === 'left' || edge === 'right' ? { w: 4, h: b.height - CORNER * 4, bottom: true }   // the side edge below the corners
      : { w: b.width, h: 4 },
  },
}
const STACK_GRID = 420 // room for an open stack's grid
const SPOTIFY_H = 470   // the Spotify slide-in's height
const CORNER = 12       // corner hot spots (px)
let extraApps = 0 // open apps that aren't pinned (the dock grows to fit them)
const wins = []

function bounds(kind, b, edge, expanded) {
  const s = KINDS[kind].size(b, edge, expanded), h = KINDS[kind].hot(b, edge)
  const cx = Math.round(b.x + (b.width - s.w) / 2), cy = Math.round(b.y + (b.height - s.h) / 2)
  const hx = h.x ?? Math.round(b.x + (b.width - h.w) / 2)
  const hy = h.top || h.corner ? b.y : h.bottom ? b.y + b.height - h.h : Math.round(b.y + (b.height - h.h) / 2)
  if (edge === 'top') return { s, open: { x: cx, y: b.y }, closed: { x: cx, y: b.y - s.h - 60 }, hot: { x: hx, y: b.y, width: h.w, height: h.h } }
  if (edge === 'bottom') return { s, open: { x: cx, y: b.y + b.height - s.h }, closed: { x: cx, y: b.y + b.height + 60 },
    hot: { x: hx, y: b.y + b.height - h.h, width: h.w, height: h.h } }
  if (edge === 'left') {
    const top = kind === 'spotify' ? b.y : cy   // Spotify hangs from its corner
    return { s, open: { x: b.x, y: top }, closed: { x: b.x - s.w - 60, y: top }, hot: { x: b.x, y: hy, width: h.w, height: h.h } }
  }
  return { s, open: { x: b.x + b.width - s.w, y: kind === 'panel' ? b.y : cy }, closed: { x: b.x + b.width + 60, y: kind === 'panel' ? b.y : cy },
    hot: { x: b.x + b.width - h.w, y: hy, width: h.w, height: h.h } }
}

// dock edge per screen, saved in ~/.config/art-desktop/dock.json keyed by the screen's position ("x,y");
// default: left on the leftmost screen, right on the others (top would clash with the notch)
const DOCK_CONF = path.join(require('os').homedir(), '.config', 'art-desktop', 'dock.json')
const screenKey = (d) => `${d.bounds.x},${d.bounds.y}`
function dockEdge(d, all) {
  try { const e = JSON.parse(fs.readFileSync(DOCK_CONF, 'utf8'))[screenKey(d)]; if (e) return e } catch {}
  return d.bounds.x === Math.min(...all.map((x) => x.bounds.x)) ? 'left' : 'right'
}
const SCRCPY_CSS = [
  '::-webkit-scrollbar{display:none}', 'html,body{overflow:hidden!important;background:#000}',
  '.control-buttons-list{overflow:hidden!important;justify-content:space-evenly;align-items:center;padding:.4rem 0;box-sizing:border-box;background:#000!important}',
  '.control-button{margin:0!important;flex-shrink:0;width:1.95rem!important;height:1.95rem!important;border-radius:999px;background:#1C1C1E!important;opacity:1!important;display:flex;align-items:center;justify-content:center}',
  '.control-button>svg{fill:#d8d8d8!important;width:60%;height:60%}', '.control-button:hover>svg{fill:#E8650A!important}',
  '.control-button:active{background:#E8650A!important}', '.control-button:active>svg{fill:#050505!important}',
  // the keyboard toggle is a hidden checkbox + label, not a .control-button: same look, orange while on
  '.control-wrapper>label{margin:0!important;flex-shrink:0;width:1.95rem;height:1.95rem;border-radius:999px;background:#1C1C1E;display:flex!important;align-items:center;justify-content:center;cursor:pointer}',
  '.control-wrapper>label>svg{fill:#d8d8d8!important;width:60%;height:60%}', '.control-wrapper>label:hover>svg{fill:#E8650A!important}',
  '.control-wrapper>input:checked+label{background:#E8650A}', '.control-wrapper>input:checked+label>svg{fill:#050505!important}',
].join('')

// the dock's visible, clickable part: the strip along its edge, or the whole window while a stack is open
function dockShape(w, s) {
  if (w.expanded) return [{ x: 0, y: 0, width: s.w, height: s.h }]
  // at rest only the icons' own strip (its invisible rest would sit over what's next to the dock and take its clicks);
  // the full depth just while the cursor is on it, for the magnify wave (the cursor watch sets w.wide)
  const off = Math.round((Math.max(s.w, s.h) - s.len) / 2), t = w.wide || !w.thick ? DOCK_THICK : w.thick
  return { left: [{ x: 0, y: off, width: t, height: s.len }], right: [{ x: s.w - t, y: off, width: t, height: s.len }],
    top: [{ x: off, y: 0, width: s.len, height: t }], bottom: [{ x: off, y: s.h - t, width: s.len, height: t }] }[w.edge]
}

function place(w, open) {
  w.open = open
  const p = bounds(w.kind, w.display.bounds, w.edge, w.expanded)
  w.hot.setBounds(p.hot)
  if (w.kind === 'dock') w.win.setShape(dockShape(w, p.s))
  w.win.setContentBounds({ ...(open ? p.open : p.closed), width: p.s.w, height: p.s.h })
  if (open) w.hot.hide()
  else w.hot.showInactive()
}

function createIndicator(kind, display, edge) {
  const hot = new BrowserWindow({
    ...bounds(kind, display.bounds, edge).hot,
    transparent: true, frame: false, resizable: false, skipTaskbar: true, focusable: false,
    alwaysOnTop: true, show: false, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
  })
  hot.setAlwaysOnTop(true, 'screen-saver')
  // Windows won't shrink a window below ~64 px, so the "4 px" strip is really 64 px wide: clicks pass through it and
  // the cursor watch below opens the slider when the cursor touches the hot spot's real size
  hot.setIgnoreMouseEvents(true)
  // the dot's place: the hot spot's real rectangle on screen (the window itself may be bigger, or partly off-screen)
  const r = bounds(kind, display.bounds, edge).hot
  hot.loadFile(path.join(__dirname, 'indicator.html'), { query: { edge, kind, corner: KINDS[kind].hot(display.bounds, edge).corner ?? '', r: [r.x, r.y, r.width, r.height].join(',') } })
  return hot
}

// cursor watch: a closed slider opens when the cursor is inside its hot spot (the exact few-px strip or corner)
setInterval(() => {
  if (!app.isReady()) return // the screen module only works once the app is up
  const p = screen.getCursorScreenPoint()
  for (const w of wins) {
    // an open dock: full depth once the cursor is on its icons, back to the icons' strip when it has left the full depth
    if (w.kind === 'dock' && w.open && !w.expanded && !w.win.isDestroyed()) {
      const b = w.win.getBounds(), s = bounds(w.kind, w.display.bounds, w.edge).s
      const within = (rects) => rects.some((r) => p.x >= b.x + r.x && p.x < b.x + r.x + r.width && p.y >= b.y + r.y && p.y < b.y + r.y + r.height)
      const wide = within(dockShape({ ...w, wide: w.wide }, s))
      if (wide !== !!w.wide) { w.wide = wide; w.win.setShape(dockShape(w, s)) }
    }
    if (w.open || w.hot.isDestroyed()) continue
    const r = bounds(w.kind, w.display.bounds, w.edge).hot
    if (p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height) { place(w, true); w.win.webContents.send('notch:opened') }
  }
}, 100)
// other always-on-top windows (taskbar, full-screen apps, flyouts) can end up above the dashes: put them back on top
setInterval(() => { for (const w of wins) if (!w.open && !w.hot.isDestroyed()) { w.hot.setAlwaysOnTop(true, 'screen-saver'); w.hot.moveTop() } }, 2000)

function createSlider(kind, display, edge) {
  const { s } = bounds(kind, display.bounds, edge)
  const win = new BrowserWindow({
    width: s.w,
    height: s.h,
    useContentSize: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    // the dock never takes focus (like the taskbar): the app in front stays in front, so a click can minimize it
    focusable: kind !== 'dock',
    alwaysOnTop: true,
    show: false,
    backgroundColor: '#00000000',
    // every window is fully see-through: tiles and controls float; the side panel is frosted glass while pinned
    //. Acrylic can't be switched on a live window, so pinning recreates the panel (panel:pinned)
    ...(kind === 'panel' && dockConf()._panelPinned ? { backgroundMaterial: 'acrylic' } : { transparent: true, hasShadow: false }),
    // webviewTag: HA views (the assistant, Max Headroom, Botones) in their own logged-in HA session; HA refuses iframes
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), webviewTag: true },
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  const w = { kind, win, display, edge, hot: createIndicator(kind, display, edge) }
  wins.push(w)
  place(w, false)
  // --open=<kind> starts that window expanded (for checking the layout without hovering), --tab=<name> picks a notch tab
  const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const query = { view: kind, edge, screen: screenKey(display), ...(arg('open') === kind ? { open: '1', tab: arg('tab') ?? '' } : {}) }
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query })
  win.once('ready-to-show', () => win.showInactive())
  // page errors go to ~/.config/art-desktop/app.log (a crashed see-through page just looks empty)
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') fs.appendFile(path.join(require('os').homedir(), '.config', 'art-desktop', 'app.log'),
      `${new Date().toISOString()} ${kind} ${e.level}: ${e.message}\n`, () => {})
  })
  // embedded ws-scrcpy screens (Screens tab): its device buttons restyled in the A.R.T. look (round, near-black,
  // orange when pressed), packed so the whole column fits, no scrollbars
  win.webContents.on('did-frame-finish-load', (_e, isMain, pid, rid) => {
    const f = !isMain && webFrameMain.fromId(pid, rid)
    const adb = house().adbControl, host = (u) => { try { return new URL(u).hostname } catch { return '' } }
    if (f && adb?.scrcpy && host(f.url) === host(adb.scrcpy)) f.executeJavaScript(`document.head.insertAdjacentHTML('beforeend', '<style>${SCRCPY_CSS}</style>')`).catch(() => {})
    // the VNC Control viewer (the Linux desktop): no scrollbars either
    else if (f && /vnc-control/.test(f.url)) f.executeJavaScript(`document.head.insertAdjacentHTML('beforeend', '<style>::-webkit-scrollbar{display:none}</style>')`).catch(() => {})
  })
}

ipcMain.on('panel:pinned', (e, on) => {
  const w = wins.find((x) => x.win.webContents === e.sender)
  const conf = dockConf()
  if (!w || w.kind !== 'panel' || !!conf._panelPinned === !!on) return
  conf._panelPinned = !!on
  fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1))
  w.win.destroy(); w.hot.destroy(); wins.splice(wins.indexOf(w), 1)
  createSlider('panel', w.display, w.edge)
})

// is the cursor over this notch? (page mouseleave also fires when the cursor moves onto an embedded screen)
ipcMain.handle('notch:inside', (e) => {
  const w = wins.find((x) => x.win.webContents === e.sender)
  if (!w) return false
  const p = screen.getCursorScreenPoint(), b = w.win.getBounds()
  // a dock counts only its visible part (the strip, or the whole window with a stack open)
  const parts = w.kind === 'dock' ? dockShape(w, bounds(w.kind, w.display.bounds, w.edge).s).map((r) => ({ ...r, x: b.x + r.x, y: b.y + r.y }))
    : [{ x: b.x, y: b.y, width: b.width, height: b.height }]
  return parts.some((r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height)
})

ipcMain.on('notch:open', (e, open) => {
  const w = wins.find((x) => x.win.webContents === e.sender || x.hot.webContents === e.sender)
  if (!w) return
  place(w, open)
  // opened from the dash: tell the notch page so its hover/close logic knows
  if (open && w.hot.webContents === e.sender) w.win.webContents.send('notch:opened')
})

// Wi-Fi / Bluetooth via the Windows Radio API (radios.ps1); airplane mode = every radio off
function radios(args = []) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'radios.ps1'), ...args],
      { windowsHide: true, timeout: 15000 }, (err, out) => {
        try { resolve(JSON.parse(out)) } catch { resolve({ error: String(err || out).slice(0, 200) }) }
      })
  })
}
// Remote page; each call returns {ok} or {error} so the page can flash a message
const wrap = (fn) => async (_e, ...a) => { try { return { ok: true, value: await fn(...a) } } catch (err) { return { error: err.message } } }
const dev = (name) => remote.devices().find((d) => d.name === name)
// Talk to the assistant (jarvis.cjs): a turn per press of the mic (or per typed message); events go back to that page
ipcMain.handle('jarvis:start', async (e, text, dictate) => {
  try { return { ok: await jarvis.start((ev) => !e.sender.isDestroyed() && e.sender.send('jarvis:event', ev), text, !!dictate) } }
  catch (err) { return { error: err.message } }
})
ipcMain.on('jarvis:audio', (_e, chunk) => jarvis.audio(chunk))
ipcMain.on('jarvis:stop', () => jarvis.stop())
ipcMain.handle('jarvis:speech', wrap(async (message) => {
  const sel = house().jarvis?.languageSelect
  const lang = sel ? (await remote.haStates([sel]))[sel]?.state : ''
  return jarvis.speech(message, lang === 'Español' ? 'es_ES' : 'en_US')
}))

// weather (Open-Meteo, no account): looked up here, not in the page (its network stack failed to reach it, 29/10)
ipcMain.handle('weather:get', wrap(async (city) => {
  const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(10000) }); if (!r.ok) throw new Error(`Open-Meteo ${r.status}`); return r.json() }
  const p = (await get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(city))}&count=1`)).results?.[0]
  if (!p) throw new Error('City not found')
  const w = await get(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
    '&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto')
  return { place: p.name, country: p.country_code, current: w.current, daily: w.daily }
}))
ipcMain.handle('ha:url', () => remote.haUrl())
ipcMain.handle('house:get', () => house())
ipcMain.handle('ha:states', wrap((ids) => remote.haStates(ids)))
ipcMain.handle('ha:camera', wrap((id) => remote.haCamera(id)))
// only the services the tiles use, on entities of these domains
const CALLS = { switch: ['toggle'], light: ['toggle', 'turn_off'], input_button: ['press'], input_boolean: ['toggle'], fan: ['toggle'], scene: ['turn_on'], script: ['turn_on'],
  cover: ['toggle'], lock: ['lock', 'unlock'], automation: ['trigger'], select: ['select_option'], button: ['press'],
  media_player: ['media_play_pause', 'media_next_track', 'media_previous_track', 'volume_set'] }
ipcMain.handle('ha:torrents', wrap(() => remote.haTorrents()))
ipcMain.handle('ha:music', () => remote.haMusic())
// ask HA to re-read the music player now (its Spotify integration otherwise only checks every few seconds)
ipcMain.handle('ha:musicRefresh', wrap(() => remote.haMusic() && remote.haCall('homeassistant', 'update_entity', { entity_id: remote.haMusic() })))
// the media widget: what plays on this PC (Windows' media controls) first, then my devices (Joint Remote), then HA's players
ipcMain.handle('ha:nowPlaying', wrap(() => remote.haNowPlaying()))
ipcMain.handle('ha:devicesNow', wrap(() => remote.jrNow()))
ipcMain.handle('ha:deviceKey', wrap((host, key) => remote.jrMedia(host, key)))
ipcMain.handle('ha:local', () => winCmd('media'))
ipcMain.handle('ha:localArt', () => winCmd('mediaart'))
ipcMain.handle('ha:localCtl', (_e, what) => ['play', 'next', 'prev'].includes(what) && winCmd(`mediactl ${what}`))
ipcMain.handle('ha:vnc', wrap(() => remote.vnc()))
ipcMain.handle('ha:vncAdd', wrap((fields) => remote.vncAdd(fields)))
ipcMain.handle('ha:vncRemove', wrap((name) => remote.vncRemove(name)))
// album art: HA's media player proxy only (it needs the token)
ipcMain.handle('ha:image', wrap((p) => {
  if (!String(p).startsWith('/api/media_player_proxy/')) throw new Error('Not allowed')
  return remote.haImage(p)
}))
ipcMain.handle('ha:call', wrap((domain, service, data) => {
  // "all" only to switch every light off (the dashboard's all-lights-off tile)
  const all = domain === 'light' && service === 'turn_off' && data?.entity_id === 'all'
  if (!CALLS[domain]?.includes(service) || (!all && !String(data?.entity_id).startsWith(domain + '.'))) throw new Error('Not allowed')
  return remote.haCall(domain, service, data)
}))
ipcMain.handle('remote:devices',wrap(() => remote.devices()))
ipcMain.handle('remote:press', wrap((name, k) => remote.press(dev(name), k)))
ipcMain.handle('remote:text', wrap((name, t) => remote.text(dev(name), t)))
ipcMain.handle('remote:link', wrap((name, mode) => {
  const url = clipboard.readText().match(/https?:\/\/\S+/)?.[0]
  if (!url) throw new Error('No link on the clipboard')
  return mode === 'tv' ? remote.openOnTv(dev(name), url) : remote.link(dev(name), url)
}))
ipcMain.handle('remote:pairStart', wrap((name) => remote.jrPairStart(dev(name).host)))
ipcMain.handle('remote:pairFinish', wrap((name, code) => remote.jrPairFinish(dev(name).host, code)))

// quick settings (windows.ps1): volume, mute, energy saver (power mode), night light, Windows flyouts (Win+P/K/A)
ipcMain.handle('quick:get', () => winCmd('quick'))
const QUICK = { vol: /^(0(\.\d+)?|1(\.0+)?)$/, mute: /^[01]$/, saver: /^[01]$/, night: /^[01]$/, winkey: /^[PKA]$/ }
ipcMain.handle('quick:set', (_e, op, value) => QUICK[op]?.test(String(value)) && winCmd(`${op} ${value}`))

// traffic switch: traffic.ps1 through the Windows admin prompt (UAC) every time; resolves once it has run or was declined
ipcMain.handle('traffic:set', (_e, via, wifi, lan) => new Promise((resolve) => {
  if (!['vpn', 'lan'].includes(via) || !/^[\w .()-]+$/.test(wifi) || !/^[\w .()-]+$/.test(lan)) return resolve({ error: 'bad request' })
  const args = `-NoProfile -WindowStyle Hidden -File "${path.join(__dirname, 'traffic.ps1')}" -Via ${via} -Wifi "${wifi}" -Lan "${lan}"`
  execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process powershell.exe -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList '${args.replace(/'/g, "''")}'`],
    { windowsHide: true, timeout: 120000 }, (err) => resolve(err ? { error: /cancel/i.test(String(err)) ? 'cancelled' : String(err.message).slice(0, 200) } : { ok: true }))
}))

ipcMain.handle('radios:get', () => radios())
ipcMain.handle('radios:set', (_e, kind, on) => radios([kind, on ? 'On' : 'Off']))

// right-click menus follow the page's language (EN/ES), sent with each menu request
let menuLang = 'es'
const MENU_ES = { 'Run as administrator': 'Ejecutar como administrador', 'Open file location': 'Abrir la ubicación del archivo',
  'Keep in dock': 'Mantener en el dock', 'Remove from dock': 'Quitar del dock', Dock: 'Dock', 'Close all windows': 'Cerrar todas las ventanas',
  'Close window': 'Cerrar ventana', 'Add stack…': 'Añadir pila…', 'Remove stack': 'Quitar la pila', 'Add a stack to the dock': 'Añadir una pila al dock',
  Left: 'Izquierda', Right: 'Derecha', Top: 'Arriba', Bottom: 'Abajo', 'Off on this screen': 'Sin dock en esta pantalla',
  'Icon pack': 'Pack de iconos', 'System icons': 'Iconos del sistema', 'Open icon packs folder': 'Abrir la carpeta de packs de iconos',
  'Distance from edge': 'Distancia al borde', 'Keep the dock open': 'Mantener el dock abierto', "Reserve the dock's space": 'Reservar el espacio del dock', 'Always on top': 'Siempre visible' }
const L = (s) => (menuLang === 'es' ? MENU_ES[s] ?? s : s)

// ---- dock: the taskbar's pinned apps (shortcut files), launched through the shell
const PINS = path.join(app.getPath('appData'), 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar')
function dockApps() {
  // the user's order (dragged in the dock, "_order" in dock.json); apps not in it keep Windows' order after them
  const order = dockConf()._order ?? [], rank = (a) => { const i = order.indexOf(a.name); return i < 0 ? order.length : i }
  let pinned = []
  try { pinned = fs.readdirSync(PINS).filter((f) => f.toLowerCase().endsWith('.lnk')).map((f) => ({ name: f.slice(0, -4), lnk: path.join(PINS, f) })) } catch {}
  // the dock's own pins ("Keep in dock" on an open app; Windows 11 lets no app pin to the taskbar): "_pins" in dock.json,
  // [{ name, exe }], keyed by the exe; skipped when the taskbar already has that program
  const onTaskbar = new Set(pinned.map((a) => exeOf(a.lnk)))
  const own = (dockConf()._pins ?? []).filter((p) => fs.existsSync(p.exe) && !onTaskbar.has(exeOf(p.exe))).map((p) => ({ name: p.name, lnk: p.exe, own: true }))
  return [...pinned, ...own].sort((a, b) => rank(a) - rank(b))
}
// icons as Explorer draws them (dock-icons.ps1, 128 px PNGs), cached in ~/.config/art-desktop/icon-cache;
// a shortcut changed after its cached icon gets a fresh one
const ICONS = path.join(require('os').homedir(), '.config', 'art-desktop', 'icon-cache')
const iconFile = (lnk) => path.join(ICONS, path.parse(lnk).name + '.png') // a shortcut or (own pins) an exe
ipcMain.handle('dock:apps', async () => {
  const apps = dockApps()
  const stale = apps.filter((a) => { try { return fs.statSync(iconFile(a.lnk)).mtimeMs < fs.statSync(a.lnk).mtimeMs } catch { return true } })
  if (stale.length) await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'dock-icons.ps1'), ICONS, ...stale.map((a) => a.lnk)],
    { windowsHide: true, timeout: 60000 }, res))
  return apps.map((a) => {
    let icon = packIcon(a.name)
    const fromPack = !!icon // pack icons are already Mac-style squircles: drawn full-tile
    try { icon ||= 'data:image/png;base64,' + fs.readFileSync(iconFile(a.lnk)).toString('base64') } catch {}
    return { ...a, icon, fromPack }
  })
})

// icon packs, like an Android launcher's: ~/.config/art-desktop/icon-packs/<pack>/<app>.png|.svg, matched by the
// app's name (letters and digits only, any case) or through the pack's map.json {"<app name>": "<file>"}.
// Apps the pack doesn't cover keep their system icon. The chosen pack is "_iconPack" in dock.json.
const PACKS = path.join(require('os').homedir(), '.config', 'art-desktop', 'icon-packs')
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const dockConf = () => { try { return JSON.parse(fs.readFileSync(DOCK_CONF, 'utf8')) } catch { return {} } }
const packs = () => { try { return fs.readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) } catch { return [] } }
function packIcon(appName) {
  // the chosen pack; none chosen yet = Mac Dark, the pack that ships with the app ("" = the system's own icons)
  const pack = dockConf()._iconPack ?? 'Mac Dark'
  if (!pack) return ''
  const dir = path.join(PACKS, pack)
  let file
  try { file = JSON.parse(fs.readFileSync(path.join(dir, 'map.json'), 'utf8'))[appName] } catch {}
  if (!file) {
    try { file = fs.readdirSync(dir).find((f) => /\.(png|svg)$/i.test(f) && norm(path.parse(f).name) === norm(appName)) } catch {}
  }
  if (!file) return ''
  try {
    const data = fs.readFileSync(path.join(dir, file))
    return `data:${file.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/png'};base64,${data.toString('base64')}`
  } catch { return '' }
}
ipcMain.handle('dock:order', (_e, names) => {
  if (!Array.isArray(names) || !names.every((n) => typeof n === 'string')) return
  const conf = dockConf(); conf._order = names
  fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1)); refreshDocks()
})
ipcMain.handle('dock:launch', (_e, lnk) => dockApps().some((a) => a.lnk === lnk) && shell.openPath(lnk))

// ---- running apps: windows.ps1 runs for the app's lifetime and lists / restores / minimizes / closes windows
let winHelper = null, winQueue = Promise.resolve()
function winCmd(line) {
  if (!winHelper || winHelper.exitCode !== null) {
    winHelper = require('child_process').spawn('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'windows.ps1')], { windowsHide: true })
    winHelper.stdout.setEncoding('utf8')
  }
  const h = winHelper
  // one command at a time: each answers exactly one JSON line
  return (winQueue = winQueue.then(() => new Promise((resolve) => {
    let buf = ''
    const done = (v) => { h.stdout.off('data', on); clearTimeout(t); resolve(v) }
    const on = (d) => { buf += d; const i = buf.indexOf('\n'); if (i >= 0) { try { done(JSON.parse(buf.slice(0, i))) } catch { done(null) } } }
    const t = setTimeout(() => done(null), 8000)
    h.stdout.on('data', on)
    h.stdin.write(line + '\n')
  })))
}
app.on('will-quit', () => winHelper?.kill())

// which exe a pinned shortcut starts (cached); File Explorer's windows are explorer.exe's CabinetWClass ones
const targets = new Map()
const exeOf = (lnk) => {
  if (!lnk.toLowerCase().endsWith('.lnk')) return path.basename(lnk).toLowerCase() // own pins are the exe itself
  if (!targets.has(lnk)) { let t = ''; try { t = shell.readShortcutLink(lnk).target || '' } catch {} targets.set(lnk, path.basename(t).toLowerCase()) }
  return targets.get(lnk)
}
// windows of pinned apps (by shortcut) and of every other open app (by exe: "exe:<path>", shown after the pins)
async function appWindows() {
  const list = (await winCmd('list')) || []
  const mine = path.basename(process.execPath).toLowerCase()
  const by = {}, used = new Set()
  for (const a of dockApps()) {
    const exe = exeOf(a.lnk) || (/explorer/i.test(a.name) ? 'explorer.exe' : '')
    if (!exe || exe === mine) continue
    const ws = list.filter((w) => path.basename(w.exe).toLowerCase() === exe && (exe !== 'explorer.exe' || w.cls === 'CabinetWClass'))
    if (ws.length) by[a.lnk] = ws
    ws.forEach((w) => used.add(w.hwnd))
  }
  for (const w of list) {
    const base = path.basename(w.exe).toLowerCase()
    // skip our own windows, the desktop/shell's explorer windows (folders are CabinetWClass) and windows without an exe
    if (used.has(w.hwnd) || !w.exe || base === mine || (base === 'explorer.exe' && w.cls !== 'CabinetWClass')) continue
    ;(by['exe:' + w.exe] ||= []).push(w)
  }
  return by
}
// open apps that aren't pinned: name + icon (pack icon by name, else Explorer's icon of the exe, cached)
ipcMain.handle('dock:running', async () => {
  const keys = Object.keys(await appWindows()).filter((k) => k.startsWith('exe:'))
  if (keys.length !== extraApps) { extraApps = keys.length; for (const d of wins.filter((x) => x.kind === 'dock')) place(d, d.open) }
  const fresh = keys.map((k) => k.slice(4)).filter((exe) => !fs.existsSync(path.join(ICONS, 'exe', path.parse(exe).name + '.png')))
  if (fresh.length) await new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'dock-icons.ps1'), path.join(ICONS, 'exe'), ...fresh],
    { windowsHide: true, timeout: 60000 }, res))
  return Promise.all(keys.map(async (k) => {
    const exe = k.slice(4), base = path.parse(exe).name, name = base.charAt(0).toUpperCase() + base.slice(1)
    let icon = packIcon(name)
    const fromPack = !!icon
    try { icon ||= 'data:image/png;base64,' + fs.readFileSync(path.join(ICONS, 'exe', base + '.png')).toString('base64') } catch {}
    if (!icon) icon = (await app.getFileIcon(exe, { size: 'large' }).catch(() => null))?.toDataURL() ?? '' // e.g. apps in WindowsApps
    return { key: k, name, icon, fromPack }
  }))
})
ipcMain.handle('dock:windows', async () => Object.fromEntries(Object.entries(await appWindows()).map(([k, ws]) => [k, ws.map((w) => ({ min: w.min, fg: w.fg }))])))
// what a dock key starts: a pinned shortcut, or an open app's exe
const launchable = (key) => key.startsWith('exe:') ? key.slice(4) : dockApps().some((a) => a.lnk === key) && key
// a click on an app: launch it; or minimize its window in front; or bring back its top window (restoring a minimized one)
ipcMain.handle('dock:activate', async (_e, key) => {
  const ws = (await appWindows())[key]
  if (!ws) return launchable(key) && shell.openPath(launchable(key))
  // a minimized window can still be Windows' foreground one (the dock never takes focus), so it doesn't count as in front
  const front = ws.find((w) => w.fg && !w.min)
  return winCmd(front ? `min ${front.hwnd}` : `front ${(ws.find((w) => w.fg) ?? ws[0]).hwnd}`)
})
// right-click on an app: its windows, open another, run as administrator, open file location, close; then the dock menu
ipcMain.on('dock:appMenu', async (e, lnk, lang, pinned) => {
  menuLang = lang
  { const d = wins.find((x) => x.win.webContents === e.sender); if (d) d.pinned = pinned }
  const w = wins.find((x) => x.win.webContents === e.sender)
  const base = path.parse(lnk).name
  const a = lnk.startsWith('exe:') ? { name: base.charAt(0).toUpperCase() + base.slice(1), lnk: lnk.slice(4) } : dockApps().find((x) => x.lnk === lnk)
  if (!w || !a) return
  const ws = (await appWindows())[lnk] || []
  let target = lnk.startsWith('exe:') ? lnk.slice(4) : ''
  try { target ||= shell.readShortcutLink(lnk).target } catch {}
  Menu.buildFromTemplate([
    ...ws.map((x) => ({ label: (x.min ? '◦ ' : '• ') + x.title.slice(0, 60), click: () => winCmd(`front ${x.hwnd}`) })),
    ...(ws.length ? [{ type: 'separator' }] : []),
    { label: a.name, click: () => shell.openPath(a.lnk) },
    { label: L('Run as administrator'), click: () => execFile('powershell.exe', ['-NoProfile', '-Command', `Start-Process -FilePath '${a.lnk.replace(/'/g, "''")}' -Verb RunAs`], { windowsHide: true }) },
    { label: L('Open file location'), enabled: !!target, click: () => shell.showItemInFolder(target) },
    // the dock's own pins (an open app kept in the dock; taskbar pins come and go with the taskbar)
    ...(lnk.startsWith('exe:') ? [{ label: L('Keep in dock'), click: () => setOwnPins([...(dockConf()._pins ?? []), { name: a.name, exe: a.lnk }]) }] : []),
    ...(a.own ? [{ label: L('Remove from dock'), click: () => setOwnPins((dockConf()._pins ?? []).filter((p) => p.exe !== a.lnk)) }] : []),
    ...(ws.length ? [{ type: 'separator' }, { label: L(ws.length > 1 ? 'Close all windows' : 'Close window'), click: () => ws.forEach((x) => winCmd(`close ${x.hwnd}`)) }] : []),
    { type: 'separator' },
    { label: L('Dock'), submenu: dockMenuItems(w) },
  ]).popup({ window: w.win })
})

// stacks (as on a Mac): a folder's newest files with thumbnails, or "Red" (network: the mapped network drives).
// The list is ~/.config/art-desktop/stacks.json, [{name, path} | {name, type: "network"}]; the user adds/removes from the dock.
const STACK_CONF = path.join(require('os').homedir(), '.config', 'art-desktop', 'stacks.json')
const RECYCLE = 'shell:RecycleBinFolder', NETWORK = 'shell:NetworkPlacesFolder'
function stacks() {
  try { return JSON.parse(fs.readFileSync(STACK_CONF, 'utf8')) } catch {}
  return [{ name: 'Downloads', path: app.getPath('downloads') }, { name: 'Documents', path: app.getPath('documents') },
    { name: 'Pictures', path: app.getPath('pictures') }, { name: 'Red', type: 'network' }]
}
const saveStacks = (list) => { fs.mkdirSync(path.dirname(STACK_CONF), { recursive: true }); fs.writeFileSync(STACK_CONF, JSON.stringify(list, null, 1)) }
// mapped network drives from `net use` (fast; Explorer's own Network view can take minutes to enumerate)
const netDrives = () => new Promise((res) => execFile('net', ['use'], { windowsHide: true, timeout: 8000 }, (_err, out = '') =>
  res([...out.matchAll(/^\S*\s+([A-Z]:)\s+(\\\\\S+)/gm)].map((m) => ({ name: `${m[1]} ${m[2].split('\\').pop()} (${m[2].split('\\')[2]})`, path: m[1] + '\\' })))))
const thumb = async (p) => {
  let img = await nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }).catch(() => null)
  if (!img || img.isEmpty()) img = await app.getFileIcon(p, { size: 'large' }).catch(() => null)
  return img?.toDataURL() ?? ''
}
ipcMain.handle('dock:stacks', () => stacks())
ipcMain.handle('dock:stack', async (_e, name) => {
  const s = stacks().find((x) => x.name === name)
  if (!s) return []
  if (s.type === 'network') return Promise.all((await netDrives()).map(async (d) => ({ ...d, icon: await thumb(d.path) })))
  const files = fs.readdirSync(s.path, { withFileTypes: true }).filter((f) => !f.name.startsWith('.') && f.name !== 'desktop.ini')
    .map((f) => { const p = path.join(s.path, f.name); try { return { name: f.name, path: p, t: fs.statSync(p).mtimeMs } } catch { return null } })
    .filter(Boolean).sort((a, b) => b.t - a.t).slice(0, 15)
  return Promise.all(files.map(async (f) => ({ name: f.name, path: f.path, icon: await thumb(f.path) })))
})
// opens only what the dock shows: a stack's folder or a file in it, a mapped network drive, Network, the Recycle Bin
ipcMain.handle('dock:open', async (_e, p) => {
  const dirs = stacks().filter((s) => s.path).map((s) => s.path)
  const ok = p === RECYCLE || p === NETWORK || dirs.includes(p) || dirs.includes(path.dirname(p)) || (await netDrives()).some((d) => d.path === p)
  return ok && shell.openPath(p)
})
// an open stack needs room beside the dock: grow the window away from its edge
ipcMain.on('dock:expand', (e, on) => {
  const w = wins.find((x) => x.win.webContents === e.sender)
  if (w) { w.expanded = on; place(w, true) }
})
// ---- taskbar switch (in every dock): hides the Windows taskbar completely, so the bottom edge never brings it up.
// Saved as "_hideTaskbar" in dock.json; re-applied every 15 s (Explorer shows it again when it restarts); the taskbar
// always comes back when this app quits.
const taskbar = (action) => new Promise((res) => execFile('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'taskbar.ps1'), action],
  { windowsHide: true, timeout: 15000 }, (_e, out) => { try { res(JSON.parse(out)) } catch { res(null) } }))
const hideTaskbar = () => !!dockConf()._hideTaskbar
ipcMain.handle('taskbar:get', () => hideTaskbar())
ipcMain.handle('taskbar:set', async (_e, hide) => {
  const conf = dockConf()
  conf._hideTaskbar = !!hide
  fs.mkdirSync(path.dirname(DOCK_CONF), { recursive: true })
  fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1))
  await taskbar(hide ? 'Hide' : 'Show')
  for (const d of wins) d.win.webContents.send('taskbar:changed', !!hide) // docks and the notch's tile
  return !!hide
})
// the tray: the real taskbar comes back with its hidden-icons flyout open, so
// clicks and right-clicks work as always; with the taskbar switched off it hides again once the cursor has been away
// from the bottom of the screens (and the flyout) for 3 s
let trayUntil = 0
ipcMain.handle('tray:show', async () => {
  trayUntil = Infinity
  await taskbar('Show')
  await winCmd('tray')
  const bottom = () => { const p = screen.getCursorScreenPoint(), d = screen.getDisplayNearestPoint(p).bounds; return p.y > d.y + d.height - 520 }
  let away = 0
  const t = setInterval(() => {
    away = bottom() ? 0 : away + 1
    if (away < 6) return
    clearInterval(t); trayUntil = 0
    if (hideTaskbar()) taskbar('Hide')
  }, 500)
})
setInterval(() => { if (app.isReady() && hideTaskbar() && Date.now() > trayUntil) winCmd('tbhide') }, 2000)
app.on('will-quit', () => { try { require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(__dirname, 'taskbar.ps1'), 'Show'], { windowsHide: true, timeout: 10000 }) } catch {} })

// the reserved strip belongs to the dock's indicator window, which is always there (Windows ties a reservation to a window)
// Explorer lays the taskbar out again when a reserved strip changes, which shows it: hide it again if it's switched off
const rehideTaskbar = () => { for (let ms = 200; ms <= 5000; ms += 300) setTimeout(() => { if (hideTaskbar() && Date.now() > trayUntil) winCmd('tbhide') }, ms) } // Explorer can show it seconds later
function reserveDock(w) {
  const on = dockConf()._reserve?.[screenKey(w.display)], b = w.display.bounds, k = w.display.scaleFactor
  const id = w.hot.getNativeWindowHandle().readBigInt64LE(0)
  if (!on) return winCmd(`appbaroff ${id}`).then(() => { rehideTaskbar(); setTimeout(fitOverlay, 300) })
  const t = w.thick ?? DOCK_THICK, edge = { left: 0, top: 1, right: 2, bottom: 3 }[w.edge] // what the icons really take (the page reports it)
  const r = { left: [b.x, b.y, b.x + t, b.y + b.height], top: [b.x, b.y, b.x + b.width, b.y + t],
    right: [b.x + b.width - t, b.y, b.x + b.width, b.y + b.height], bottom: [b.x, b.y + b.height - t, b.x + b.width, b.y + b.height] }[w.edge]
  // Windows moves windows out of a newly reserved strip, this dock included: put it back on its edge
  return winCmd(`appbar ${id} ${edge} ${r.map((v) => Math.round(v * k)).join(' ')}`).then(() => { rehideTaskbar(); setTimeout(() => { if (!w.win.isDestroyed()) place(w, w.open); fitOverlay() }, 300) })
}
app.on('will-quit', () => { for (const w of wins) if (w.kind === 'dock' && !w.hot.isDestroyed()) winCmd(`appbaroff ${w.hot.getNativeWindowHandle().readBigInt64LE(0)}`) })

ipcMain.on('dock:thick', (e, px) => {
  const w = wins.find((x) => x.win.webContents === e.sender)
  if (w && w.thick !== px) { w.thick = px; reserveDock(w); w.win.setShape(dockShape(w, bounds(w.kind, w.display.bounds, w.edge).s)) } // a pinned dock is out already: narrow it now
})

function setOwnPins(list) {
  const conf = dockConf(); conf._pins = list
  fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1)); refreshDocks()
}

function setPack(p) {
  const conf = dockConf()
  if (p) conf._iconPack = p
  else conf._iconPack = '' // system icons, chosen on purpose
  fs.mkdirSync(path.dirname(DOCK_CONF), { recursive: true })
  fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1))
  refreshDocks()
}

// every dock re-reads its apps/stacks and resizes (after a stack was added or removed)
function refreshDocks() {
  for (const w of wins.filter((x) => x.kind === 'dock')) { place(w, w.open); w.win.webContents.send('dock:changed') }
}

// right-click menu on a dock: add a stack / remove the stack under the cursor, move the dock to another edge of its
// screen (or off), saved per screen
// the dock's own menu items (also the "Dock" submenu of an app's right-click menu)
function dockMenuItems(w, stackName) {
  const set = (edge) => {
    let conf = {}
    try { conf = JSON.parse(fs.readFileSync(DOCK_CONF, 'utf8')) } catch {}
    conf[screenKey(w.display)] = edge
    fs.mkdirSync(path.dirname(DOCK_CONF), { recursive: true })
    fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1))
    winCmd(`appbaroff ${w.hot.getNativeWindowHandle().readBigInt64LE(0)}`).then(rehideTaskbar)
    w.win.destroy(); w.hot.destroy(); wins.splice(wins.indexOf(w), 1)
    if (edge !== 'off') { createSlider('dock', w.display, edge); setTimeout(() => reserveDock(wins[wins.length - 1]), 800) }
  }
  const label = { left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom', off: 'Off on this screen' }
  const addStack = async () => {
    const r = await dialog.showOpenDialog(w.win, { title: L('Add a stack to the dock'), properties: ['openDirectory'] })
    const p = r.filePaths?.[0], list = stacks()
    if (!r.canceled && p && !list.some((s) => s.path === p)) { list.push({ name: path.basename(p) || p, path: p }); saveStacks(list); refreshDocks() }
  }
  return [
    // reserved: Windows keeps this dock's strip free, hidden or not (maximized windows stop at its edge); per screen
    { label: L("Reserve the dock's space"), type: 'checkbox', checked: !!dockConf()._reserve?.[screenKey(w.display)], click: () => {
      const conf = dockConf(); conf._reserve = { ...conf._reserve, [screenKey(w.display)]: !conf._reserve?.[screenKey(w.display)] }
      fs.writeFileSync(DOCK_CONF, JSON.stringify(conf, null, 1)); reserveDock(w)
    } },
    // pinned: this dock stays out instead of hiding (the page keeps the pin, per dock)
    { label: L('Keep the dock open'), type: 'checkbox', checked: !!w.pinned, click: () => w.win.webContents.send('dock:pin') },
    { type: 'separator' },
    { label: L('Add stack…'), click: addStack },
    ...(stackName ? [{ label: `${L('Remove stack')} "${stackName}"`, click: () => { saveStacks(stacks().filter((s) => s.name !== stackName)); refreshDocks() } }] : []),
    { type: 'separator' },
    ...Object.keys(label).map((k) => ({ label: `${L('Dock')}: ${L(label[k])}`, type: 'radio', checked: k === w.edge, click: () => set(k) })),
    { type: 'separator' },
    { label: L('Icon pack'), submenu: [
      { label: L('System icons'), type: 'radio', checked: dockConf()._iconPack === '', click: () => setPack(null) },
      ...packs().map((p) => ({ label: p, type: 'radio', checked: (dockConf()._iconPack ?? 'Mac Dark') === p, click: () => setPack(p) })),
      { type: 'separator' },
      { label: L('Open icon packs folder'), click: () => { fs.mkdirSync(PACKS, { recursive: true }); shell.openPath(PACKS) } },
    ] },
    // how far the icons sit from the screen edge, for every dock (each page keeps it)
    { label: L('Distance from edge'), submenu: [2, 6, 12, 20].map((px) => ({ label: `${px} px`, click: () => {
      for (const d of wins.filter((x) => x.kind === 'dock')) d.win.webContents.send('dock:gap', px)
    } })) },
  ]
}
ipcMain.on('dock:menu', (e, stackName, lang, pinned) => {
  menuLang = lang
  const w = wins.find((x) => x.win.webContents === e.sender)
  if (w) w.pinned = pinned
  if (w) Menu.buildFromTemplate(dockMenuItems(w, stackName)).popup({ window: w.win })
})

// Claude tab: sessions and permission requests from Claude Code's hooks; every notch hears of changes, and the dashes
// pulse while a request waits
ipcMain.handle('claude:state', () => claude.state())
ipcMain.handle('claude:decide', (_e, id, allow) => claude.decide(String(id), !!allow))
ipcMain.handle('claude:detail', (_e, id) => claude.detail(String(id)))
// reply to a session: a one-shot Claude Code relay (named house.json's relayName) whose only tools are ListAgents and SendMessage
// sends the user's exact words to that session (live session-to-session messaging, so the Claude app shows it at once).
// No session is kept (--no-session-persistence), no user settings or MCP servers load, and it runs once: no retries.
const RELAY_DIR = path.join(require('os').homedir(), '.config', 'art-desktop', 'relay')
ipcMain.handle('claude:reply', wrap((session, text) => relay(session, text)))
// the dashboard's request tiles (e.g. a new Home Info): the same relay, to a session named in the tile
ipcMain.handle('overlay:relay', wrap((session, text) => relay(session, text)))
function relay(session, text) { return new Promise((resolve, reject) => {
  fs.mkdirSync(RELAY_DIR, { recursive: true })
  const cli = [path.join(require('os').homedir(), '.local', 'bin', 'claude.exe'), 'claude'].find((c) => c === 'claude' || fs.existsSync(c))
  const prompt = `Use SendMessage to send a message to the Claude session whose name is exactly "${session}" (find it with ListAgents ` +
    `if you need to). The message text must be exactly the text between the markers, unchanged, with nothing added:\n` +
    `<<<\n${text}\n>>>\nThen answer only "ok", or the problem in a few words.`
  execFile(cli, ['-p', prompt, '--output-format', 'json', '--tools', 'ListAgents,SendMessage', '--allowedTools', 'ListAgents', 'SendMessage',
    '--strict-mcp-config', '--setting-sources', 'project', '--no-session-persistence', '--name', house().relayName || 'Me (notch)', '--model', 'haiku'],
    { cwd: RELAY_DIR, windowsHide: true, timeout: 120000, encoding: 'utf8' }, (err, out) => {
      let j = {}
      try { j = JSON.parse(out || '{}') } catch {}
      if (j.result && !j.is_error) resolve(j.result.trim())
      else reject(new Error(String(j.subtype || err?.message || 'no answer').slice(0, 160)))
    })
}) }
function claudeChanged() {
  const st = claude.state()
  for (const w of wins) {
    if (w.kind === 'notch') w.win.webContents.send('claude:changed')
    if (w.kind === 'notch') w.hot.webContents.send('claude:pending', st.pending.length)
  }
}

// ---- desktop widgets: small see-through windows on the desktop (behind other windows unless "Always on top"), dragged
// anywhere; list and positions in ~/.config/art-desktop/widgets.json. First one: the Spotify widget
const WIDGETS = path.join(require('os').homedir(), '.config', 'art-desktop', 'widgets.json')
const readWidgets = () => { try { return JSON.parse(fs.readFileSync(WIDGETS, 'utf8')) } catch { return [] } }
const saveWidgets = (list) => { fs.mkdirSync(path.dirname(WIDGETS), { recursive: true }); fs.writeFileSync(WIDGETS, JSON.stringify(list, null, 1)) }
const widgetWins = []
function createWidget(cfg, i) {
  const win = new BrowserWindow({ x: cfg.x, y: cfg.y, width: cfg.width, height: cfg.height, frame: false, transparent: true, hasShadow: false,
    resizable: false, skipTaskbar: true, show: false, alwaysOnTop: !!cfg.onTop, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view: 'widget', type: cfg.type } })
  // on the desktop: shown behind every other window (unless "Always on top"), and sent back there when it loses focus
  const toBack = () => { if (!readWidgets()[i]?.onTop) winCmd(`bottom ${win.getNativeWindowHandle().readBigInt64LE(0)}`) }
  win.once('ready-to-show', () => { win.showInactive(); toBack() })
  win.on('blur', toBack)
  // dragged: remember where
  win.on('moved', () => { const list = readWidgets(), b = win.getBounds(); Object.assign(list[i], { x: b.x, y: b.y }); saveWidgets(list) })
  widgetWins[i] = win
}
ipcMain.on('widget:menu', (e, lang) => {
  menuLang = lang
  const i = widgetWins.findIndex((w) => w && w.webContents === e.sender)
  if (i < 0) return
  const list = readWidgets(), on = !!list[i].onTop
  Menu.buildFromTemplate([{ label: L('Always on top'), type: 'checkbox', checked: on, click: () => {
    list[i].onTop = !on; saveWidgets(list); widgetWins[i].setAlwaysOnTop(!on)
  } }]).popup({ window: widgetWins[i] })
})

// ---- clipboard history (notch Clipboard tab): the last 30 texts and pictures copied, kept in memory only (never on
// disk); what password managers mark as private (Windows' exclude-from-history formats) is skipped
const clips = []
let lastClip = ''
setInterval(() => {
  if (!app.isReady()) return
  const allowed = clipboard.readBuffer('CanIncludeInClipboardHistory') // a DWORD; 0 = keep out of history
  if (clipboard.has('ExcludeClipboardContentFromMonitorProcessing') || (allowed.length >= 4 && allowed.readUInt32LE(0) === 0)) return
  const img = clipboard.readImage(), text = clipboard.readText()
  const item = !img.isEmpty() ? { kind: 'image', data: img.toDataURL(), sig: img.toBitmap().length + ':' + img.getSize().width }
    : text.trim() ? { kind: 'text', data: text, sig: text } : null
  if (!item || item.sig === lastClip) return
  lastClip = item.sig
  const i = clips.findIndex((c) => c.sig === item.sig)
  if (i >= 0) clips.splice(i, 1)
  clips.unshift({ ...item, id: Date.now(), at: Date.now(), thumb: item.kind === 'image' ? img.resize({ width: 160 }).toDataURL() : undefined })
  clips.length = Math.min(clips.length, 30)
  for (const w of wins) if (w.kind === 'notch') w.win.webContents.send('clip:changed')
}, 1000)
ipcMain.handle('clip:list', () => clips.map(({ id, kind, data, thumb, at }) => ({ id, kind, at, text: kind === 'text' ? data : undefined, thumb })))
ipcMain.handle('clip:copy', (_e, id) => {
  const c = clips.find((x) => x.id === id)
  if (!c) return
  if (c.kind === 'text') clipboard.writeText(c.data); else clipboard.writeImage(nativeImage.createFromDataURL(c.data))
})
ipcMain.handle('clip:remove', (_e, id) => { const i = clips.findIndex((x) => x.id === id); if (i >= 0) clips.splice(i, 1) })
ipcMain.handle('clip:clear', () => { clips.length = 0 })

// ---- power (notch Power tab)
const POWER = {
  lock: ['rundll32.exe', ['user32.dll,LockWorkStation']],
  sleep: ['powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Application]::SetSuspendState("Suspend", $false, $false)']],
  signout: ['shutdown.exe', ['/l']],
  restart: ['shutdown.exe', ['/r', '/t', '0']],
  shutdown: ['shutdown.exe', ['/s', '/t', '0']],
}
ipcMain.handle('power:do', (_e, what) => { const p = POWER[what]; if (p) execFile(p[0], p[1], { windowsHide: true }) })

// ---- dashboard overlay: a see-through full-screen layer of glass HA tiles, turned on and off from the
// notch button or Ctrl+Alt+H; it opens on the screen with the cursor. Its tiles are ~/.config/art-desktop/overlay.json
// ([{ entity, name? }]), added, removed and arranged inside it.
const OVERLAY = path.join(require('os').homedir(), '.config', 'art-desktop', 'overlay.json')
let overlayWin = null
// pinned (overlay.json "pinned"): it stays open behind the other windows, like a desktop layer, and comes back when
// the app starts; unpinned it floats on top and closes when you're done
const overlayConf = () => { try { const d = JSON.parse(fs.readFileSync(OVERLAY, 'utf8')); return Array.isArray(d) ? { tiles: d } : d } catch { return { tiles: [] } } }
function pinOverlay(on) {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.setAlwaysOnTop(!on, 'floating')
  if (on) winCmd(`bottom ${overlayWin.getNativeWindowHandle().readBigInt64LE(0)}`)
}
function toggleOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) { overlayWin.close(); return }
  // the usable area, not the whole screen: a reserved dock strip would push a full-size window off the edge
  const b = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  overlayWin = new BrowserWindow({ ...b, frame: false, transparent: true, hasShadow: false, resizable: false, movable: false, skipTaskbar: true,
    alwaysOnTop: true, show: false, roundedCorners: false, thickFrame: false, backgroundColor: '#00000000',
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
  overlayWin.setAlwaysOnTop(true, 'floating')
  overlayWin.setBounds(b)
  overlayWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view: 'overlay' } })
  overlayWin.once('ready-to-show', () => { overlayWin.show(); if (overlayConf().pinned) pinOverlay(true); else overlayWin.focus() })
  overlayWin.on('blur', () => overlayConf().pinned && pinOverlay(true)) // pinned: back behind the windows after a click
}
ipcMain.on('overlay:pin', (_e, on) => { const d = overlayConf(); d.pinned = !!on; fs.writeFileSync(OVERLAY, JSON.stringify(d, null, 1)); pinOverlay(!!on) })
app.whenReady().then(() => { if (overlayConf().pinned) setTimeout(toggleOverlay, 3000) })
ipcMain.on('overlay:toggle', toggleOverlay)
// the usable area changed (a dock reserved or released its strip, or the taskbar moved): the dashboard re-fits, or its
// right edge, with the side panels' X, ends up under a reserved dock
function fitOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.setBounds(screen.getDisplayMatching(overlayWin.getBounds()).workArea)
}
app.whenReady().then(() => screen.on('display-metrics-changed', fitOverlay))
// click-through: the dashboard lets clicks pass to the windows behind, except over its own click-through button (so it
// can be switched back): the cursor is watched and the window takes clicks only while the cursor is on that button
let through = false, throughSpot = null
ipcMain.on('overlay:through', (_e, on) => { through = !!on; if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setIgnoreMouseEvents(through) })
ipcMain.on('overlay:throughSpot', (_e, r) => { throughSpot = r })
setInterval(() => {
  if (!through || !throughSpot || !overlayWin || overlayWin.isDestroyed() || !app.isReady()) return
  const p = screen.getCursorScreenPoint(), r = throughSpot
  overlayWin.setIgnoreMouseEvents(!(p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height))
}, 100)
// an imported navigation tile: that HA page in the browser (paths inside HA only)
ipcMain.on('overlay:openHa', (_e, p) => { const url = remote.haUrl(); if (url && /^\/[\w\-/?=&.]*$/.test(String(p))) shell.openExternal(url + p) })
// the voice assistant tile: the overlay closes and the notch on that screen opens its talk card
ipcMain.on('overlay:talk', () => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close()
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const w = wins.find((x) => x.kind === 'notch' && x.display.id === d.id)
  if (w) { place(w, true); w.win.webContents.send('notch:opened'); w.win.webContents.send('notch:talk') }
})
ipcMain.handle('overlay:tiles', () => overlayConf())
ipcMain.handle('overlay:save', (_e, list) => {
  // { tiles: [...], servers: [...] }; navigation tiles have no entity
  if (!Array.isArray(list?.tiles) || !list.tiles.every((x) => typeof (x?.entity ?? x?.nav) === 'string')) return
  fs.mkdirSync(path.dirname(OVERLAY), { recursive: true }); fs.writeFileSync(OVERLAY, JSON.stringify(list, null, 1))
})
ipcMain.handle('ha:entities', wrap(() => remote.haEntities()))
ipcMain.handle('ha:calendars', wrap(() => remote.haCalendars()))
ipcMain.handle('projects:list', wrap(() => projects.list()))
ipcMain.handle('ha:todoItems', wrap((e) => { if (!/^todo\.\w+$/.test(e)) throw new Error('Not allowed'); return remote.haTodoItems(e) }))
ipcMain.handle('ha:todoDone', wrap((e, uid) => { if (!/^todo\.\w+$/.test(e)) throw new Error('Not allowed'); return remote.haTodoDone(e, String(uid)) }))
ipcMain.handle('ha:notifications', wrap(() => remote.haNotifications()))
// a folder of the notes vault as a tree (the dashboard's notes tile): folders and Markdown notes, nothing outside the vault
ipcMain.handle('notes:tree', wrap((folder) => {
  const vault = house().ideas?.vault
  if (!vault) throw new Error('No vault in house.json (ideas.vault)')
  const root = path.resolve(vault, String(folder))
  if (!root.startsWith(path.resolve(vault))) throw new Error('Not allowed')
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter((f) => !f.name.startsWith('.'))
    .map((f) => f.isDirectory() ? { name: f.name, path: path.join(dir, f.name), children: walk(path.join(dir, f.name)) }
      : f.name.endsWith('.md') ? { name: f.name.slice(0, -3), path: path.join(dir, f.name) } : null)
    .filter(Boolean).sort((a, b) => (!!b.children - !!a.children) || a.name.localeCompare(b.name))
  return walk(root)
}))
ipcMain.on('notes:open', (_e, p) => { const v = house().ideas?.vault; if (v && path.resolve(String(p)).startsWith(path.resolve(v))) shell.openExternal(`obsidian://open?path=${encodeURIComponent(p)}`) })
ipcMain.handle('ha:dismiss', wrap((id) => remote.haDismiss(String(id))))
ipcMain.handle('ha:events', wrap((ids, start, end) => remote.haEvents(ids, start, end)))
// link tiles: a web address (http/https only), or one of the dock's apps by name (e.g. the mail client)
ipcMain.on('overlay:openUrl', (_e, url) => { if (/^(https?:\/\/|obsidian:\/\/open\?)/i.test(String(url))) shell.openExternal(url) }) // web pages, or an Obsidian note
ipcMain.on('overlay:openApp', (_e, name) => { const a = dockApps().find((x) => x.name === name); if (a) shell.openPath(a.lnk) })
app.whenReady().then(() => globalShortcut.register('Control+Alt+H', toggleOverlay))
app.on('will-quit', () => globalShortcut.unregisterAll())

// screen grabber (grab.cjs): our sliders hide while the screens are captured
grab.setup({
  loadPage: (win, view) => win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query: { view } }),
  hideNotch: () => {
    const shown = wins.flatMap((w) => [w.win, w.hot]).filter((x) => x.isVisible())
    shown.forEach((x) => x.hide())
    return () => shown.forEach((x) => !x.isDestroyed() && x.showInactive())
  },
  windowRects: () => winCmd('rects').then((r) => r || []),
})

app.whenReady().then(() => {
  claude.start(claudeChanged)
  // the PC as a Joint Remote receiver (receiver.cjs): port 8733, announced on the network
  app.on('will-quit', receiver.setup({ winCmd }))
  readWidgets().forEach(createWidget)
  const all = screen.getAllDisplays()
  all.forEach((d) => createSlider('notch', d, 'top'))
  createSlider('panel', all.reduce((r, d) => (d.bounds.x + d.bounds.width > r.bounds.x + r.bounds.width ? d : r)), 'right')
  all.forEach((d) => { const e = dockEdge(d, all); if (e !== 'off') createSlider('dock', d, e) })
  setTimeout(() => wins.filter((w) => w.kind === 'dock').forEach(reserveDock), 1500) // once the windows exist
  createSlider('spotify', all.reduce((r, d) => (d.bounds.x < r.bounds.x ? d : r)), 'left')
  taskbar(hideTaskbar() ? 'Hide' : 'Show') // Show also clears a see-through taskbar left by a killed app
})
app.on('window-all-closed', () => app.quit())
