// node electron/selftest.cjs: checks the Joint Remote signature matches the Linux panel's (and the Receiver's)
const assert = require('assert')
const crypto = require('crypto')
const { jrSign, REMOTE_KEYS, JR_KEYS } = require('./remote.cjs')

const sig = jrSign(Buffer.alloc(32, 'k'), 'POST', '/cmd', 1, 'abcdefgh', '{}')
assert.strictEqual(sig, crypto.createHmac('sha256', Buffer.alloc(32, 'k')).update('POST\n/cmd\n1\nabcdefgh\n{}').digest('base64'))
for (const k of ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'play', 'vol_up', 'vol_down', 'mute', 'next', 'previous']) {
  assert.ok(REMOTE_KEYS[k] && JR_KEYS[k], `missing key ${k}`)
}
console.log('selftest ok')
