// Uses Groq cloud API (free tier) for message parsing
// Get a free API key at console.groq.com

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

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
- A message can have multiple stats
- "1-2-1", "1.2.1", or "121" is common shorthand for a one-to-one meeting. A leading number is the count (e.g. "1 1-2-1" or "1 1.2.1" = one one_to_one)`

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

export async function parseMessage(text) {
  if (!text || text.trim().length === 0) return { has_stats: false, stats: [] }

  let raw = ''
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
        max_tokens: 256,
      }),
    })

    const data = await response.json()
    raw = data.choices?.[0]?.message?.content?.trim() || ''

    const jsonStr = extractFirstJsonObject(raw)
    if (!jsonStr) throw new Error(`no JSON object in response: ${raw.slice(0, 120)}`)
    return JSON.parse(jsonStr)
  } catch (err) {
    console.error('Parser failed:', err.message, '| raw:', raw.slice(0, 200))
    return { has_stats: false, stats: [] }
  }
}
