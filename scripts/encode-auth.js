// Encodes the local auth_info folder into a JSON string for Railway env var
// Run: node scripts/encode-auth.js
// Copy the output and paste it as WHATSAPP_AUTH_JSON in Railway

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

function encodeDir(dirPath, prefix = '') {
  const result = {}
  try {
    for (const item of readdirSync(dirPath)) {
      const fullPath = join(dirPath, item)
      const key = prefix ? `${prefix}/${item}` : item
      if (statSync(fullPath).isDirectory()) {
        Object.assign(result, encodeDir(fullPath, key))
      } else {
        result[key] = readFileSync(fullPath, 'utf8')
      }
    }
  } catch (e) {
    console.error('Error reading auth_info:', e.message)
    process.exit(1)
  }
  return result
}

const auth = encodeDir('./auth_info')
if (Object.keys(auth).length === 0) {
  console.error('auth_info is empty — make sure the bot has connected at least once locally')
  process.exit(1)
}
console.log(JSON.stringify(auth))
