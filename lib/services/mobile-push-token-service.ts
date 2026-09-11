import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"

const EXPO_PUSH_TOKEN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,}\]$/

export function validateMobileDeviceId(deviceId: string | undefined): string {
  const normalized = deviceId?.trim()
  if (!normalized || normalized.length > 100) {
    throw new MobileAuthError(400, "INVALID_DEVICE", "A valid device ID is required")
  }
  return normalized
}

export function validateFollowingPushPreference(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new MobileAuthError(400, "INVALID_PREFERENCE", "followingEnabled must be a boolean")
  }
  return value
}

export function validateMobilePushTokenInput(
  input: { expoPushToken?: string; deviceId?: string; platform?: string },
): { token: string; deviceId: string } {
  const token = input.expoPushToken?.trim()
  let deviceId: string
  try {
    deviceId = validateMobileDeviceId(input.deviceId)
  } catch {
    throw new MobileAuthError(400, "INVALID_PUSH_TOKEN", "A valid device notification token is required")
  }
  if (!token || !EXPO_PUSH_TOKEN.test(token)) {
    throw new MobileAuthError(400, "INVALID_PUSH_TOKEN", "A valid device notification token is required")
  }
  if (input.platform !== "ios") {
    throw new MobileAuthError(400, "INVALID_PLATFORM", "Only iOS notification tokens are supported")
  }
  return { token, deviceId }
}

export async function registerMobilePushToken(
  userId: string,
  input: { expoPushToken?: string; deviceId?: string; platform?: string; followingEnabled?: boolean },
) {
  const { token, deviceId } = validateMobilePushTokenInput(input)
  const followingEnabled = input.followingEnabled === undefined
    ? undefined
    : validateFollowingPushPreference(input.followingEnabled)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.mobilePushToken.deleteMany({
      where: { userId, deviceId, expoPushToken: { not: token } },
    })
    return tx.mobilePushToken.upsert({
      where: { expoPushToken: token },
      create: {
        userId,
        expoPushToken: token,
        deviceId,
        platform: "ios",
        followingEnabled: followingEnabled ?? false,
      },
      update: {
        userId,
        deviceId,
        platform: "ios",
        enabled: true,
        lastSeenAt: new Date(),
        ...(followingEnabled === undefined ? {} : { followingEnabled }),
      },
      select: { id: true, enabled: true, followingEnabled: true, lastSeenAt: true },
    })
  })
}

export async function getFollowingPushPreference(userId: string, rawDeviceId: string | undefined) {
  const deviceId = validateMobileDeviceId(rawDeviceId)
  const token = await prisma.mobilePushToken.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
    select: { enabled: true, followingEnabled: true, lastSeenAt: true },
  })
  return {
    registered: Boolean(token),
    enabled: Boolean(token?.enabled && token.followingEnabled),
    lastSeenAt: token?.lastSeenAt ?? null,
  }
}

export async function setFollowingPushPreference(
  userId: string,
  rawDeviceId: string | undefined,
  followingEnabled: unknown,
) {
  const deviceId = validateMobileDeviceId(rawDeviceId)
  const normalizedPreference = validateFollowingPushPreference(followingEnabled)
  const result = await prisma.mobilePushToken.updateMany({
    where: { userId, deviceId },
    data: { followingEnabled: normalizedPreference, lastSeenAt: new Date() },
  })
  if (result.count === 0) {
    throw new MobileAuthError(404, "PUSH_TOKEN_NOT_FOUND", "Enable iPhone notifications before changing this preference")
  }
  return getFollowingPushPreference(userId, deviceId)
}

export async function unregisterMobilePushToken(userId: string, deviceId: string | undefined) {
  await prisma.mobilePushToken.deleteMany({ where: { userId, deviceId: validateMobileDeviceId(deviceId) } })
}
