import { MobileAuthError, mobileError, mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireMobileAlerts } from "@/lib/services/authz"
import { registerMobilePushToken, unregisterMobilePushToken } from "@/lib/services/mobile-push-token-service"

type PushTokenBody = { expoPushToken?: string; deviceId?: string; platform?: string }

async function readBody(request: Request): Promise<PushTokenBody> {
  try {
    return await request.json()
  } catch {
    throw new MobileAuthError(400, "INVALID_BODY", "Request body must be valid JSON")
  }
}

export const POST = withMobileAuth(async (request, ctx) => {
  requireMobileAlerts(ctx)
  try {
    return mobileJson({ data: await registerMobilePushToken(ctx.userId, await readBody(request)) })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})

export const DELETE = withMobileAuth(async (request, ctx) => {
  try {
    const { deviceId } = await readBody(request)
    await unregisterMobilePushToken(ctx.userId, deviceId)
    return mobileJson({ ok: true })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})
