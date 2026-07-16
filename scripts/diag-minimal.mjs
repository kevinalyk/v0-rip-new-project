import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Test 1: what the original working script does - CROSS JOIN (not correlated subquery)
const t1 = await prisma.$queryRawUnsafe(`
  SELECT link->>'finalUrl' AS final_url
  FROM "CompetitiveInsightCampaign" c,
    jsonb_array_elements(c."ctaLinks") AS link
  WHERE c.id = 'cmpwy400u00241rrsubo9nygk'
    AND (link->>'finalUrl') ILIKE '%winred.com%'
  LIMIT 1
`)
console.log('Cross join (original working approach):', t1[0]?.final_url)

// Test 2: correlated subquery on direct table reference (no CTE/derived table)
const t2 = await prisma.$queryRawUnsafe(`
  SELECT
    c.id,
    (
      SELECT link->>'finalUrl'
      FROM jsonb_array_elements(c."ctaLinks") AS link
      WHERE (link->>'finalUrl') ILIKE '%winred.com%'
      LIMIT 1
    ) AS donation_url
  FROM "CompetitiveInsightCampaign" c
  WHERE c.id = 'cmpwy400u00241rrsubo9nygk'
`)
console.log('Correlated subquery on direct table:', t2[0]?.donation_url)

// Test 3: same but with DISTINCT ON
const t3 = await prisma.$queryRawUnsafe(`
  SELECT DISTINCT ON (c.subject)
    c.subject,
    c.id,
    (
      SELECT link->>'finalUrl'
      FROM jsonb_array_elements(c."ctaLinks") AS link
      WHERE (link->>'finalUrl') ILIKE '%winred.com%'
      LIMIT 1
    ) AS donation_url
  FROM "CompetitiveInsightCampaign" c
  WHERE c.subject = '7 Republican VIPs reached out before our 35X IMPACT!'
  ORDER BY c.subject, c."dateReceived" DESC
`)
console.log('DISTINCT ON + correlated subquery:', t3[0]?.donation_url)

await prisma.$disconnect()
