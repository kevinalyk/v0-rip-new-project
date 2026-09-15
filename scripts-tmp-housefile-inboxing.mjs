import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

async function run() {
  const periods = [
    { label: "09/01-09/07", start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-09-08T00:00:00Z") },
    { label: "09/08-09/14", start: new Date("2026-09-08T00:00:00Z"), end: new Date("2026-09-15T00:00:00Z") },
  ]

  // Build house-file mapping (same logic as /api/ci/analytics route)
  const allMappings = await prisma.ciEntityMapping.findMany({
    select: { entityId: true, senderEmail: true, senderDomain: true },
  })
  const mappingsByEntity = {}
  for (const m of allMappings) {
    if (!mappingsByEntity[m.entityId]) mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
    if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
    if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())
  }

  for (const period of periods) {
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        isHidden: false,
        entityId: { not: null },
        dateReceived: { gte: period.start, lt: period.end },
      },
      select: {
        id: true, entityId: true, senderEmail: true, inboxCount: true, spamCount: true,
        entity: { select: { party: true } },
      },
    })

    // Filter to house-file only (isThirdParty = false)
    const houseFileCampaigns = campaigns.filter((c) => {
      const em = mappingsByEntity[c.entityId]
      if (!em) return true // no mapping at all -> treated as house file per route logic (isHouseFileFilter branch: !em -> return isHouseFileFilter=true)
      const email = (c.senderEmail ?? "").toLowerCase()
      const domain = email.split("@")[1]
      const isThirdParty = !em.emails.has(email) && (!domain || !em.domains.has(domain))
      return !isThirdParty
    })

    const calc = (list) => {
      const withPlacement = list.filter((c) => (c.inboxCount != null && c.inboxCount > 0) || (c.spamCount != null && c.spamCount > 0))
      const inbox = withPlacement.reduce((s, c) => s + (c.inboxCount ?? 0), 0)
      const spam = withPlacement.reduce((s, c) => s + (c.spamCount ?? 0), 0)
      const total = inbox + spam
      return { inbox, spam, total, pct: total > 0 ? (inbox / total) * 100 : null }
    }

    const rep = houseFileCampaigns.filter((c) => c.entity?.party?.toLowerCase() === "republican" || c.entity?.party?.toLowerCase() === "r")
    const dem = houseFileCampaigns.filter((c) => c.entity?.party?.toLowerCase() === "democrat" || c.entity?.party?.toLowerCase() === "d")

    console.log(period.label, "TOTAL housefile campaigns:", houseFileCampaigns.length, "of", campaigns.length)
    console.log("  Republican:", calc(rep))
    console.log("  Democrat:", calc(dem))
    console.log("  Total:", calc(houseFileCampaigns))

    // Check distinct party values present
    const parties = new Set(campaigns.map((c) => c.entity?.party))
    console.log("  Distinct party values seen:", [...parties])
  }
  await prisma.$disconnect()
}
run().catch((e) => { console.error(e); process.exit(1) })
