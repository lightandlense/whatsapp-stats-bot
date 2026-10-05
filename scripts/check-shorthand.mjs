// Self-check for normalizeShorthand: node scripts/check-shorthand.mjs
import assert from 'node:assert/strict'
import { normalizeShorthand as n } from '../src/parser.js'

assert.equal(n('1:2:1'), '1-2-1')
assert.equal(n('2 1:2:1s'), '2 1-2-1s')
assert.equal(n('1.2.1 - 0'), '1-2-1 - 0')
assert.equal(n('1/2/1'), '1-2-1')
assert.equal(n('121'), '121')
assert.equal(n('$1,121'), '$1,121')
assert.equal(n('11:2:15'), '11:2:15')
console.log('normalizeShorthand ok')
