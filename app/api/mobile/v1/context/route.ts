import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"

// GET /api/mobile/v1/context — current user + client context for app bootstrap.
export const GET = withMobileAuth(async (_request, ctx) => {
  return mobileJson({
    userId: ctx.userId,
    role: ctx.role,
    firstLogin: ctx.firstLogin,
    client: ctx.client,
  })
})
