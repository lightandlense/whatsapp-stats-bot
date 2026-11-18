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
assert.equal(n('4- 1:1’s'), '4- 1-2-1’s')
assert.equal(n('ratio 1:1 here'), 'ratio 1:1 here')
console.log('normalizeShorthand ok')

import { countFromNames as c } from '../src/parser.js'
const one = (count, names) => ({ has_stats: true, stats: [{ type: 'one_to_one', count, amount: null, names }] })
// Brittney 2026-11-17: no number, three names -> 3
assert.equal(c(n('1.2.1 - Mike, Matthew, trey'), one(1, ['Mike', 'Matthew', 'trey'])).stats[0].count, 3)
assert.equal(c(n('1.2.1 w/Michael'), one(1, ['Michael'])).stats[0].count, 1)
// explicit number wins
assert.equal(c(n('2 1-2-1s Mike, Matthew, trey'), one(2, ['Mike', 'Matthew', 'trey'])).stats[0].count, 2)
// closed business untouched
const cb = { has_stats: true, stats: [{ type: 'closed_business', count: null, amount: 0, names: ['A', 'B'] }] }
assert.equal(c('CB thanks A and B', cb).stats[0].count, null)
console.log('countFromNames ok')
