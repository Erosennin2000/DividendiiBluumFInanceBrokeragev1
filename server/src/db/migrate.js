// Creates the tables. Safe to run more than once: every statement in
// schema.sql uses IF NOT EXISTS.
//
//   npm run migrate --workspace server

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from '../config.js'

const here = dirname(fileURLToPath(import.meta.url))

if (!config.db.url) {
  console.log('DATABASE_URL is empty, so there is no database to set up.')
  console.log('The server runs on an in-memory store until you set one.')
  process.exit(0)
}

const { default: pg } = await import('pg')
const client = new pg.Client({
  connectionString: config.db.url,
  ssl: /sslmode=require/.test(config.db.url) ? { rejectUnauthorized: false } : undefined,
})

const sql = await readFile(join(here, 'schema.sql'), 'utf8')

await client.connect()
try {
  await client.query(sql)
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  )
  console.log('Tables ready:')
  for (const r of rows) console.log(`  ${r.table_name}`)
} finally {
  await client.end()
}
