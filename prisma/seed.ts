import prisma from "@/lib/prisma"
import bcryptjs from "bcryptjs"

async function main() {
  // Create example client domains (these represent companies that send emails)
  const exampleDomain1 = await prisma.domain.upsert({
    where: { domain: "example-client1.com" },
    update: {},
    create: {
      name: "Example Client 1",
      domain: "example-client1.com",
      description: "Example client domain for testing - represents a company that sends emails",
      dataRetentionDays: 90,
      active: true,
    },
  })

  const exampleDomain2 = await prisma.domain.upsert({
    where: { domain: "example-client2.com" },
    update: {},
    create: {
      name: "Example Client 2",
      domain: "example-client2.com",
      description: "Another example client domain - different retention period",
      dataRetentionDays: 180,
      active: true,
    },
  })

  console.log("Created client domains:", exampleDomain1.name, exampleDomain2.name)

  // Create RIP employee accounts (these are the people who monitor the campaigns)
  const adminPassword = await bcryptjs.hash("Temp123!", 10)

  const ryan = await prisma.user.upsert({
    where: { email: "ryanlyk@gmail.com" },
    update: {},
    create: {
      email: "ryanlyk@gmail.com",
      firstName: "Ryan",
      lastName: "Lyk",
      password: adminPassword,
      role: "admin",
      firstLogin: true,
    },
  })

  const austin = await prisma.user.upsert({
    where: { email: "austin@redsparkstrategy.com" },
    update: {},
    create: {
      email: "austin@redsparkstrategy.com",
      firstName: "Austin",
      lastName: "",
      password: adminPassword,
      role: "admin",
      firstLogin: true,
    },
  })

  const kevin = await prisma.user.upsert({
    where: { email: "kevinalyk@gmail.com" },
    update: {},
    create: {
      email: "kevinalyk@gmail.com",
      firstName: "Kevin",
      lastName: "Lyk",
      password: adminPassword,
      role: "admin",
      firstLogin: true,
    },
  })

  console.log("Created RIP employee accounts:", ryan.email, austin.email, kevin.email)

  // Give admin users access to all client domains
  // Ryan gets access to both domains as admin
  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: ryan.id,
        domainId: exampleDomain1.id,
      },
    },
    update: {},
    create: {
      userId: ryan.id,
      domainId: exampleDomain1.id,
      role: "admin",
    },
  })

  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: ryan.id,
        domainId: exampleDomain2.id,
      },
    },
    update: {},
    create: {
      userId: ryan.id,
      domainId: exampleDomain2.id,
      role: "admin",
    },
  })

  // Austin gets access to both domains as admin
  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: austin.id,
        domainId: exampleDomain1.id,
      },
    },
    update: {},
    create: {
      userId: austin.id,
      domainId: exampleDomain1.id,
      role: "admin",
    },
  })

  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: austin.id,
        domainId: exampleDomain2.id,
      },
    },
    update: {},
    create: {
      userId: austin.id,
      domainId: exampleDomain2.id,
      role: "admin",
    },
  })

  // Kevin gets access to both domains as admin
  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: kevin.id,
        domainId: exampleDomain1.id,
      },
    },
    update: {},
    create: {
      userId: kevin.id,
      domainId: exampleDomain1.id,
      role: "admin",
    },
  })

  await prisma.userDomainAccess.upsert({
    where: {
      userId_domainId: {
        userId: kevin.id,
        domainId: exampleDomain2.id,
      },
    },
    update: {},
    create: {
      userId: kevin.id,
      domainId: exampleDomain2.id,
      role: "admin",
    },
  })

  console.log("Assigned domain access to all admin users")

  // Create default system settings
  await prisma.setting.upsert({
    where: { key: "internalEmail" },
    update: {},
    create: {
      key: "internalEmail",
      value: "inbox@rip-tool.com",
    },
  })

  await prisma.setting.upsert({
    where: { key: "processingFrequency" },
    update: {},
    create: {
      key: "processingFrequency",
      value: "realtime",
    },
  })

  await prisma.setting.upsert({
    where: { key: "campaignGrouping" },
    update: {},
    create: {
      key: "campaignGrouping",
      value: "subject",
    },
  })

  await prisma.setting.upsert({
    where: { key: "dataRetention" },
    update: {},
    create: {
      key: "dataRetention",
      value: "90",
    },
  })

  console.log("Database seeded with:")
  console.log("- Client domains: example-client1.com (90 days), example-client2.com (180 days)")
  console.log("- RIP employee accounts: Ryan, Austin, Kevin (all admins)")
  console.log("- All admins have access to all client domains")
  console.log("- Default system settings")
  console.log("")
  console.log("🎯 Model: Domains = Client companies, Users = RIP employees who monitor them")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
