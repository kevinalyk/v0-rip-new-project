import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    console.log("Health check: Testing database connection...")

    // Try to connect to the database
    await prisma.$connect()
    console.log("Health check: Database connection successful")

    // Run a simple query to verify the connection
    const result = await prisma.$queryRaw`SELECT 1 as alive`
    console.log("Health check: Database query successful", result)

    return NextResponse.json({
      status: "ok",
      database: "connected",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Health check: Database connection failed", error)
    return NextResponse.json(
      {
        status: "error",
        database: "disconnected",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  } finally {
    // Explicitly disconnect to prevent connection pool exhaustion
    await prisma.$disconnect()
  }
}
