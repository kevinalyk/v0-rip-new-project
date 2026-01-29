// Temporary workaround for v0 environment where Prisma client generation may not work
// This creates a mock client to prevent import errors

// Try to import PrismaClient, fall back to mock if not available
let PrismaClient: any

try {
  // Attempt to import the real PrismaClient
  const prismaModule = require("@prisma/client")
  PrismaClient = prismaModule.PrismaClient
} catch (error) {
  console.warn("PrismaClient not available, using mock client for v0 environment")

  // Create a mock PrismaClient for development/preview purposes
  PrismaClient = class MockPrismaClient {
    constructor(options?: any) {
      console.log("Using mock PrismaClient - database operations will not work")
    }

    // Mock all the model methods that are used in the codebase
    user = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    seedEmail = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    client = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    clientSeedEmail = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    campaign = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    domain = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    userDomainAccess = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    setting = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    result = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    // Mock all the new model methods for blocked domains feature
    blockedDomain = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    engagementLog = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    emailContent = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    userInvitation = {
      findMany: async () => [],
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => ({}),
      update: async () => ({}),
      upsert: async () => ({}),
      delete: async () => ({}),
      deleteMany: async () => ({ count: 0 }),
    }

    // Mock utility methods
    $queryRaw = async () => []
    $executeRaw = async () => 0
    $disconnect = async () => {}
    $connect = async () => {}
    $transaction = async (callback: any) => {
      // Execute the callback with this mock client
      return callback(this)
    }
  }
}

// Use globalThis for cross-environment compatibility (works in both Node.js and browser)
// PrismaClient is attached to prevent exhausting database connection limit
const globalForPrisma = (typeof globalThis !== "undefined" ? globalThis : {}) as unknown as { prisma: any }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
    datasources: {
      db: {
        url: process.env.DATABASE_URL || "postgresql://mock:mock@localhost:5432/mock",
      },
    },
    errorFormat: "pretty",
  })

// Only set global in non-production environments and when globalThis is available
if (process.env.NODE_ENV !== "production" && typeof globalThis !== "undefined") {
  globalForPrisma.prisma = prisma
}

// Simplified warmup function for mock environment
async function warmupDatabase() {
  try {
    console.log("Warming up database connection...")

    if (prisma.$queryRaw) {
      await prisma.$queryRaw`SELECT 1`
      console.log("Database connection established and warmed up")
    } else {
      console.log("Mock database client - no actual connection")
    }

    return true
  } catch (error) {
    console.error("Error warming up database:", error)
    return false
  }
}

export async function ensureDatabaseConnection() {
  try {
    // Simple connection test without explicit connect/disconnect
    // Prisma handles connection pooling automatically in serverless
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error("Failed to establish database connection:", error)
    return false
  }
}

// Only warm up in production
if (process.env.NODE_ENV === "production") {
  warmupDatabase()
}

export default prisma

// Export the PrismaClient class for compatibility
export { PrismaClient }
