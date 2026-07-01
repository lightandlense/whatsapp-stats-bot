# WhatsApp Stats Bot

Reads WhatsApp group messages and writes business stats to Google Sheets automatically.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Google Service Account

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Google Sheets API**
3. Create a Service Account → download JSON key → save as `credentials.json` in this folder
4. Share the spreadsheet with the service account email (editor access)

### 3. Environment variables

Copy `.env.example` to `.env` and fill in:

```
ANTHROPIC_API_KEY=sk-ant-...
SPREADSHEET_ID=1XBqZrPLcTlvK4Yolnv5kKrR6PeL44V7_fQRILwCtLSs
WHATSAPP_GROUP_NAME=Referral Exchange
```

### 4. Verify member tab names

Open `src/members.js` and confirm the `tab` field for each member matches the exact tab name in the spreadsheet.

### 5. Run

```bash
npm start
```

On first run, a QR code appears in the terminal. Scan it with WhatsApp → Linked Devices → Link a Device.

The bot stays running and processes messages in real time.

## What it tracks

| WhatsApp message | Sheet column |
|---|---|
| "1 outside referral" | # of Outside Referrals |
| "1 inside referral" | # of Inside Referrals |
| "1 one-to-one" | # of One to Ones |
| "$500 closed business" | Closed Business Amount |
| Visitor count | Visitors Invited |

- Stats are **accumulated** (posting twice adds both values)
- "zeros" messages are recognized and skipped (nothing written)
- CEU mentions are ignored
- Non-stat messages (thank-yous, announcements) are ignored

## Running persistently

Use PM2 to keep it alive in the background:

```bash
npm install -g pm2
pm2 start npm --name stats-bot -- start
pm2 save
pm2 startup
```
