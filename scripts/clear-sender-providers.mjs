/**
 * Migration: Clear all sendingProvider and dkimSelector values from campaigns
 * so the cron re-resolves them using IP Owner (RDAP orgName) only.
 *
 * Also clears IpSenderMapping so fresh RDAP lookups are triggered on next cron run.
 *
 * Usage:
 *   node --env-file-if-exists=/vercel/share/.env.project scripts/clear-sender-providers.mjs
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("Starting sender provider migration...")

  // 1. Clear sendingProvider and dkimSelector on all campaigns
  const campaignResult = await prisma.competitiveInsightCampaign.updateMany({
    where: {
      OR: [
        { sendingProvider: { not: null } },
        { dkimSelector: { not: null } },
      ],
    },
    data: {
      sendingProvider: null,
      dkimSelector: null,
    },
  })
  console.log(`Cleared sendingProvider/dkimSelector on ${campaignResult.count} campaigns`)

  // 2. Delete all IpSenderMapping rows so RDAP is re-run fresh
  const ipResult = await prisma.ipSenderMapping.deleteMany({})
  console.log(`Deleted ${ipResult.count} IpSenderMapping rows`)

  console.log("Done. Run the resolve-sending-providers cron to re-populate using IP Owner.")
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
