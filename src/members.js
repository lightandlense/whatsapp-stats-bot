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
  '17193452535': { name: 'Jackson Diego',     tab: 'Jackson Diego',     business: 'Color2Color Painting' },
  '18124998409': { name: 'Jordan Milligan',   tab: 'Jordan Milligan',   business: 'Milligan Design & Build' },
  '17196844073': { name: 'Justin Hinze',      tab: 'Justin Hinze',      business: 'Edward Jones' },
  '17199850980': { name: 'Kyle Mackiewicz',   tab: 'Kyle Mackiewicz',   business: 'Mack Renovations' },
  '17194262233': { name: 'Marcy Haenig',      tab: 'Marcy Haenig',      business: 'Haenig Insurance Agency' },
  '17192336451': { name: 'Matt Martinez',     tab: 'Matt Martinez',     business: 'Huntington Bank' },
  '17193518993': { name: 'Michael Schmidt',   tab: 'Michael Schmidt',   business: 'Rightour Kombucha' },
  '15868992738': { name: 'Neil Correll',      tab: 'Neil Correll',      business: 'Venterra Real Estate' },
  '17193452535': { name: 'Kierstin (Rabbit) Garduno',    tab: 'Kierstin (Rabbit) Garduno',    business: 'Color2Color Painting' }, // same number as Jackson — WhatsApp name used as tiebreaker
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
  'jackson':                 'Jackson Diego',
}

export function getMemberByPhone(jid) {
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
  // Partial match (first name)
  for (const member of Object.values(MEMBERS)) {
    const firstName = member.name.split(' ')[0].toLowerCase()
    if (lower.startsWith(firstName)) return member
  }
  return null
}
