const { PrismaClient } = require("@prisma/client")
const bcryptjs = require("bcryptjs")

const prisma = new PrismaClient()

async function fixSeedData() {
  try {
    console.log("Starting seed data fix...")

    // Create default domain if it doesn't exist
    let defaultDomain = await prisma.domain.findUnique({
      where: { domain: "default.rip-tool.com" },
    })

    if (!defaultDomain) {
      console.log("Creating default domain...")
      defaultDomain = await prisma.domain.create({
        data: {
          name: "Default Organization",
          domain: "default.rip-tool.com",
          description: "Default domain for initial setup",
          dataRetentionDays: 90,
          active: true,
        },
      })
      console.log("Default domain created:", defaultDomain.id)
    } else {
      console.log("Default domain already exists:", defaultDomain.id)
    }

    // Get all admin users
    const adminUsers = await prisma.user.findMany({
      where: { role: "admin" },
    })

    console.log(`Found ${adminUsers.length} admin users`)

    // Give all admin users access to the default domain
    for (const user of adminUsers) {
      const existingAccess = await prisma.userDomainAccess.findFirst({
        where: {
          userId: user.id,
          domainId: defaultDomain.id,
        },
      })

      if (!existingAccess) {
        await prisma.userDomainAccess.create({
          data: {
            userId: user.id,
            domainId: defaultDomain.id,
            role: "admin",
          },
        })
        console.log(`Added domain access for user: ${user.email}`)
      } else {
        console.log(`Domain access already exists for user: ${user.email}`)
      }
    }

    console.log("Seed data fix completed successfully!")
  } catch (error) {
    console.error("Error fixing seed data:", error)
  } finally {
    await prisma.$disconnect()
  }
}

fixSeedData()
