import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const rows = await prisma.$queryRawUnsafe(`
  SELECT
    r.subject,
    r.example_id,
    (
      SELECT link->>'finalUrl'
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(r.cta_links) = 'array' THEN r.cta_links ELSE '[]'::jsonb END
      ) AS link
      WHERE (link->>'finalUrl') ILIKE '%winred.com%'
         OR (link->>'finalUrl') ILIKE '%actblue.com%'
      LIMIT 1
    ) AS donation_url
  FROM (
    SELECT DISTINCT ON (c.subject)
      c.subject,
      c.id AS example_id,
      c."ctaLinks" AS cta_links
    FROM "CompetitiveInsightCampaign" c
    WHERE c."isHidden" = false
      AND c."isDeleted" = false
      AND c.subject IN (
        '7 Republican VIPs reached out before our 35X IMPACT!',
        'I''d be remiss if I didn''t warn you immediately'
      )
    ORDER BY c.subject, c."dateReceived" DESC
  ) r
`)

for (const row of rows) {
  console.log('subject:', row.subject.slice(0, 55))
  console.log('  donation_url:', row.donation_url)
}

await prisma.$disconnect()
