import { MobileAuthError, mobileError, mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireCompetitiveInsights } from "@/lib/services/authz"
import {
  getFollowingPushPreference,
  registerMobilePushToken,
  setFollowingPushPreference,
  unregisterMobilePushToken,
} from "@/lib/services/mobile-push-token-service"

type PushTokenBody = {
  expoPushToken?: string
  deviceId?: string
  platform?: string
  followingEnabled?: boolean
}

async function readBody(request: Request): Promise<PushTokenBody> {
  try {
    return await request.json()
  } catch {
    throw new MobileAuthError(400, "INVALID_BODY", "Request body must be valid JSON")
  }
}

export const GET = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  try {
    const deviceId = new URL(request.url).searchParams.get("deviceId") || undefined
    return mobileJson({ data: await getFollowingPushPreference(ctx.userId, deviceId) })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})

export const POST = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  try {
    return mobileJson({ data: await registerMobilePushToken(ctx.userId, await readBody(request)) })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})

export const PATCH = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  try {
    const { deviceId, followingEnabled } = await readBody(request)
    return mobileJson({
      data: await setFollowingPushPreference(ctx.userId, deviceId, followingEnabled),
    })
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
