// Deletes every disposable fixture row created by setup.mjs, then verifies zero remain.
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const PREFIX = "MOBILE_FEED_FILTER_SMOKE_TEST_"

async function main() {
  const delCampaigns = await prisma.competitiveInsightCampaign.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delSms = await prisma.smsQueue.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delSubs = await prisma.ciEntitySubscription.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delTags = await prisma.entityTag.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delMappings = await prisma.ciEntityMapping.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delEntities = await prisma.ciEntity.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delRefreshTokens = await prisma.mobileRefreshToken.deleteMany({ where: { userId: { startsWith: PREFIX } } })
  const delUsers = await prisma.user.deleteMany({ where: { id: { startsWith: PREFIX } } })
  const delClients = await prisma.client.deleteMany({ where: { id: { startsWith: PREFIX } } })

  // Verification pass: confirm zero fixture rows remain anywhere.
  const remaining = {
    campaigns: await prisma.competitiveInsightCampaign.count({ where: { id: { startsWith: PREFIX } } }),
    sms: await prisma.smsQueue.count({ where: { id: { startsWith: PREFIX } } }),
    subs: await prisma.ciEntitySubscription.count({ where: { id: { startsWith: PREFIX } } }),
    tags: await prisma.entityTag.count({ where: { id: { startsWith: PREFIX } } }),
    mappings: await prisma.ciEntityMapping.count({ where: { id: { startsWith: PREFIX } } }),
    entities: await prisma.ciEntity.count({ where: { id: { startsWith: PREFIX } } }),
    refreshTokens: await prisma.mobileRefreshToken.count({ where: { userId: { startsWith: PREFIX } } }),
    users: await prisma.user.count({ where: { id: { startsWith: PREFIX } } }),
    clients: await prisma.client.count({ where: { id: { startsWith: PREFIX } } }),
  }

  console.log(JSON.stringify({
    deleted: {
      campaigns: delCampaigns.count,
      sms: delSms.count,
      subs: delSubs.count,
      tags: delTags.count,
      mappings: delMappings.count,
      entities: delEntities.count,
      refreshTokens: delRefreshTokens.count,
      users: delUsers.count,
      clients: delClients.count,
    },
    remaining,
    allClean: Object.values(remaining).every((n) => n === 0),
  }, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
