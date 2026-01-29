// Script to generate Prisma client and verify setup
const { exec } = require("child_process")
const fs = require("fs")
const path = require("path")

async function generatePrismaClient() {
  console.log("[v0] Starting Prisma client generation...")

  try {
    // Check if schema.prisma exists
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma")
    if (!fs.existsSync(schemaPath)) {
      console.error("[v0] Error: prisma/schema.prisma not found!")
      return false
    }

    console.log("[v0] Found schema.prisma, generating client...")

    // Generate Prisma client
    await new Promise((resolve, reject) => {
      exec("npx prisma generate", (error, stdout, stderr) => {
        if (error) {
          console.error("[v0] Error generating Prisma client:", error)
          reject(error)
          return
        }

        console.log("[v0] Prisma generate output:", stdout)
        if (stderr) {
          console.log("[v0] Prisma generate stderr:", stderr)
        }

        resolve(stdout)
      })
    })

    // Check if client was generated successfully
    const clientPath = path.join(process.cwd(), "node_modules", ".prisma", "client")
    if (fs.existsSync(clientPath)) {
      console.log("[v0] ✅ Prisma client generated successfully!")

      // List generated files
      const files = fs.readdirSync(clientPath)
      console.log("[v0] Generated files:", files)

      return true
    } else {
      console.error("[v0] ❌ Prisma client generation failed - client directory not found")
      return false
    }
  } catch (error) {
    console.error("[v0] Error during Prisma client generation:", error)
    return false
  }
}

// Run the generation
generatePrismaClient()
  .then((success) => {
    if (success) {
      console.log("[v0] 🎉 Prisma setup completed successfully!")
    } else {
      console.log("[v0] ❌ Prisma setup failed - please check the errors above")
    }
  })
  .catch((error) => {
    console.error("[v0] Fatal error:", error)
  })
