// Uses Groq cloud API (free tier) for message parsing
// Get a free API key at console.groq.com

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq retires models with little notice — llama-3.1-8b-instant vanished from the
// catalog in Aug 2026 and every parse silently failed. Keep this overridable by env
// so the next retirement is a Railway variable change, not a redeploy.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b'

const SYSTEM_PROMPT = `You are a stat extractor for a business referral exchange group WhatsApp chat.

Your job: read a WhatsApp message and extract any business stats reported.

Stat types:
- outside_referral: member gave a referral to someone outside the group (count + optional recipient name)
- inside_referral: member gave a referral to another group member (count + optional recipient name)
- one_to_one: member had a one-to-one meeting with another member (count + optional partner name)
- closed_business: member closed business that came from a referral sent to them ($amount + optional who sent referral)
- visitors: number of visitors the member brought to the group meeting (count)

Return ONLY valid JSON. No explanation. No markdown. Just the JSON object.

Schema:
{"has_stats": boolean, "stats": [{"type": "outside_referral"|"inside_referral"|"one_to_one"|"closed_business"|"visitors", "count": number|null, "amount": number|null, "names": string[]}]}

Rules:
- "zeros" or "0s" = member reporting zero stats — return {"has_stats": true, "stats": []}
- CEU = ignore completely
- Pure conversation messages = {"has_stats": false, "stats": []}
- Dollar amounts: strip $ and commas, return as number (e.g. "$1,200" = 1200)
- A message can have multiple stats, but never more than ONE object per stat type unless the message clearly describes separate, distinct events (e.g. two different one-to-ones named on two different lines). If in doubt, merge into a single object of that type rather than emitting duplicates.
- "1-2-1", "1.2.1", "121", "1on1", "1-on-1", or "one on one" are all common shorthand for a one-to-one meeting, regardless of spacing/punctuation. The count can appear BEFORE or AFTER it: "1 1-2-1", "1-2-1 - 1", and "1 1on1" all mean one one_to_one; "1.2.1 - 0" means zero one_to_ones (an explicit reported zero, not "ignore this line").
- "CB" is shorthand for closed_business. A dollar amount next to "CB" is the closed_business amount regardless of order or joining word: "$716 CB", "CB - $716", "CB $716", and "$716 in CB" all mean one closed_business object with amount 716.
- CEU produces NO object, ever — not even a zero-count one. Its own number (e.g. the "2" in "CEU - 2") is not a stat and must never become a one_to_one, closed_business, or any other object. This applies whether CEU is on its own line or joined to a real stat with "&"/"and"/"/"/a comma (e.g. "1 CEU & $716 CB" = ONLY a closed_business amount 716 object, nothing for the CEU part). CEU near a stat line never changes or duplicates that stat's own count.
- Never let one unfamiliar or unmatched line (e.g. a CEU note, a stray comment) cause you to drop stats reported elsewhere in the SAME message. Extract every recognizable stat line independently; only lines you truly cannot parse get ignored on their own, not the whole message.
- A line of names following a referral count line (e.g. "Outside - 3" then "1 Trey 1 Kyle 1 Tanner") is who THAT referral went to — attach them as "names" on the outside_referral/inside_referral object. Never turn a names line into its own separate stat object (not a one_to_one, not anything else).

Worked example — input:
"1.2.1 - 0 / CEU - 2 / Inside - 0 / Outside - 3 / 1 Trey 1 Kyle 1 Tanner / CB - 0"
Correct output (note: exactly one object per line that is an actual stat type; the CEU line contributes nothing at all, not even using its "2"):
{"has_stats": true, "stats": [{"type": "one_to_one", "count": 0, "amount": null, "names": []}, {"type": "inside_referral", "count": 0, "amount": null, "names": []}, {"type": "outside_referral", "count": 3, "amount": null, "names": ["Trey", "Kyle", "Tanner"]}, {"type": "closed_business", "count": null, "amount": 0, "names": []}]}`

// finds the FIRST balanced {...} object, ignoring anything the model appends after it
// (llama-3.1-8b-instant sometimes echoes/duplicates its answer even at temperature 0)
export function extractFirstJsonObject(raw) {
  const start = raw.indexOf('{')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++
    else if (raw[i] === '}') {
      depth--
      if (depth === 0) return raw.slice(start, i + 1)
    }
  }
  return null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Groq's free tier is 6000 tokens/minute for this model — our ~450-token request
// caps out around 13/min, so bursts of group activity (e.g. a backlog of messages
// delivered at once after a reconnect) trip 429s. We'd rather wait out the full
// per-minute window than ever drop a stat, so retry generously.
// ponytail: retry-after-driven backoff bounded at 20 tries (~a couple minutes worst
// case), revisit if a single burst is ever big enough to outlast that.
const MAX_RETRIES = 20

export async function parseMessage(text) {
  if (!text || text.trim().length === 0) return { has_stats: false, stats: [] }

  let raw = ''
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: text },
          ],
          temperature: 0,
          // Groq's current models emit reasoning before the answer. Without JSON
          // mode they prepend a <think>/analysis block that blew past the old
          // 256-token cap and truncated the JSON mid-object. json_object forces a
          // bare object, low effort keeps latency near the old 8b-instant.
          response_format: { type: 'json_object' },
          ...(MODEL.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          max_tokens: 1200,
        }),
      })

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('retry-after')) || 2
        console.warn(`Parser rate-limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${retryAfter}s`)
        await sleep(retryAfter * 1000)
        continue
      }

      const data = await response.json()

      // An API-level failure (bad/revoked key, decommissioned model, quota) returns
      // no `choices` at all. Left unchecked it collapses into raw='' and looks
      // identical to "this message had no stats" — which is how a revoked key
      // silently ate every stat for days in Aug 2026. Surface it loudly and
      // return api_error so the caller never mistakes it for a clean no-op.
      if (data.error || !data.choices) {
        console.error(
          `[PARSER-API-FAIL] HTTP ${response.status} — ${data.error?.code || 'no_choices'}: ` +
          `${data.error?.message || JSON.stringify(data).slice(0, 200)} ` +
          `>>> STAT NOT RECORDED, message text: "${text.slice(0, 120)}"`
        )
        return { has_stats: false, stats: [], api_error: true }
      }

      raw = data.choices?.[0]?.message?.content?.trim() || ''

      const jsonStr = extractFirstJsonObject(raw)
      if (!jsonStr) throw new Error(`no JSON object in response: ${raw.slice(0, 120)}`)
      return JSON.parse(jsonStr)
    } catch (err) {
      console.error('Parser failed:', err.message, '| raw:', raw.slice(0, 200))
      return { has_stats: false, stats: [], api_error: true }
    }
  }

  console.error('Parser failed: exhausted retries after repeated 429s')
  return { has_stats: false, stats: [], api_error: true }
}
