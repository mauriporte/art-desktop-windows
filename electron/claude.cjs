// The notch's Claude tab: a listener on 127.0.0.1:8797 for Claude Code hooks (claude-hook.cjs). It tracks every
// session's state (working / waiting / done) and holds each permission request open until the user answers it in the notch.
// Claude Desktop also shows its own prompt: whichever is answered first wins, and a request answered elsewhere is dropped
// when that session moves on (its next tool result, prompt or stop).
const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 8797
const sessions = new Map() // id -> { id, name, cwd, state, message, at }
const pending = new Map() // request id -> { id, session, tool, input, at, res }
let seq = 0
let onChange = () => {}

// a session's name: its title from the transcript (as the Claude app shows it), else its folder
function title(transcript, cwd) {
  try {
    const fd = fs.openSync(transcript, 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 400000)
    const buf = Buffer.alloc(n)
    fs.readSync(fd, buf, 0, n, size - n)
    fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n').reverse()
    for (const l of lines) { const m = l.match(/"customTitle":"((?:[^"\\]|\\.)*)"/); if (m) return JSON.parse(`"${m[1]}"`) }
    for (const l of lines) { const m = l.match(/"type":"summary","summary":"((?:[^"\\]|\\.)*)"/); if (m) return JSON.parse(`"${m[1]}"`) }
  } catch {}
  return path.basename(cwd || '') || 'Claude'
}

function touch(e, state, message) {
  const s = sessions.get(e.session_id) || { id: e.session_id, cwd: e.cwd }
  if (!s.name || state === 'working') s.name = title(e.transcript_path, e.cwd)
  Object.assign(s, { state, message: message ?? s.message, at: Date.now() })
  sessions.set(e.session_id, s)
}

// a session moved on: any request still open for it was answered somewhere else
function settle(sessionId) {
  for (const p of pending.values()) if (p.session === sessionId) { p.res.end('{}'); pending.delete(p.id) }
}

function handle(e, res) {
  const ev = e.hook_event_name
  if (ev === 'PermissionRequest') {
    touch(e, 'waiting', `${e.tool_name}`)
    const id = String(++seq)
    pending.set(id, { id, session: e.session_id, tool: e.tool_name, input: e.tool_input, cwd: e.cwd, at: Date.now(), res })
    res.on('close', () => { if (pending.has(id)) { pending.delete(id); onChange() } }) // Claude Code gave up waiting
    return onChange()
  }
  if (ev === 'UserPromptSubmit') { settle(e.session_id); touch(e, 'working', '') }
  else if (ev === 'PostToolUse') { settle(e.session_id); touch(e, 'working') }
  else if (ev === 'Stop') { settle(e.session_id); touch(e, 'done', (e.last_assistant_message || '').slice(0, 160)) }
  else if (ev === 'Notification') touch(e, e.notification_type === 'idle_prompt' ? 'idle' : 'waiting', e.message)
  else if (ev === 'SessionEnd') { settle(e.session_id); sessions.delete(e.session_id) }
  res.end('{}')
  onChange()
}

function start(changed) {
  onChange = changed
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/hook') { res.statusCode = 404; return res.end() }
    let body = ''
    req.on('data', (d) => (body += d)).on('end', () => {
      res.setHeader('content-type', 'application/json')
      try { handle(JSON.parse(body), res) } catch { res.end('{}') }
    })
  })
  server.on('error', () => {}) // port taken: the tab just stays empty
  server.listen(PORT, '127.0.0.1')
}

// the user's answer from the notch
function decide(id, allow) {
  const p = pending.get(id)
  if (!p) return false
  p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest',
    decision: allow ? { behavior: 'allow' } : { behavior: 'deny', message: 'Denied by the user from the A.R.T. notch' } } }))
  pending.delete(id)
  onChange()
  return true
}

// ---- transcripts: every Claude Code session writes ~/.claude/projects/<folder>/<session id>.jsonl, so the tab lists
// recent sessions (and what they said and did) even before, or without, any hook reporting in
const PROJECTS = path.join(require('os').homedir(), '.claude', 'projects')
const RECENT = 12 * 3600e3
const tails = new Map() // file -> { mtime, entries } (only re-read when the file changed)

function readTail(file, mtime) {
  const c = tails.get(file)
  if (c && c.mtime === mtime) return c.entries
  let entries = []
  try {
    const fd = fs.openSync(file, 'r'), size = fs.fstatSync(fd).size, n = Math.min(size, 400000)
    const buf = Buffer.alloc(n)
    fs.readSync(fd, buf, 0, n, size - n)
    fs.closeSync(fd)
    for (const l of buf.toString('utf8').split('\n').slice(1)) { try { entries.push(JSON.parse(l)) } catch {} }
  } catch {}
  tails.set(file, { mtime, entries })
  return entries
}

// the readable steps of a transcript: what the user asked, what Claude answered, which tools it used
function steps(entries) {
  const out = []
  for (const j of entries) {
    if (j.isSidechain) continue
    const content = j.message?.content
    if (j.type === 'user') {
      const text = typeof content === 'string' ? content : (content || []).filter((c) => c.type === 'text').map((c) => c.text).join(' ')
      if (text && !text.startsWith('<')) out.push({ who: 'user', text: text.slice(0, 400), at: j.timestamp })
    } else if (j.type === 'assistant') {
      for (const c of content || []) {
        if (c.type === 'text' && c.text.trim()) out.push({ who: 'claude', text: c.text.slice(0, 600), at: j.timestamp })
        if (c.type === 'tool_use') {
          const i = c.input || {}
          out.push({ who: 'tool', text: `${c.name}: ${i.description || i.command || i.file_path || i.pattern || i.url || i.query || ''}`.slice(0, 200), at: j.timestamp })
        }
      }
    }
  }
  return out
}

function transcripts() {
  const list = []
  let dirs = []
  try { dirs = fs.readdirSync(PROJECTS) } catch {}
  for (const d of dirs) {
    let files = []
    try { files = fs.readdirSync(path.join(PROJECTS, d)).filter((f) => f.endsWith('.jsonl')) } catch {}
    for (const f of files) {
      const file = path.join(PROJECTS, d, f)
      let st
      try { st = fs.statSync(file) } catch { continue }
      if (Date.now() - st.mtimeMs > RECENT) continue
      const entries = readTail(file, st.mtimeMs)
      let name = '', cwd = ''
      for (const j of entries) { if (j.customTitle) name = j.customTitle; if (j.cwd) cwd = j.cwd }
      const s = steps(entries), last = [...s].reverse().find((x) => x.who === 'claude') || s[s.length - 1]
      list.push({ id: f.slice(0, -6), file, name: name || path.basename(cwd) || d, cwd, at: st.mtimeMs, message: last?.text?.split('\n')[0] ?? '',
        // without hooks: a transcript written in the last 30 s means the session is busy
        state: Date.now() - st.mtimeMs < 30000 ? 'working' : 'done' })
    }
  }
  return list
}

// a session's latest steps, for the tab's expanded view
function detail(id) {
  const t = transcripts().find((x) => x.id === id)
  return t ? steps(readTail(t.file, fs.statSync(t.file).mtimeMs)).slice(-14) : []
}

const state = () => {
  const merged = new Map(transcripts().map((t) => [t.id, t]))
  // hook reports are fresher: their state (waiting for permission, done...) wins
  for (const s of sessions.values()) {
    const t = merged.get(s.id)
    merged.set(s.id, { ...t, ...s, name: t?.name || s.name, message: s.message || t?.message, at: Math.max(s.at, t?.at ?? 0) })
  }
  return {
    sessions: [...merged.values()].filter((s) => Date.now() - s.at < RECENT).sort((a, b) => b.at - a.at)
      .map(({ file, ...s }) => s),
    pending: [...pending.values()].map(({ res, ...p }) => ({ ...p, name: merged.get(p.session)?.name ?? sessions.get(p.session)?.name })),
  }
}

module.exports = { start, decide, state, detail }
