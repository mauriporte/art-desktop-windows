// Screen grabber. Every screen is captured first, then shown frozen in a full-screen
// overlay per screen: drag = a region, click = the window under the cursor, Enter / double-click = the whole screen,
// Esc = cancel. The cut goes to an editor (arrow, box, text, blur, highlight; copy / save / pin), and a pin is a small
// always-on-top window with the picture.
const { BrowserWindow, desktopCapturer, screen, clipboard, nativeImage, ipcMain, app, shell } = require('electron')
const fs = require('fs')
const path = require('path')

let shots = [] // [{ display, image, win }] while selecting
let mode = 'grab' // 'grab' = the editor afterwards, 'ask' = Circle to Ask
let page = () => {} // (win, view, query) -> loads dist/index.html with ?view=
let rectsOf = async () => []

function closeOverlays() { for (const s of shots) if (!s.win.isDestroyed()) s.win.destroy(); shots = [] }

async function start(hideNotch, how = 'grab') {
  if (shots.length) return
  mode = how
  const restore = hideNotch() // our windows step aside for the capture and come back right after
  await new Promise((r) => setTimeout(r, 250))
  const displays = screen.getAllDisplays()
  const size = displays.reduce((m, d) => ({ width: Math.max(m.width, d.bounds.width * d.scaleFactor), height: Math.max(m.height, d.bounds.height * d.scaleFactor) }), { width: 0, height: 0 })
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size }).finally(restore)
  const own = new Set(app.getAppMetrics().map((m) => m.pid))
  const rects = (await rectsOf()).filter((r) => !own.has(r.pid))
  shots = displays.map((d) => {
    const image = (sources.find((s) => s.display_id === String(d.id)) ?? sources[displays.indexOf(d)])?.thumbnail
    const b = d.bounds
    const win = new BrowserWindow({ x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false,
      skipTaskbar: true, alwaysOnTop: true, show: false, hasShadow: false, roundedCorners: false, thickFrame: false, backgroundColor: '#000000',
      webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
    win.setAlwaysOnTop(true, 'screen-saver', 2)
    win.setBounds(b)
    // the windows on this screen, in its own coordinates, front to back
    const mine = rects.filter((r) => r.x < b.x + b.width && r.x + r.w > b.x && r.y < b.y + b.height && r.y + r.h > b.y)
      .map((r) => ({ x: r.x - b.x, y: r.y - b.y, w: r.w, h: r.h, title: r.title }))
    win.grab = { image: image?.toDataURL() ?? '', rects: mine, scale: d.scaleFactor, mode }
    page(win, 'grab-select')
    win.once('ready-to-show', () => { win.show(); win.focus() })
    return { display: d, image, win }
  })
}

// the editor: the cut picture with its tools, sized to the picture (at most most of the screen), on that screen
function openEditor(img, display) {
  const wa = display.workArea, s = img.getSize()
  const w = Math.min(Math.max(s.width + 40, 640), wa.width - 80), h = Math.min(s.height + 120, wa.height - 80)
  const win = new BrowserWindow({ x: Math.round(wa.x + (wa.width - w) / 2), y: Math.round(wa.y + (wa.height - h) / 2), width: w, height: h,
    frame: false, backgroundColor: '#050505', show: false, title: 'A.R.T. Grab', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
  win.grab = { image: img.toDataURL() }
  page(win, 'grab-edit')
  win.once('ready-to-show', () => { win.show(); win.focus() })
}

const ASK_DIR = path.join(require('os').homedir(), '.config', 'art-desktop', 'ask')
function askClaude(png, question, signal) {
  fs.mkdirSync(ASK_DIR, { recursive: true })
  const file = path.join(ASK_DIR, 'circled.png')
  fs.writeFileSync(file, png)
  const cli = [path.join(require('os').homedir(), '.local', 'bin', 'claude.exe'), 'claude'].find((c) => c === 'claude' || fs.existsSync(c))
  const prompt = `Read the image file circled.png in the current folder (a part of my screen I circled), then answer my question about it. ` +
    `Answer directly, in my question's language, without mentioning the file.
Question: ${question}`
  return new Promise((resolve, reject) => {
    const p = require('child_process').execFile(cli, ['-p', prompt, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read',
      '--strict-mcp-config', '--setting-sources', 'project', '--no-session-persistence', '--model', 'sonnet'],
      { cwd: ASK_DIR, windowsHide: true, timeout: 180000, encoding: 'utf8' }, (err, out) => {
        fs.rm(file, { force: true }, () => {}) // the screen picture doesn't stay on disk
        let j = {}
        try { j = JSON.parse(out || '{}') } catch {}
        if (j.result && !j.is_error) resolve(j.result.trim())
        else reject(new Error(signal.aborted ? 'stopped' : String(j.result || j.subtype || err?.message || 'no answer').slice(0, 200)))
      })
    signal.addEventListener('abort', () => p.kill())
  })
}

// Circle to Ask: the circled part and a question for the local Ollama vision model; the answer streams in
function openAsk(img, display) {
  const wa = display.workArea, w = 460, h = 560
  const win = new BrowserWindow({ x: wa.x + wa.width - w - 40, y: wa.y + 40, width: w, height: h, frame: false, alwaysOnTop: true,
    backgroundColor: '#050505', show: false, title: 'A.R.T. Ask', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
  win.grab = { image: img.toDataURL() }
  page(win, 'grab-ask')
  win.once('ready-to-show', () => { win.show(); win.focus() })
}

function pin(dataUrl, near) {
  const img = nativeImage.createFromDataURL(dataUrl), s = img.getSize()
  const d = screen.getDisplayNearestPoint(near ?? screen.getCursorScreenPoint()).workArea
  const k = Math.min(1, (d.width * 0.5) / s.width, (d.height * 0.5) / s.height)
  const win = new BrowserWindow({ width: Math.round(s.width * k), height: Math.round(s.height * k), x: d.x + 40, y: d.y + 40, frame: false,
    alwaysOnTop: true, skipTaskbar: true, resizable: true, maximizable: false, hasShadow: true, backgroundColor: '#050505', webPreferences: { preload: path.join(__dirname, 'preload.cjs') } })
  win.setAspectRatio(s.width / s.height)
  win.grab = { image: dataUrl }
  page(win, 'grab-pin')
}

function setup({ loadPage, hideNotch, windowRects }) {
  page = loadPage
  rectsOf = windowRects
  ipcMain.handle('grab:start', (_e, how) => start(hideNotch, how === 'ask' ? 'ask' : 'grab'))
  ipcMain.handle('grab:data', (e) => BrowserWindow.fromWebContents(e.sender)?.grab ?? null)
  // a choice on one screen's overlay: {x, y, w, h} in that screen's points (null = cancel)
  ipcMain.handle('grab:pick', (e, r) => {
    const s = shots.find((x) => x.win.webContents === e.sender)
    const all = shots
    shots = []
    for (const x of all) x.win.destroy()
    if (!s || !r || !s.image) return
    const k = s.display.scaleFactor
    const cut = s.image.crop({ x: Math.round(r.x * k), y: Math.round(r.y * k), width: Math.max(1, Math.round(r.w * k)), height: Math.max(1, Math.round(r.h * k)) })
    if (mode === 'ask') openAsk(cut, s.display); else openEditor(cut, s.display)
  })
  ipcMain.handle('grab:copy', (_e, url) => { clipboard.writeImage(nativeImage.createFromDataURL(url)); return true })
  ipcMain.handle('grab:save', (_e, url) => {
    const dir = path.join(app.getPath('pictures'), 'Screenshots')
    fs.mkdirSync(dir, { recursive: true })
    const p = path.join(dir, `ART ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.')}.png`)
    fs.writeFileSync(p, nativeImage.createFromDataURL(url).toPNG())
    shell.showItemInFolder(p)
    return p
  })
  ipcMain.handle('grab:pin', (e, url) => { const b = BrowserWindow.fromWebContents(e.sender)?.getBounds(); pin(url, b && { x: b.x, y: b.y }) })
  // ask the local Ollama about the picture: answer pieces go back as 'ask:chunk' events, then 'ask:done'
  const asks = new Map() // sender id -> AbortController
  ipcMain.handle('ask:run', async (e, image, question, model) => {
    if (!['qwen3.5:4b', 'huihui_ai/qwen3.5-abliterated:9b', 'claude', 'gemini'].includes(model)) return { error: 'unknown model' }
    asks.get(e.sender.id)?.abort()
    const stop = new AbortController(); asks.set(e.sender.id, stop)
    const png = Buffer.from(String(image).replace(/^data:image\/\w+;base64,/, ''), 'base64')
    const say = (text) => !e.sender.isDestroyed() && e.sender.send('ask:chunk', text)
    try {
      // Gemini: HA's Google AI Task (the whole answer at once)
      if (model === 'gemini') { say(await require('./remote.cjs').haAskImage(png, String(question).slice(0, 2000))); return { ok: true } }
      // Claude: the Claude Code CLI reading the picture from a scratch folder; no user
      // settings, hooks or MCP servers load, it only may Read, and no session is kept
      if (model === 'claude') { say(await askClaude(png, String(question).slice(0, 2000), stop.signal)); return { ok: true } }
      const r = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST', signal: stop.signal, body: JSON.stringify({ model, stream: true, think: false,
        messages: [{ role: 'user', content: String(question).slice(0, 2000), images: [String(image).replace(/^data:image\/\w+;base64,/, '')] }] }) })
      if (!r.ok) return { error: `Ollama ${r.status}: ${(await r.text()).slice(0, 200)}` }
      let buf = ''
      for await (const chunk of r.body) {
        buf += Buffer.from(chunk).toString('utf8')
        let i
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 1)
          if (!line.trim()) continue
          const j = JSON.parse(line)
          if (j.message?.content && !e.sender.isDestroyed()) e.sender.send('ask:chunk', j.message.content)
        }
      }
      return { ok: true }
    } catch (err) { return { error: stop.signal.aborted ? 'stopped' : /fetch failed|ECONNREFUSED/.test(String(err.cause ?? err)) ? 'Ollama is not running on this PC' : err.message } }
    finally { if (asks.get(e.sender.id) === stop) asks.delete(e.sender.id) }
  })
  ipcMain.on('ask:stop', (e) => asks.get(e.sender.id)?.abort())
  ipcMain.on('grab:close', (e) => BrowserWindow.fromWebContents(e.sender)?.close())
}

module.exports = { setup, closeOverlays }
