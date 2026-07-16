import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const rows = await prisma.$queryRawUnsafe(`
  SELECT
    id,
    pg_typeof("ctaLinks")::text AS col_type,
    "ctaLinks"::text AS raw_value
  FROM "CompetitiveInsightCampaign"
  WHERE subject = '7 Republican VIPs reached out before our 35X IMPACT!'
  ORDER BY "dateReceived" DESC
  LIMIT 1
`)

if (rows.length) {
  const d = rows[0]
  console.log('id:', d.id)
  console.log('col_type:', d.col_type)
  console.log('raw_value:', String(d.raw_value ?? 'NULL').slice(0, 1200))
} else {
  console.log('No row found')
}

// Also test the jsonb extraction directly
const extraction = await prisma.$queryRawUnsafe(`
  SELECT
    c.id,
    link->>'finalUrl' AS final_url,
    link->>'url' AS url,
    link->>'type' AS type
  FROM "CompetitiveInsightCampaign" c,
    jsonb_array_elements(
      CASE WHEN jsonb_typeof(c."ctaLinks") = 'array' THEN c."ctaLinks" ELSE '[]'::jsonb END
    ) AS link
  WHERE c.subject = '7 Republican VIPs reached out before our 35X IMPACT!'
  ORDER BY c."dateReceived" DESC
  LIMIT 20
`)

console.log('\n--- jsonb_array_elements extraction (up to 20 links from most recent send) ---')
for (const r of extraction) {
  console.log(`  type=${r.type} | finalUrl=${r.final_url} | url=${r.url}`)
}

await prisma.$disconnect()
