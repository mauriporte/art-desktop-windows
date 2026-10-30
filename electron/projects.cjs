// Projects (the dashboard's Proyectos tile): every GitHub repo of the signed-in gh account with its last change and
// version, whether a clone on this PC has unsaved or unpushed work, and the open pull requests. Read through the gh CLI
// (its own login; nothing stored here), kept for 5 minutes.
const { execFile } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const run = (cmd, args, cwd) => new Promise((res) => execFile(cmd, args, { cwd, windowsHide: true, timeout: 30000, encoding: 'utf8' }, (err, out) => res(err ? null : out)))
let cache = null, at = 0

// a clone of the repo in the home folder: how many files have unsaved changes and how many commits aren't pushed
async function local(name) {
  const dir = path.join(os.homedir(), name)
  if (!fs.existsSync(path.join(dir, '.git'))) return null
  const [status, ahead] = await Promise.all([run('git', ['status', '--porcelain'], dir), run('git', ['rev-list', '--count', '@{u}..HEAD'], dir)])
  return { changed: status ? status.split('\n').filter(Boolean).length : 0, unpushed: Number(ahead) || 0 }
}

async function list() {
  if (cache && Date.now() - at < 5 * 60000) return cache
  const repos = JSON.parse(await run('gh', ['repo', 'list', '--limit', '200', '--json', 'name,description,pushedAt,isPrivate,latestRelease,url']) ?? 'null')
  if (!repos) throw new Error('gh is not signed in or not installed')
  const prs = JSON.parse(await run('gh', ['search', 'prs', '--author', '@me', '--state', 'open', '--json', 'repository,number,title,url', '--limit', '50']) ?? '[]')
  const withLocal = await Promise.all(repos.sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).map(async (r) => ({
    name: r.name, description: r.description, pushedAt: r.pushedAt, private: r.isPrivate, release: r.latestRelease?.tagName ?? null, url: r.url,
    local: await local(r.name) })))
  cache = { repos: withLocal, prs: prs.map((p) => ({ repo: p.repository.nameWithOwner, number: p.number, title: p.title, url: p.url })) }
  at = Date.now()
  return cache
}

module.exports = { list }
