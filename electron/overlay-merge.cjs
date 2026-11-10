// The dashboard's shared keys and how an entry is known: servers by name, tiles by id (or entity, or nav page)
const SHARED = { servers: (s) => s?.name, tiles: (t) => t?.id ?? t?.entity ?? t?.nav }

// master → this device: its own order and selection stay, and an entry the master also has takes the master's copy whole
function fromMaster(local, m) {
  const d = { ...local }
  for (const [k, key] of Object.entries(SHARED)) {
    if (!Array.isArray(m?.[k])) continue
    const by = new Map(m[k].map((x) => [key(x), x]))
    d[k] = (local[k] ?? []).map((x) => by.get(key(x)) ?? x)
  }
  return d
}

// this device's edit → master (shared keys only): changed and new entries replace or join it, the ones this edit removed
// leave it, and entries only other devices show stay
function toMaster(m, before, after) {
  const d = {}
  for (const [k, key] of Object.entries(SHARED)) {
    const now = new Map((after[k] ?? []).map((x) => [key(x), x]))
    const gone = new Set((before[k] ?? []).map(key).filter((x) => !now.has(x)))
    const have = new Set()
    d[k] = (m?.[k] ?? []).filter((x) => !gone.has(key(x))).map((x) => { have.add(key(x)); return now.get(key(x)) ?? x })
    for (const [i, x] of now) if (!have.has(i)) d[k].push(x)
  }
  return d
}

module.exports = { fromMaster, toMaster }

if (require.main === module) { // self-check: node electron/overlay-merge.cjs
  const assert = require('assert')
  const m = { servers: [{ name: 'A', apps: [1, 2] }, { name: 'B', apps: [] }, { name: 'Phone', apps: [9] }], tiles: [{ id: 't1', color: 'red' }, { id: 't2' }] }
  const local = { pinned: true, servers: [{ name: 'B', apps: [0] }, { name: 'A', apps: [1] }, { name: 'Mine', apps: [] }], tiles: [{ id: 't2' }, { id: 't1' }] }
  const got = fromMaster(local, m)
  assert.deepStrictEqual(got.servers.map((s) => s.name), ['B', 'A', 'Mine']) // own order and selection
  assert.deepStrictEqual(got.servers[1].apps, [1, 2]) // master's copy whole
  assert.deepStrictEqual(got.tiles[1], { id: 't1', color: 'red' })
  assert.strictEqual(got.pinned, true)
  const after = { servers: [{ name: 'B', apps: [5] }, { name: 'Mine', apps: [] }], tiles: [{ id: 't2' }, { id: 't1' }, { id: 't3' }] }
  const put = toMaster(m, got, after)
  assert.deepStrictEqual(Object.keys(put), ['servers', 'tiles'])
  assert.deepStrictEqual(put.servers.map((s) => s.name), ['B', 'Phone', 'Mine']) // A removed here, Phone kept, Mine joins
  assert.deepStrictEqual(put.servers[0].apps, [5])
  assert.deepStrictEqual(put.tiles.map((t) => t.id), ['t1', 't2', 't3'])
  console.log('overlay-merge ok')
}
