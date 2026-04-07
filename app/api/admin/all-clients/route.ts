import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// Normalize the messy subscription plan values into clean display tiers
// Based on actual DB values:
//   "free" / "starter"                   → Free
//   "basic" / "basic_inboxing" / "paid"  → Basic        (Stripe writes "paid" for Basic)
//   "all" / "professional" / "pro"       → Professional (Stripe writes "all" for Pro)
//   "enterprise"                         → Enterprise   (manually provisioned top-tier)
function normalizeTier(plan: string): { label: string; color: string } {
  const p = plan?.toLowerCase() ?? ""
  if (p === "free" || p === "starter" || p === "") {
    return { label: "Free", color: "secondary" }
  }
  if (p === "basic" || p === "basic_inboxing" || p === "paid") {
    return { label: "Basic", color: "default" }
  }
  if (p === "all" || p === "professional" || p === "pro") {
    return { label: "Professional", color: "destructive" }
  }
  if (p === "enterprise") {
    return { label: "Enterprise", color: "enterprise" }
  }
  return { label: plan ?? "Unknown", color: "outline" }
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        hasCompetitiveInsights: true,
        emailVolumeLimit: true,
        emailVolumeUsed: true,
        subscriptionRenewDate: true,
        cancelAtPeriodEnd: true,
        totalUsers: true,
        createdAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        users: {
          where: { role: { in: ["owner", "admin"] } },
          select: { firstName: true, lastName: true, email: true, role: true },
          take: 1,
          orderBy: { createdAt: "asc" },
        },
      },
    })

    const result = clients.map((c) => ({
      ...c,
      tier: normalizeTier(c.subscriptionPlan),
      ownerName:
        c.users[0]
          ? [c.users[0].firstName, c.users[0].lastName].filter(Boolean).join(" ") || c.users[0].email
          : null,
      ownerEmail: c.users[0]?.email ?? null,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error fetching all clients:", error)
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 })
  }
}
