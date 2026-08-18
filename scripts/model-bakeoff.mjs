// Compares candidate Groq models against the real parser prompt using the exact
// messages that were dropped when llama-3.1-8b-instant was decommissioned.
// Usage: node scripts/model-bakeoff.mjs
import { parseMessage } from '../src/parser.js'

const CASES = [
  {
    name: 'Brandy (dropped 2026-08-18)',
    text: '1.2.1 - 0\nCEU - 2\nInside - 1\nOutside - 0\nCB - $119',
    expect: { one_to_one: 0, inside_referral: 1, outside_referral: 0, closed_business: 119 },
  },
  {
    name: 'Trey (dropped 2026-08-17)',
    text: '1 outside',
    expect: { outside_referral: 1 },
  },
  {
    name: 'Worked example w/ names line',
    text: '1.2.1 - 0 / CEU - 2 / Inside - 0 / Outside - 3 / 1 Trey 1 Kyle 1 Tanner / CB - 0',
    expect: { one_to_one: 0, inside_referral: 0, outside_referral: 3, closed_business: 0 },
  },
  { name: 'Explicit zeros', text: 'zeros', expect: {} },
  { name: 'Pure conversation', text: 'Great meeting everyone this morning!', expect: null },
]

// value we care about per stat type: amount for closed_business, else count
const val = (s) => (s.type === 'closed_business' ? (s.amount ?? s.count) : s.count)

function check(parsed, expect) {
  if (expect === null) return { pass: parsed.has_stats === false, detail: `has_stats=${parsed.has_stats}` }
  if (parsed.api_error) return { pass: false, detail: 'API ERROR' }
  if (!parsed.has_stats) return { pass: false, detail: 'has_stats=false' }

  const got = {}
  const dupes = []
  for (const s of parsed.stats) {
    if (s.type in got) dupes.push(s.type)
    got[s.type] = val(s)
  }
  const keys = new Set([...Object.keys(expect), ...Object.keys(got)])
  const bad = []
  for (const k of keys) {
    if (expect[k] !== got[k]) bad.push(`${k}: want ${expect[k]}, got ${got[k]}`)
  }
  if (dupes.length) bad.push(`DUPLICATE objects: ${dupes.join(', ')}`)
  return { pass: bad.length === 0, detail: bad.join(' | ') || 'ok' }
}

const models = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b']

for (const model of models) {
  process.env.GROQ_MODEL = model
  // parser.js reads MODEL at import time, so re-import fresh per model
  const { parseMessage: parse } = await import(`../src/parser.js?m=${encodeURIComponent(model)}`)
  let passed = 0
  console.log(`\n=== ${model} ===`)
  for (const c of CASES) {
    const parsed = await parse(c.text)
    const { pass, detail } = check(parsed, c.expect)
    if (pass) passed++
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${c.name}${pass ? '' : '  -> ' + detail}`)
  }
  console.log(`  ${passed}/${CASES.length}`)
}
