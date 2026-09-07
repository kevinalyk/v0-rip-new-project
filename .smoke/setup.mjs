// Disposable fixture setup for the PR #575 live Preview smoke test.
// Every row created here is tagged with the MOBILE_FEED_FILTER_SMOKE_TEST_ prefix
// so cleanup.mjs can find and delete every one of them deterministically.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()
const PREFIX = "MOBILE_FEED_FILTER_SMOKE_TEST_"
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function main() {
  const passwordHash = await bcrypt.hash("SmokeTest123!Aa", 10)

  const clientA = await prisma.client.create({
    data: {
      id: `${PREFIX}client_a`,
      name: `${PREFIX}Client_A`,
      slug: `${PREFIX.toLowerCase()}client-a`,
      active: true,
      dataRetentionDays: 30,
      subscriptionPlan: "enterprise",
      subscriptionStatus: "active",
      hasCompetitiveInsights: true,
    },
  })

  const clientB = await prisma.client.create({
    data: {
      id: `${PREFIX}client_b`,
      name: `${PREFIX}Client_B`,
      slug: `${PREFIX.toLowerCase()}client-b`,
      active: true,
      dataRetentionDays: 90,
      subscriptionPlan: "free",
      subscriptionStatus: "active",
      hasCompetitiveInsights: true,
    },
  })

  const userA = await prisma.user.create({
    data: {
      id: `${PREFIX}user_a`,
      email: `${PREFIX.toLowerCase()}user_a@example.invalid`,
      password: passwordHash,
      role: "viewer",
      clientId: clientA.id,
      firstLogin: false,
    },
  })

  const userB = await prisma.user.create({
    data: {
      id: `${PREFIX}user_b`,
      email: `${PREFIX.toLowerCase()}user_b@example.invalid`,
      password: passwordHash,
      role: "viewer",
      clientId: clientB.id,
      firstLogin: false,
    },
  })

  const entities = await Promise.all([
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_rep`, name: `${PREFIX}Entity_Republican`, type: "politician", party: "republican", state: "CA" },
    }),
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_dem`, name: `${PREFIX}Entity_Democrat`, type: "politician", party: "democrat", state: "NY" },
    }),
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_ind`, name: `${PREFIX}Entity_Independent`, type: "politician", party: "independent", state: "TX" },
    }),
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_ind_legacy`, name: `${PREFIX}Entity_IndLegacy`, type: "pac", party: "ind", state: "FL" },
    }),
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_org`, name: `${PREFIX}Entity_Org`, type: "organization", party: null, state: null },
    }),
    prisma.ciEntity.create({
      data: { id: `${PREFIX}entity_broker`, name: `${PREFIX}Entity_Broker`, type: "data_broker", party: null, state: null },
    }),
  ])
  const [entityRep, entityDem, entityInd, entityIndLegacy, entityOrg, entityBroker] = entities

  await Promise.all([
    prisma.ciEntityMapping.create({
      data: {
        id: `${PREFIX}mapping_rep`,
        entityId: entityRep.id,
        senderEmail: `${PREFIX.toLowerCase()}rep@smoke-sender.invalid`,
        senderDomain: "smoke-sender.invalid",
        senderPhone: "+15550000001",
      },
    }),
    prisma.ciEntityMapping.create({
      data: {
        id: `${PREFIX}mapping_dem`,
        entityId: entityDem.id,
        senderEmail: `${PREFIX.toLowerCase()}dem@smoke-sender.invalid`,
        senderDomain: "smoke-sender.invalid",
        senderPhone: "+15550000002",
      },
    }),
  ])

  // Campaigns (email). isThirdParty=null rows exercise the legacy-classification path.
  const campaignDefs = [
    { id: "c1_rep_house_winred", entityId: entityRep.id, senderEmail: `${PREFIX.toLowerCase()}rep@smoke-sender.invalid`, isThirdParty: false, donationPlatform: "winred", days: 5, subject: `${PREFIX}c1 house file winred` },
    { id: "c2_rep_thirdparty_actblue", entityId: entityRep.id, senderEmail: "stranger@other-sender.invalid", isThirdParty: true, donationPlatform: "actblue", days: 10, subject: `${PREFIX}c2 third party actblue` },
    { id: "c3_dem_legacy_anedot", entityId: entityDem.id, senderEmail: `${PREFIX.toLowerCase()}dem@smoke-sender.invalid`, isThirdParty: null, donationPlatform: null, ctaLinks: ["https://anedot.com/give/smoke"], days: 3, subject: `${PREFIX}c3 legacy anedot domain-fallback` },
    { id: "c4_ind_house_psq", entityId: entityInd.id, senderEmail: "psq-sender@other-sender.invalid", isThirdParty: false, donationPlatform: "psq", days: 1, subject: `${PREFIX}c4 independent psq` },
    { id: "c5_broker_excluded", entityId: entityBroker.id, senderEmail: "broker@other-sender.invalid", isThirdParty: false, donationPlatform: "winred", days: 1, subject: `${PREFIX}c5 data broker must never appear` },
    { id: "c6_rep_outside_retention", entityId: entityRep.id, senderEmail: "old@other-sender.invalid", isThirdParty: false, donationPlatform: "winred", days: 40, subject: `${PREFIX}c6 outside retention window` },
    { id: "c7_indlegacy_house_tag", entityId: entityIndLegacy.id, senderEmail: "ind-legacy@other-sender.invalid", isThirdParty: false, donationPlatform: null, days: 2, subject: `${PREFIX}c7 ind-legacy tagged` },
    { id: "c8_org_substack", entityId: entityOrg.id, senderEmail: `${PREFIX.toLowerCase()}sender@substack.com`, isThirdParty: false, donationPlatform: null, days: 6, subject: `${PREFIX}c8 substack sender-domain` },
    { id: "c9_org_ngpvan", entityId: entityOrg.id, senderEmail: "ngpvan-sender@other-sender.invalid", isThirdParty: false, donationPlatform: null, ctaLinks: ["https://secure.ngpvan.com/smoke"], days: 7, subject: `${PREFIX}c9 ngpvan domain-fallback` },
  ]

  for (const c of campaignDefs) {
    await prisma.competitiveInsightCampaign.create({
      data: {
        id: `${PREFIX}${c.id}`,
        senderName: `${PREFIX}Sender`,
        senderEmail: c.senderEmail,
        subject: c.subject,
        dateReceived: daysAgo(c.days),
        entityId: c.entityId,
        isThirdParty: c.isThirdParty,
        donationPlatform: c.donationPlatform,
        ctaLinks: c.ctaLinks ?? undefined,
        source: "seed",
      },
    })
  }

  // SMS
  const smsDefs = [
    { id: "s1_rep_house", entityId: entityRep.id, phoneNumber: "+15550000001", isThirdParty: false, ctaLinks: "https://winred.com/smoke", days: 4, message: `${PREFIX}s1 house file` },
    { id: "s2_dem_thirdparty", entityId: entityDem.id, phoneNumber: "+19995551234", isThirdParty: true, ctaLinks: null, days: 8, message: `${PREFIX}s2 third party` },
  ]
  for (const s of smsDefs) {
    await prisma.smsQueue.create({
      data: {
        id: `${PREFIX}${s.id}`,
        rawData: "{}",
        processed: true,
        phoneNumber: s.phoneNumber,
        message: s.message,
        entityId: s.entityId,
        isThirdParty: s.isThirdParty,
        ctaLinks: s.ctaLinks,
        source: "seed",
        createdAt: daysAgo(s.days),
      },
    })
  }

  await prisma.entityTag.create({
    data: { id: `${PREFIX}tag1`, clientId: clientA.id, entityId: entityIndLegacy.id, tagName: "SmokeTag", tagColor: "#FF5733", createdBy: userA.id },
  })

  await prisma.ciEntitySubscription.create({
    data: { id: `${PREFIX}sub1`, clientId: clientA.id, entityId: entityDem.id },
  })

  console.log(JSON.stringify({
    clientAId: clientA.id,
    clientBId: clientB.id,
    userAEmail: userA.email,
    userBEmail: userB.email,
    password: "SmokeTest123!Aa",
    entityRepId: entityRep.id,
    entityDemId: entityDem.id,
    entityIndId: entityInd.id,
    entityIndLegacyId: entityIndLegacy.id,
    entityOrgId: entityOrg.id,
    entityBrokerId: entityBroker.id,
    tagName: "SmokeTag",
  }, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
