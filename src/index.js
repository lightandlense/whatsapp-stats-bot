import 'dotenv/config'
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import pino from 'pino'
import { parseMessage } from './parser.js'
import { writeStats } from './sheets.js'
import { getMemberByPhone, getMemberByPushName } from './members.js'

const GROUP_NAME = process.env.WHATSAPP_GROUP_NAME || 'Referral Exchange'
const logger = pino({ level: 'warn' }) // suppress Baileys debug noise

let targetGroupJid = null

async function findGroup(sock) {
  const groups = await sock.groupFetchAllParticipating()
  for (const [jid, meta] of Object.entries(groups)) {
    if (meta.subject.toLowerCase().includes(GROUP_NAME.toLowerCase())) {
      console.log(`Found group: "${meta.subject}" (${jid})`)
      return jid
    }
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

  // Identify member
  let member = getMemberByPhone(senderJid)
  if (!member) member = getMemberByPushName(pushName)

  if (!member) {
    console.log(`[SKIP] Unknown sender: ${senderJid} (${pushName})`)
    return
  }

  console.log(`[MSG] ${member.name}: "${body.slice(0, 80)}"`)

  // Parse with AI
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

  // Write to sheet
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
      console.log('\nScan this QR code with WhatsApp (Linked Devices):\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      console.log('WhatsApp connected!')
      targetGroupJid = await findGroup(sock)
      if (!targetGroupJid) {
        console.error(`Group "${GROUP_NAME}" not found. Set WHATSAPP_GROUP_NAME in .env to match one of the groups above.`)
      } else {
        console.log(`Listening to group: ${GROUP_NAME}`)
      }
    }

    if (connection === 'close') {
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
