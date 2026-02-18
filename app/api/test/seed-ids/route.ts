import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    const outlookEmails = await prisma.seedEmail.findMany({
      where: {
        OR: [
          { provider: "outlook" },
          { provider: "microsoft" },
          { email: { contains: "outlook.com" } },
          { email: { contains: "hotmail.com" } },
          { email: { contains: "live.com" } },
        ],
      },
      select: {
        id: true,
        email: true,
        provider: true,
      },
    })

    return NextResponse.json({
      outlookEmails,
      count: outlookEmails.length,
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch seed emails" }, { status: 500 })
  }
}
