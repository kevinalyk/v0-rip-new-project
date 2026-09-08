import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"

const EXPO_PUSH_TOKEN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,}\]$/

export function validateMobilePushTokenInput(
  input: { expoPushToken?: string; deviceId?: string; platform?: string },
): { token: string; deviceId: string } {
  const token = input.expoPushToken?.trim()
  const deviceId = input.deviceId?.trim()
  if (!token || !EXPO_PUSH_TOKEN.test(token) || !deviceId || deviceId.length > 100) {
    throw new MobileAuthError(400, "INVALID_PUSH_TOKEN", "A valid device notification token is required")
  }
  if (input.platform !== "ios") {
    throw new MobileAuthError(400, "INVALID_PLATFORM", "Only iOS notification tokens are supported")
  }
  return { token, deviceId }
}

export async function registerMobilePushToken(
  userId: string,
  input: { expoPushToken?: string; deviceId?: string; platform?: string },
) {
  const { token, deviceId } = validateMobilePushTokenInput(input)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.mobilePushToken.deleteMany({
      where: { userId, deviceId, expoPushToken: { not: token } },
    })
    return tx.mobilePushToken.upsert({
      where: { expoPushToken: token },
      create: { userId, expoPushToken: token, deviceId, platform: "ios" },
      update: { userId, deviceId, platform: "ios", enabled: true, lastSeenAt: new Date() },
      select: { id: true, enabled: true, lastSeenAt: true },
    })
  })
}

export async function unregisterMobilePushToken(userId: string, deviceId: string | undefined) {
  if (!deviceId?.trim()) throw new MobileAuthError(400, "INVALID_DEVICE", "A device ID is required")
  await prisma.mobilePushToken.deleteMany({ where: { userId, deviceId: deviceId.trim() } })
}
