/**
 * One-time migration: merge duplicate CompetitiveInsightCampaign rows that were
 * created because name-redaction changed the subject after initial ingestion.
 *
 * Strategy:
 *  - Group all non-deleted campaigns by senderEmail + calendar day
 *  - Within each group, find pairs whose normalized subjects match
 *  - Keep the [Omitted] version (canonical), sum counts from all dupes into it
 *  - Soft-delete (isDeleted=true) the non-canonical dupes
 *
 * Run with: npx ts-node --project tsconfig.json scripts/merge-duplicate-campaigns.ts
 */

import { neon } from "@neondatabase/serverless"
import * as dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const sql = neon(process.env.DATABASE_URL!)

/** Mirror of campaign-detector normalizeSubject — must stay in sync */
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|forward):\s*/i, "")
    .replace(/\[Omitted\]/g, "__NAME__")
    .replace(/\b[A-Z][a-z]{1,20}\b(?=\s*[,!?:])/g, "__NAME__")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

async function main() {
  console.log("Fetching all non-deleted campaigns...")

  const rows = await sql`
    SELECT id, "senderEmail", subject, "dateReceived",
           "inboxCount", "spamCount", "notDeliveredCount", "inboxRate",
           "emailPreview", "emailContent", "entityId", "assignmentMethod",
           "assignedAt", "clientId", "source", "ctaLinks", tags
    FROM "CompetitiveInsightCampaign"
    WHERE "isDeleted" = false
    ORDER BY "senderEmail", "dateReceived"
  `

  console.log(`Loaded ${rows.length} campaigns. Grouping by sender + day...`)

  // Group by senderEmail + calendar day
  const groups = new Map<string, typeof rows>()
  for (const row of rows) {
    const day = new Date(row.dateReceived).toISOString().split("T")[0]
    const key = `${row.senderEmail}|${day}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  let mergedCount = 0
  let deletedCount = 0

  for (const [groupKey, campaigns] of groups.entries()) {
    if (campaigns.length < 2) continue

    // Build clusters of campaigns with matching normalized subjects
    const clusters: (typeof rows)[] = []
    const assigned = new Set<string>()

    for (const c of campaigns) {
      if (assigned.has(c.id)) continue
      const normC = normalizeSubject(c.subject)
      const cluster = [c]
      assigned.add(c.id)

      for (const other of campaigns) {
        if (assigned.has(other.id)) continue
        if (normalizeSubject(other.subject) === normC) {
          cluster.push(other)
          assigned.add(other.id)
        }
      }

      if (cluster.length > 1) clusters.push(cluster)
    }

    for (const cluster of clusters) {
      // Prefer the [Omitted] version as canonical; otherwise pick the one with the most recent updatedAt
      const canonical =
        cluster.find((c) => c.subject.includes("[Omitted]")) ||
        cluster.sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime())[0]

      const dupes = cluster.filter((c) => c.id !== canonical.id)

      // Sum counts from all dupes into the canonical row
      const totalInbox = cluster.reduce((sum, c) => sum + (c.inboxCount || 0), 0)
      const totalSpam = cluster.reduce((sum, c) => sum + (c.spamCount || 0), 0)
      const totalNotDelivered = cluster.reduce((sum, c) => sum + (c.notDeliveredCount || 0), 0)
      const totalCount = totalInbox + totalSpam + totalNotDelivered
      const newInboxRate = totalCount > 0 ? (totalInbox / totalCount) * 100 : 0

      // Use best available content (prefer [Omitted] version's content)
      const bestEmailPreview = canonical.emailPreview || dupes.find((d) => d.emailPreview)?.emailPreview || null
      const bestEmailContent = canonical.emailContent || dupes.find((d) => d.emailContent)?.emailContent || null
      const bestEntityId = canonical.entityId || dupes.find((d) => d.entityId)?.entityId || null
      const bestAssignmentMethod = canonical.assignmentMethod || dupes.find((d) => d.assignmentMethod)?.assignmentMethod || null
      const bestClientId = canonical.clientId || dupes.find((d) => d.clientId)?.clientId || null

      console.log(
        `Merging ${cluster.length} dupes for [${groupKey}]: "${canonical.subject}" (keeping id=${canonical.id}, deleting ${dupes.map((d) => d.id).join(",")})`
      )

      // Update canonical with merged counts
      await sql`
        UPDATE "CompetitiveInsightCampaign"
        SET
          "inboxCount" = ${totalInbox},
          "spamCount" = ${totalSpam},
          "notDeliveredCount" = ${totalNotDelivered},
          "inboxRate" = ${newInboxRate},
          "emailPreview" = ${bestEmailPreview},
          "emailContent" = ${bestEmailContent},
          "entityId" = ${bestEntityId},
          "assignmentMethod" = ${bestAssignmentMethod},
          "clientId" = ${bestClientId},
          "updatedAt" = NOW()
        WHERE id = ${canonical.id}
      `
      mergedCount++

      // Soft-delete dupes
      for (const dupe of dupes) {
        await sql`
          UPDATE "CompetitiveInsightCampaign"
          SET "isDeleted" = true, "updatedAt" = NOW()
          WHERE id = ${dupe.id}
        `
        deletedCount++
      }
    }
  }

  console.log(`\nDone. Merged ${mergedCount} canonical campaigns, soft-deleted ${deletedCount} duplicates.`)
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
