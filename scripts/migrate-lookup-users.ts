/**
 * migrate-lookup-users.ts
 *
 * Migrates LookupUser records into the main User table and re-points
 * LookupSearch.userId to the corresponding User.id.
 *
 * Run with:
 *   npx tsx scripts/migrate-lookup-users.ts
 *
 * Safe to run multiple times — skips emails that already exist in User.
 */

import { neon } from "@neondatabase/serverless"
import { createId } from "@paralleldrive/cuid2"

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set.")
  }

  const sql = neon(databaseUrl)

  console.log("Fetching LookupUser records...")
  const lookupUsers = await sql`
    SELECT id, email, "passwordHash", "createdAt"
    FROM "LookupUser"
    ORDER BY "createdAt" ASC
  `

  console.log(`Found ${lookupUsers.length} LookupUser records.`)
  if (lookupUsers.length === 0) {
    console.log("Nothing to migrate. Exiting.")
    return
  }

  let migrated = 0
  let skipped = 0

  for (const lu of lookupUsers) {
    // Check if this email already exists in User (may have been created by new signup flow)
    const existing = await sql`
      SELECT id FROM "User"
      WHERE lower(email) = lower(${lu.email})
      LIMIT 1
    `

    let userId: string

    if (existing.length > 0) {
      // Email already exists in User — just remap searches to this User id
      userId = existing[0].id
      console.log(`  SKIP (already in User): ${lu.email} → User.id=${userId}`)
      skipped++
    } else {
      // Create a new User record using the LookupUser's hashed password
      userId = createId()
      await sql`
        INSERT INTO "User" (id, email, password, role, "clientId", "firstName", "lastName",
                            "firstLogin", "digestEnabled", "weeklyDigestEnabled", "createdAt", "updatedAt")
        VALUES (
          ${userId},
          ${lu.email.toLowerCase().trim()},
          ${lu.passwordHash},
          'lookup',
          'lookup',
          '',
          '',
          false,
          false,
          false,
          ${lu.createdAt},
          ${new Date().toISOString()}
        )
      `
      console.log(`  MIGRATED: ${lu.email} → User.id=${userId}`)
      migrated++
    }

    // Re-point all LookupSearch rows from this LookupUser to the User
    const updated = await sql`
      UPDATE "LookupSearch"
      SET "userId" = ${userId}
      WHERE "userId" = ${lu.id}
    `
    console.log(`    Updated ${updated.count ?? "?"} LookupSearch rows for ${lu.email}`)
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped (already existed): ${skipped}`)
  console.log("You can now drop the LookupUser table once you have verified the data.")
  console.log("  ALTER TABLE \"LookupSearch\" DROP CONSTRAINT IF EXISTS <fk_constraint_name>;")
  console.log("  DROP TABLE \"LookupUser\";")
}

main().catch((err) => {
  console.error("Migration failed:", err)
  process.exit(1)
})
