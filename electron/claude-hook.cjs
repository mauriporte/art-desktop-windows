// Claude Code hook -> A.R.T. app (the notch's Claude tab). Reads the hook's JSON on stdin and posts it to the app on
// this PC; for a PermissionRequest it waits for the user's Allow/Deny from the notch and prints Claude Code's decision JSON.
// When the app isn't running (or answers nothing) it exits 0 with no output: Claude Code carries on exactly as usual.
const http = require('http')

let input = ''
process.stdin.on('data', (d) => (input += d)).on('end', () => {
  const req = http.request({ host: '127.0.0.1', port: 8797, path: '/hook', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
    let out = ''
    res.on('data', (d) => (out += d)).on('end', () => { if (out.trim()) process.stdout.write(out); process.exit(0) })
  })
  req.on('error', () => process.exit(0))
  req.end(input)
})
