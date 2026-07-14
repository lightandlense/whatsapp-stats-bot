import assert from 'node:assert'
import { extractFirstJsonObject } from './parser.js'

// clean single object
assert.strictEqual(
  extractFirstJsonObject('{"a":1}'),
  '{"a":1}'
)

// nested braces
assert.strictEqual(
  extractFirstJsonObject('{"a":{"b":1}}'),
  '{"a":{"b":1}}'
)

// model duplicates its answer after the first object (the bug from the Railway log)
assert.strictEqual(
  extractFirstJsonObject('{"has_stats": true, "stats": [{"type": "inside_referral", "count": 1, "names": ["Marcy"]}]}\n\n{"has_stats": true, "stats": [{"type": "inside_referral", "count": 1, "names": ["Marcy"]}]}'),
  '{"has_stats": true, "stats": [{"type": "inside_referral", "count": 1, "names": ["Marcy"]}]}'
)

// no object present
assert.strictEqual(extractFirstJsonObject('no json here'), null)

console.log('parser tests passed')
