import prisma from "@/lib/prisma"

/**
 * Shared user-profile shape for the mobile API. Deliberately mirrors (but does not
 * import from) app/api/auth/me/route.ts — the web route is left untouched per the
 * mobile-readiness constraints, but the response shape is intentionally similar so
 * mobile clients can reuse the same TypeScript types as the web app.
 */
export async function getMobileUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      firstLogin: true,
      client: {
        select: {
          id: true,
          name: true,
          slug: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          hasCompetitiveInsights: true,
          trialExpiresAt: true,
        },
      },
    },
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    firstLogin: user.firstLogin,
    client: user.client,
  }
}
