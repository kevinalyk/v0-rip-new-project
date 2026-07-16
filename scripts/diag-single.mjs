import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Exact query from diag-ctalinks.mjs that worked before - one query only
const rows = await prisma.$queryRawUnsafe(`
  SELECT link->>'finalUrl' AS final_url
  FROM "CompetitiveInsightCampaign" c,
    jsonb_array_elements(c."ctaLinks") AS link
  WHERE c.id = 'cmpwy400u00241rrsubo9nygk'
    AND (link->>'finalUrl') ILIKE '%winred.com%'
  LIMIT 1
`)

console.log('Result:', rows)
await prisma.$disconnect()
