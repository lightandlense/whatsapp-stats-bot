import 'dotenv/config'
import { createServer } from 'http'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcodeTerminal from 'qrcode-terminal'
import QRCode from 'qrcode'
import pino from 'pino'
import { parseMessage } from './parser.js'
import { writeStats } from './sheets.js'
import { getMemberByPhone, getMemberByPushName } from './members.js'

// Restore auth files from env var (Railway deployment)
if (process.env.WHATSAPP_AUTH_JSON) {
  const files = JSON.parse(process.env.WHATSAPP_AUTH_JSON)
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = join('./auth_info', filePath)
    if (!existsSync(fullPath)) {
      mkdirSync(dirname(fullPath), { recursive: true })
      writeFileSync(fullPath, content, 'utf8')
    }
  }
  console.log('Auth session restored from env var')
}

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || 'Referral Exchange'
const PORT = process.env.PORT || 3000
const logger = pino({ level: 'warn' })

let targetGroupJid = null
let currentQR = null
let isConnected = false

// Simple HTTP server — serves QR code page so it can be scanned remotely
createServer(async (req, res) => {
  if (isConnected) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1 style="font-family:sans-serif;color:green">✓ WhatsApp Connected</h1><p>Bot is running.</p>')
    return
  }
  if (!currentQR) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1 style="font-family:sans-serif">Waiting for QR...</h1><p>Refresh in a few seconds.</p>')
    return
  }
  const imgDataUrl = await QRCode.toDataURL(currentQR, { width: 300 })
  res.writeHead(200, { 'Content-Type': 'text/html' })
  res.end(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>Scan with WhatsApp</h2>
      <p>WhatsApp → Linked Devices → Link a Device</p>
      <img src="${imgDataUrl}" style="width:300px;height:300px"/>
      <p><small>Refresh page if QR expires</small></p>
    </body></html>
  `)
}).listen(PORT, () => console.log(`QR server running on port ${PORT}`))

async function findGroup(sock) {
  const groups = await sock.groupFetchAllParticipating()
  const want = GROUP_NAME.trim().toLowerCase()

  const exact = Object.entries(groups).find(([, meta]) => meta.subject.trim().toLowerCase() === want)
  if (exact) {
    console.log(`Found group (exact): "${exact[1].subject}" (${exact[0]})`)
    return exact[0]
  }

  const partial = Object.entries(groups).filter(([, meta]) => meta.subject.toLowerCase().includes(want))
  if (partial.length === 1) {
    console.log(`Found group (partial): "${partial[0][1].subject}" (${partial[0][0]})`)
    return partial[0][0]
  }
  if (partial.length > 1) {
    console.error(`WHATSAPP_GROUP_NAME "${GROUP_NAME}" matches ${partial.length} groups — set it to the exact name of one:`)
    for (const [jid, meta] of partial) console.error(`  "${meta.subject}" → ${jid}`)
    return null
  }

  console.log('Available groups:')
  for (const [jid, meta] of Object.entries(groups)) {
    console.log(`  "${meta.subject}" → ${jid}`)
  }
  return null
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid
  if (jid !== targetGroupJid) return

  const body =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ''

  if (!body || msg.key.fromMe) return

  const senderJid = msg.key.participant || msg.key.remoteJid
  const pushName  = msg.pushName || ''
  const msgDate   = new Date((msg.messageTimestamp || Date.now() / 1000) * 1000)

  let member = getMemberByPhone(senderJid)
  if (!member) member = getMemberByPushName(pushName)

  if (!member) {
    console.log(`[SKIP] Unknown sender: ${senderJid} (${pushName})`)
    return
  }

  console.log(`[MSG] ${member.name}: "${body.slice(0, 80)}"`)

  const parsed = await parseMessage(body)
  if (!parsed.has_stats) {
    console.log(`[SKIP] No stats detected`)
    return
  }
  if (parsed.stats.length === 0) {
    console.log(`[INFO] ${member.name} reported zeros`)
    return
  }

  console.log(`[STATS] ${member.name}:`, parsed.stats)

  const result = await writeStats(member.tab, parsed.stats, msgDate)
  if (result.success) {
    console.log(`[WROTE] row ${result.row} — ${result.written.join(', ')}`)
  } else {
    console.warn(`[FAIL] ${result.reason}`)
  }
}

async function connect() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      currentQR = qr
      isConnected = false
      console.log('\nQR ready — open the Railway service URL in your browser to scan\n')
      qrcodeTerminal.generate(qr, { small: true })
    }

    if (connection === 'open') {
      isConnected = true
      currentQR = null
      console.log('WhatsApp connected!')
      targetGroupJid = await findGroup(sock)
      if (!targetGroupJid) {
        console.error(`Group "${GROUP_NAME}" not found. Set WHATSAPP_GROUP_NAME in env vars.`)
      } else {
        console.log(`Listening to group: ${GROUP_NAME}`)
      }
    }

    if (connection === 'close') {
      isConnected = false
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log('Connection closed. Code:', code, '— reconnecting:', shouldReconnect)
      if (shouldReconnect) setTimeout(connect, 5000)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) {
      try {
        await handleMessage(sock, msg)
      } catch (err) {
        console.error('Error handling message:', err.message)
      }
    }
  })
}

connect()
