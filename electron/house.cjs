// House-specific setup (no secrets): ~/.config/art-desktop/house.json — see config/house.example.json.
// Re-read when the file changes; a missing or broken file means an empty house (tabs that need it don't show).
const fs = require('fs')
const os = require('os')
const path = require('path')

const FILE = path.join(os.homedir(), '.config', 'art-desktop', 'house.json')
let cache = {}, mtime = 0

module.exports = function house() {
  try {
    const m = fs.statSync(FILE).mtimeMs
    if (m !== mtime) { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); mtime = m }
  } catch { cache = {}; mtime = 0 }
  return cache
}
