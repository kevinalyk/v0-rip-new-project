/**
 * Backfill script: parse DKIM .s= selector from rawHeaders on CompetitiveInsightCampaign
 * and resolve sendingProvider from DkimSenderMapping.
 *
 * Run with: node scripts/backfill-dkim-selectors.mjs
 * Requires DATABASE_URL in environment (uses .env automatically via dotenv).
 */

import { PrismaClient } from "@prisma/client"
import { createRequire } from "module"
import { resolve } from "path"
import { readFileSync, existsSync } from "fs"

// Load .env manually since we're outside Next.js
const envPath = resolve(process.cwd(), ".env")
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}

const prisma = new PrismaClient()

/**
 * Parse the .s= selector from a DKIM-Signature header line.
 * Handles multi-line folded headers and multiple DKIM signatures — uses the first one.
 */
function parseDkimSelector(rawHeaders) {
  if (!rawHeaders) return null

  // Unfold folded header lines (CRLF or LF followed by whitespace)
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, " ")

  // Find the first DKIM-Signature header
  const dkimMatch = unfolded.match(/DKIM-Signature\s*:[^\n]*/i)
  if (!dkimMatch) return null

  // Extract s= tag value
  const selectorMatch = dkimMatch[0].match(/[;\s]s=([^;\s]+)/i)
  if (!selectorMatch) return null

  return selectorMatch[1].toLowerCase().trim()
}

async function main() {
  console.log("Starting DKIM selector backfill...")

  // Load all existing mappings up front
  const mappings = await prisma.dkimSenderMapping.findMany()
  const mappingMap = new Map(mappings.map((m) => [m.selectorValue.toLowerCase(), m.friendlyName]))
  console.log(`Loaded ${mappings.length} DKIM selector mapping(s)`)

  // Process in batches to avoid memory pressure
  const BATCH_SIZE = 500
  let skip = 0
  let totalProcessed = 0
  let totalUpdated = 0

  while (true) {
    const records = await prisma.competitiveInsightCampaign.findMany({
      where: {
        rawHeaders: { not: null },
        type: "email",
      },
      select: { id: true, rawHeaders: true },
      skip,
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    })

    if (records.length === 0) break

    const updates = []
    for (const record of records) {
      const selector = parseDkimSelector(record.rawHeaders)
      const provider = selector ? (mappingMap.get(selector) ?? null) : null
      updates.push({ id: record.id, dkimSelector: selector, sendingProvider: provider })
    }

    // Batch update using individual prisma calls (Prisma doesn't support bulk update with different values per row)
    await Promise.all(
      updates.map(({ id, dkimSelector, sendingProvider }) =>
        prisma.competitiveInsightCampaign.update({
          where: { id },
          data: { dkimSelector, sendingProvider },
        })
      )
    )

    const updated = updates.filter((u) => u.dkimSelector !== null).length
    totalProcessed += records.length
    totalUpdated += updated

    console.log(
      `Processed ${totalProcessed} records | ${updated}/${records.length} had DKIM selector in this batch`
    )

    skip += BATCH_SIZE
  }

  console.log(`\nBackfill complete.`)
  console.log(`Total records processed: ${totalProcessed}`)
  console.log(`Records with DKIM selector found: ${totalUpdated}`)
  console.log(`Records without DKIM selector: ${totalProcessed - totalUpdated}`)
}

main()
  .catch((e) => {
    console.error("Backfill failed:", e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
