// One-time backfill: populate SeedEmail.purpose for existing rows based on
// current usage signals (domainHealthMode, locked, assignedToClient).
// Run with: node --env-file-if-exists=.env.development.local -r tsx/cjs scripts/backfill-seed-purpose.ts
import prisma from "@/lib/prisma"
import { computeSeedPurpose } from "@/lib/seed-utils"

async function main() {
  const seeds = await prisma.seedEmail.findMany({
    select: { id: true, email: true, assignedToClient: true, domainHealthMode: true, locked: true, purpose: true },
  })

  console.log(`Found ${seeds.length} seed emails`)

  const counts: Record<string, number> = { "Domain Health": 0, CI: 0, Personal: 0, none: 0, unchanged: 0 }
  const updates: Promise<unknown>[] = []

  for (const seed of seeds) {
    const computed = computeSeedPurpose(seed)

    if (seed.purpose === computed) {
      counts.unchanged++
      continue
    }

    counts[computed ?? "none"] = (counts[computed ?? "none"] ?? 0) + 1
    updates.push(prisma.seedEmail.update({ where: { id: seed.id }, data: { purpose: computed } }))
  }

  await Promise.all(updates)

  console.log(`Updated ${updates.length} seed emails`)
  console.log(counts)
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
