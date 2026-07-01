import { google } from 'googleapis'
import { readFileSync } from 'fs'

const SPREADSHEET_ID = process.env.SPREADSHEET_ID

// Column letters for each stat type (1-indexed from A)
const COLUMNS = {
  outside_referral_count: 'B',
  outside_referral_who:   'C',
  inside_referral_count:  'D',
  inside_referral_who:    'E',
  one_to_one_count:       'F',
  one_to_one_who:         'G',
  closed_business_amount: 'H',
  closed_business_who:    'I',
  visitors_count:         'J',
}

let sheetsClient = null

function getClient() {
  if (sheetsClient) return sheetsClient
  let key
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Railway: credentials passed as env var (raw JSON string)
    key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  } else {
    // Local: credentials loaded from file
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials.json'
    key = JSON.parse(readFileSync(keyPath, 'utf8'))
  }
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  sheetsClient = google.sheets({ version: 'v4', auth })
  return sheetsClient
}

// Find which row corresponds to the given date (a JS Date object)
// Rows look like "2/11 to 2/17", "6/24 to 6/30", etc.
async function findWeekRow(sheets, tabName, date) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${tabName}'!A:A`,
  })
  const rows = result.data.values || []

  for (let i = 0; i < rows.length; i++) {
    const cell = (rows[i][0] || '').trim()
    if (!cell || !cell.includes(' to ')) continue

    const range = parseDateRange(cell, date.getFullYear())
    if (range && date >= range.start && date <= range.end) {
      return i + 1 // 1-indexed row number
    }
  }
  return null
}

function parseDateRange(rangeStr, year) {
  // Matches "M/D to M/D" or "M/DD to M/DD"
  const match = rangeStr.match(/^(\d{1,2})\/(\d{1,2})\s+to\s+(\d{1,2})\/(\d{1,2})$/)
  if (!match) return null

  const [, sm, sd, em, ed] = match.map(Number)
  const start = new Date(year, sm - 1, sd, 0, 0, 0)
  const end   = new Date(year, em - 1, ed, 23, 59, 59)

  // Handle year rollover (e.g. 12/28 to 1/3)
  if (em < sm) end.setFullYear(year + 1)

  return { start, end }
}

// Append (add) a numeric value to a cell (reading current value first)
async function addToCell(sheets, tabName, row, col, value) {
  const cellRef = `'${tabName}'!${col}${row}`
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: cellRef,
  })
  const current = parseFloat((existing.data.values?.[0]?.[0] || '').replace(/[$,]/g, '')) || 0
  const newVal = current + value

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: cellRef,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newVal]] },
  })
  return newVal
}

// Append text to a cell (comma-separated if already has value)
async function appendText(sheets, tabName, row, col, text) {
  if (!text) return
  const cellRef = `'${tabName}'!${col}${row}`
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: cellRef,
  })
  const current = (existing.data.values?.[0]?.[0] || '').trim()
  const newVal = current ? `${current}, ${text}` : text

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: cellRef,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[newVal]] },
  })
}

export async function writeStats(tabName, stats, messageDate) {
  const sheets = getClient()
  const row = await findWeekRow(sheets, tabName, messageDate)

  if (!row) {
    console.warn(`No matching week row found for date ${messageDate.toDateString()} in tab "${tabName}"`)
    return { success: false, reason: 'no_week_row' }
  }

  const written = []

  for (const stat of stats) {
    const names = (stat.names || []).join(', ')

    switch (stat.type) {
      case 'outside_referral':
        if (stat.count) await addToCell(sheets, tabName, row, COLUMNS.outside_referral_count, stat.count)
        if (names)      await appendText(sheets, tabName, row, COLUMNS.outside_referral_who, names)
        written.push(`outside referral ×${stat.count}`)
        break

      case 'inside_referral':
        if (stat.count) await addToCell(sheets, tabName, row, COLUMNS.inside_referral_count, stat.count)
        if (names)      await appendText(sheets, tabName, row, COLUMNS.inside_referral_who, names)
        written.push(`inside referral ×${stat.count}`)
        break

      case 'one_to_one':
        if (stat.count) await addToCell(sheets, tabName, row, COLUMNS.one_to_one_count, stat.count)
        if (names)      await appendText(sheets, tabName, row, COLUMNS.one_to_one_who, names)
        written.push(`one-to-one ×${stat.count}`)
        break

      case 'closed_business':
        if (stat.amount) await addToCell(sheets, tabName, row, COLUMNS.closed_business_amount, stat.amount)
        if (names)       await appendText(sheets, tabName, row, COLUMNS.closed_business_who, names)
        written.push(`closed $${stat.amount}`)
        break

      case 'visitors':
        if (stat.count) await addToCell(sheets, tabName, row, COLUMNS.visitors_count, stat.count)
        written.push(`visitors ×${stat.count}`)
        break
    }
  }

  return { success: true, row, written }
}
