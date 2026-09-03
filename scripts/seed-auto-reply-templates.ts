/**
 * seed-auto-reply-templates.ts
 *
 * Seeds the AutoReplyTemplate pool used by the auto-reply-verified-domains cron.
 * No admin UI exists for managing these yet (DB-seeded only, per plan scope) — re-run this
 * script and adjust the TEMPLATES array below to add/change templates.
 *
 * Run with:
 *   npx tsx scripts/seed-auto-reply-templates.ts
 *
 * Safe to run multiple times — skips bodies that already exist (dedup on exact body text).
 */

import { neon } from "@neondatabase/serverless"
import { randomUUID } from "crypto"

const TEMPLATES: Array<{ messageType: string | null; body: string }> = [
  // Generic fallback pool (messageType: null) — used when no category-specific template exists.
  { messageType: null, body: "Thank you for this!" },
  { messageType: null, body: "Thanks so much — appreciate you keeping us posted." },
  { messageType: null, body: "Got it, thank you!" },

  // Category-specific pools
  { messageType: "thank_you", body: "Thank you — this means a lot!" },
  { messageType: "thank_you", body: "Thank you so much, we really appreciate it!" },
  { messageType: "event_invite", body: "Thanks for the invite, noted!" },
  { messageType: "news_update", body: "Appreciate the update, thank you." },
  { messageType: "fundraising_ask", body: "Thank you for reaching out!" },
]

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set.")
  }

  const sql = neon(databaseUrl)

  console.log(`Seeding ${TEMPLATES.length} auto-reply template(s)...`)

  let inserted = 0
  let skipped = 0

  for (const template of TEMPLATES) {
    const existing = await sql`
      SELECT id FROM "AutoReplyTemplate" WHERE body = ${template.body} LIMIT 1
    `
    if (existing.length > 0) {
      skipped++
      continue
    }

    await sql`
      INSERT INTO "AutoReplyTemplate" (id, "messageType", body, active, "createdAt")
      VALUES (${randomUUID()}, ${template.messageType}, ${template.body}, true, now())
    `
    inserted++
  }

  console.log(`Done — inserted ${inserted}, skipped ${skipped} (already existed).`)
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err)
    process.exit(1)
  })
