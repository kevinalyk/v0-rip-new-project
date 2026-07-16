import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Check if ctaLinks is null on that specific row right now
const r = await prisma.competitiveInsightCampaign.findUnique({
  where: { id: 'cmpwy400u00241rrsubo9nygk' },
  select: { ctaLinks: true, subject: true, dateReceived: true }
})
console.log('ctaLinks is null?', r?.ctaLinks === null)
console.log('ctaLinks type:', typeof r?.ctaLinks)
console.log('ctaLinks value:', JSON.stringify(r?.ctaLinks)?.slice(0, 200))

// Check most recent campaign for that subject
const recent = await prisma.competitiveInsightCampaign.findFirst({
  where: {
    subject: '7 Republican VIPs reached out before our 35X IMPACT!',
    isHidden: false,
    isDeleted: false,
  },
  orderBy: { dateReceived: 'desc' },
  select: { id: true, dateReceived: true, ctaLinks: true }
})
console.log('\nMost recent for that subject:')
console.log('id:', recent?.id)
console.log('dateReceived:', recent?.dateReceived)
console.log('ctaLinks null?', recent?.ctaLinks === null)
console.log('ctaLinks:', JSON.stringify(recent?.ctaLinks)?.slice(0, 300))

await prisma.$disconnect()
