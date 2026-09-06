import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { getMobileUserProfile } from "@/lib/services/user-service"

// GET /api/mobile/v1/auth/me — current user + client profile, built from the
// freshly-loaded database record (never from token claims).
export const GET = withMobileAuth(async (_request, ctx) => {
  const profile = await getMobileUserProfile(ctx.userId)
  return mobileJson(profile)
})
