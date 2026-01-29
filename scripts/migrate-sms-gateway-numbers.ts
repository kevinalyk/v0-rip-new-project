import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function migrateSMSGatewayNumbers() {
  console.log("🔍 Starting SMS gateway number migration...")

  try {
    // Find all SMS campaigns where sender starts with 763257
    const gatewayCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        type: "sms",
        sender: {
          startsWith: "763257",
        },
      },
    })

    console.log(`📊 Found ${gatewayCampaigns.length} campaigns from gateway numbers`)

    if (gatewayCampaigns.length === 0) {
      console.log("✅ No campaigns to migrate")
      return
    }

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const campaign of gatewayCampaigns) {
      try {
        // Parse the message body to extract short code
        const bodyMatch = campaign.messageBody?.match(/^(\d{5,6})\s*\|\s*(.+)$/s)

        if (bodyMatch) {
          const [, shortCode, cleanMessage] = bodyMatch

          // Update the campaign
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              sender: shortCode,
              messageBody: cleanMessage.trim(),
            },
          })

          console.log(`✓ Updated campaign ${campaign.id}: ${campaign.sender} → ${shortCode}`)
          updated++
        } else {
          console.log(`⚠ Skipped campaign ${campaign.id}: No short code pattern found in message body`)
          skipped++
        }
      } catch (error) {
        console.error(`✗ Error updating campaign ${campaign.id}:`, error)
        errors++
      }
    }

    console.log("\n📈 Migration Summary:")
    console.log(`   ✅ Updated: ${updated}`)
    console.log(`   ⚠️  Skipped: ${skipped}`)
    console.log(`   ❌ Errors: ${errors}`)
    console.log(`   📊 Total: ${gatewayCampaigns.length}`)
  } catch (error) {
    console.error("❌ Migration failed:", error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the migration
migrateSMSGatewayNumbers()
  .then(() => {
    console.log("\n✨ Migration completed successfully!")
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n💥 Migration failed:", error)
    process.exit(1)
  })
