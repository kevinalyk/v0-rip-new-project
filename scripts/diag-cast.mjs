import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// ctaLinks is stored as TEXT - must cast to jsonb before array_elements
const t1 = await prisma.$queryRawUnsafe(`
  SELECT link->>'finalUrl' AS final_url
  FROM "CompetitiveInsightCampaign" c,
    jsonb_array_elements(c."ctaLinks"::jsonb) AS link
  WHERE c.id = 'cmpwy400u00241rrsubo9nygk'
    AND (link->>'finalUrl') ILIKE '%winred.com%'
  LIMIT 1
`)
console.log('Cross join with ::jsonb cast:', t1[0]?.final_url)

// Now test correlated subquery with ::jsonb cast
const t2 = await prisma.$queryRawUnsafe(`
  SELECT DISTINCT ON (c.subject)
    c.subject,
    c.id,
    c."shareToken",
    (
      SELECT link->>'finalUrl'
      FROM jsonb_array_elements(c."ctaLinks"::jsonb) AS link
      WHERE (link->>'finalUrl') ILIKE '%winred.com%'
         OR (link->>'finalUrl') ILIKE '%actblue.com%'
      LIMIT 1
    ) AS donation_url
  FROM "CompetitiveInsightCampaign" c
  WHERE c.subject = '7 Republican VIPs reached out before our 35X IMPACT!'
    AND c."isHidden" = false
    AND c."isDeleted" = false
  ORDER BY c.subject, c."dateReceived" DESC
  LIMIT 1
`)
console.log('Correlated subquery with ::jsonb cast:', t2[0]?.donation_url)

await prisma.$disconnect()
