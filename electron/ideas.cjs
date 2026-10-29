// Ideas Browser (notch Ideas tab): the Insta-Ideas notes in the Obsidian vault (house.json "ideas": { vault, folder }),
// read straight from their front matter. Notes with a place (a Google Maps search link in the note, or "where") get a
// point on the map: looked up once on OpenStreetMap's Nominatim (free, 1 request a second as its rules ask) and kept in
// ~/.config/art-desktop/geocode.json, so later opens are instant.
const fs = require('fs')
const path = require('path')
const os = require('os')
const { ipcMain, shell } = require('electron')

const GEO = path.join(os.homedir(), '.config', 'art-desktop', 'geocode.json')
const val = (v) => { v = v.trim(); try { return v.startsWith('"') || v.startsWith('[') ? JSON.parse(v) : v } catch { return v } }

function readNotes(dir) {
  const out = []
  const walk = (p, top) => {
    for (const f of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, f.name)
      if (f.isDirectory()) walk(q, false)
      else if (!top && f.name.endsWith('.md')) { // the index notes sit at the top of the folder; ideas are in subfolders
        const t = fs.readFileSync(q, 'utf8'), m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/)
        if (!m) continue
        const fm = {}
        for (const l of m[1].split(/\r?\n/)) { const k = l.match(/^(\w+):\s*(.*)$/); if (k) fm[k[1]] = val(k[2]) }
        const maps = t.match(/google\.com\/maps\/search\/\?api=1&query=([^\s)\]>"]+)/)
        let place = ''
        try { place = maps ? decodeURIComponent(maps[1]).replace(/\+/g, ' ') : '' } catch {}
        out.push({ path: q, title: (t.match(/^# (.+)$/m)?.[1] ?? path.parse(f.name).name).trim(), collection: fm.collection || '—',
          type: fm.type, summary: fm.summary, status: fm.status, created: fm.created, place: place || (fm.type === 'plan' ? fm.where : '') || '' })
      }
    }
  }
  walk(dir, true)
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)))
}

function setup({ house }) {
  const dir = () => { const c = house().ideas; return c ? path.join(c.vault, c.folder) : '' }
  let geo = {}
  try { geo = JSON.parse(fs.readFileSync(GEO, 'utf8')) } catch {}
  let queue = [], running = false
  const saveGeo = () => { fs.mkdirSync(path.dirname(GEO), { recursive: true }); fs.writeFileSync(GEO, JSON.stringify(geo)) }
  async function work() {
    if (running) return
    running = true
    while (queue.length) {
      const q = queue.shift()
      if (q in geo) continue
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
          { headers: { 'User-Agent': 'ART-Desktop/1.0 (Ideas Browser; personal use)' }, signal: AbortSignal.timeout(10000) })
        if (r.status === 429) { queue.unshift(q); await new Promise((s) => setTimeout(s, 30000)); continue }
        const j = r.ok ? await r.json() : []
        geo[q] = j[0] ? [Number(j[0].lat), Number(j[0].lon)] : null // null: looked up, nothing found (not asked again)
        saveGeo()
      } catch { queue.push(q) ; await new Promise((s) => setTimeout(s, 5000)) }
      await new Promise((s) => setTimeout(s, 1100))
    }
    running = false
  }

  ipcMain.handle('ideas:list', () => {
    if (!dir()) return { error: 'No ideas folder in house.json' }
    return { notes: readNotes(dir()).map(({ path: p, ...n }) => ({ id: p, ...n })) }
  })
  // the map's points so far, and how many places are still being looked up (starts the lookups)
  ipcMain.handle('ideas:geo', () => {
    const places = [...new Set(readNotes(dir()).map((n) => n.place).filter(Boolean))]
    queue = places.filter((p) => !(p in geo))
    work()
    return { geo, pending: queue.length }
  })
  ipcMain.handle('ideas:open', (_e, p) => {
    const d = dir()
    if (!d || !path.resolve(p).startsWith(path.resolve(d) + path.sep)) return
    shell.openExternal(`obsidian://open?path=${encodeURIComponent(p)}`)
  })
}

module.exports = { setup, readNotes }
