// Phone number → member info mapping
// Phone format: country code + number, no spaces/dashes, e.g. "17195223331"
// Tab names must match exactly the sheet tab names for each member
// ⚠️  Verify tab names against the actual spreadsheet before running

export const MEMBERS = {
  '16193018874': { name: 'Angelica Lujan',    tab: 'Angelica Lujan',    business: 'A Universal Cleaning' },
  '17192192190': { name: 'Brandy Pendleton',  tab: 'Brandy Pendleton',  business: 'Pendleton Heating and Cooling' },
  '17194932734': { name: 'Brittney Geisler',  tab: 'Brittney Geisler',  business: 'Closet Factory' },
  '17196198616': { name: 'Cindy Sabbogh',     tab: 'Cindy Sabbogh',     business: 'Best Option Restoration' },
  '12549138611': { name: 'Carmen Mosnia-Hodge', tab: 'Carmen Mosnia-Hodge', business: 'Vogue Vignette' },
  '17194280479': { name: 'Craig Kallian',     tab: 'Craig Kallian',     business: 'Olive Real Estate Group' },
  '18159008115': { name: 'Daniel Trost',      tab: 'Daniel Trost',      business: 'Oxi Fresh Carpet Cleaning' },
  '17202156292': { name: 'Daniel Boone',      tab: 'Daniel Boone',      business: 'Rhino Construction' },
  '17193068965': { name: 'David Turner',      tab: 'David Turner',      business: 'Poop Ninja' },
  '17194408614': { name: 'Donna Quick',       tab: 'Donna Quick',       business: 'Choice Flooring' },
  '18124998409': { name: 'Jordan Milligan',   tab: 'Jordan Milligan',   business: 'Milligan Design & Build' },
  '17196844073': { name: 'Justin Hinze',      tab: 'Justin Hinze',      business: 'Edward Jones' },
  '17199850980': { name: 'Kyle Mackiewicz',   tab: 'Kyle Mackiewicz',   business: 'Mack Renovations' },
  '17194262233': { name: 'Marcy Haenig',      tab: 'Marcy Haenig',      business: 'Haenig Insurance Agency' },
  '17192336451': { name: 'Matt Martinez',     tab: 'Matt Martinez',     business: 'Huntington Bank' },
  '17193518993': { name: 'Michael Schmidt',   tab: 'Michael Schmidt',   business: 'Rightour Kombucha' },
  '15868992738': { name: 'Neil Correll',      tab: 'Neil Correll',      business: 'Venterra Real Estate' },
  '17193452535': { name: 'Kierstin (Rabbit) Garduno',    tab: 'Kierstin (Rabbit) Garduno',    business: 'Color2Color Painting' },
  '17195223331': { name: 'Russell Klimas',    tab: 'Russell Klimas',    business: 'Parsimony Labs' },
  '17192332411': { name: 'Shawn Herlihy',     tab: 'Shawn Herlihy',     business: 'Granite Bank' },
  '18104492252': { name: 'Tanner Thompson',   tab: 'Tanner Thompson',   business: 'Higher Elevations Plumbing' },
  '17208818252': { name: 'Teresa Asuega',     tab: 'Teresa Asuega',     business: 'Junior Achievement' },
  '17208818282': { name: 'Thomas Edwards',    tab: 'Thomas Edwards',    business: 'Appliance Factory' },
  '17195089616': { name: 'Trey Kimberlain',   tab: 'Trey Kimberlain',   business: 'JRD Electric' },
}

// Fallback: match by WhatsApp push name (display name) if phone not found
export const NAME_ALIASES = {
  'trey electrician':        'Trey Kimberlain',
  'neil real estate':        'Neil Correll',
  'neil re correll':         'Neil Correll',
  'shawn':                   'Shawn Herlihy',
  'rabbit':                  'Kierstin (Rabbit) Garduno',
  'jmill':                   'Jordan Milligan',
  'angie':                   'Angelica Lujan',
}

// WhatsApp is gradually migrating contacts to a privacy-preserving "@lid" JID
// instead of the phone-based "@s.whatsapp.net" one. A LID carries no phone
// number, so it has to be mapped by hand the first time a member's messages
// start arriving under one (2026-09-10: Daniel Boone, sender push name was a
// bare "Daniel" which is ambiguous against Daniel Trost — resolved manually).
export const LID_ALIASES = {
  '135309119467589': 'Daniel Boone',
}

export function getMemberByPhone(jid) {
  if (jid.endsWith('@lid')) {
    const name = LID_ALIASES[jid.replace('@lid', '')]
    return name ? Object.values(MEMBERS).find((m) => m.name === name) || null : null
  }
  // jid format from Baileys: "17195223331@s.whatsapp.net"
  const phone = jid.replace('@s.whatsapp.net', '').replace('+', '')
  return MEMBERS[phone] || null
}

export function getMemberByPushName(pushName) {
  if (!pushName) return null
  const lower = pushName.toLowerCase()
  // Exact match first
  for (const member of Object.values(MEMBERS)) {
    if (member.name.toLowerCase() === lower) return member
  }
  // Alias match
  for (const [alias, name] of Object.entries(NAME_ALIASES)) {
    if (lower.includes(alias)) {
      return Object.values(MEMBERS).find(m => m.name === name) || null
    }
  }
  // Last-name match — disambiguates members who share a first name (two Daniels).
  const byLast = Object.values(MEMBERS).filter((m) => {
    const last = m.name.split(' ').pop().toLowerCase()
    return last.length > 2 && lower.includes(last)
  })
  if (byLast.length === 1) return byLast[0]

  // Partial match (first name) — ONLY when it resolves to exactly one member.
  // Returning the first hit here silently credited every "Daniel*" push name to
  // Daniel Trost (declared above Daniel Boone), so Boone's stats landed in Trost's
  // tab and Boone was unreachable. A wrong write is worse than no write: when the
  // first name is ambiguous, fall through to null so handleMessage logs
  // "[SKIP] Unknown sender: <jid> (<pushName>)" and the real push name shows up in
  // the logs, which is what an alias entry needs anyway.
  const byFirst = Object.values(MEMBERS).filter(
    (m) => lower.startsWith(m.name.split(' ')[0].toLowerCase())
  )
  if (byFirst.length === 1) return byFirst[0]

  return null
}
