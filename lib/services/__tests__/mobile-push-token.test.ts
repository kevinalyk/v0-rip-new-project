import assert from "node:assert/strict"
import test from "node:test"

import { MobileAuthError } from "@/lib/mobile-auth"
import { validateMobilePushTokenInput } from "@/lib/services/mobile-push-token-service"

test("accepts and trims an iOS Expo push token and installation ID", () => {
  assert.deepEqual(validateMobilePushTokenInput({
    expoPushToken: " ExpoPushToken[abcdefghijklmnop] ",
    deviceId: " device-1 ",
    platform: "ios",
  }), { token: "ExpoPushToken[abcdefghijklmnop]", deviceId: "device-1" })
})

test("rejects missing, malformed, or oversized notification identifiers", () => {
  const invalid = [
    {},
    { expoPushToken: "not-a-token", deviceId: "device-1", platform: "ios" },
    { expoPushToken: "ExpoPushToken[abcdefghijklmnop]", deviceId: "", platform: "ios" },
    { expoPushToken: "ExpoPushToken[abcdefghijklmnop]", deviceId: "x".repeat(101), platform: "ios" },
  ]
  for (const input of invalid) {
    assert.throws(
      () => validateMobilePushTokenInput(input),
      (error: unknown) => error instanceof MobileAuthError && error.code === "INVALID_PUSH_TOKEN",
    )
  }
})

test("fails closed unless the caller explicitly declares iOS", () => {
  for (const platform of [undefined, "android", "web"]) {
    assert.throws(
      () => validateMobilePushTokenInput({
        expoPushToken: "ExpoPushToken[abcdefghijklmnop]",
        deviceId: "device-1",
        platform,
      }),
      (error: unknown) => error instanceof MobileAuthError && error.code === "INVALID_PLATFORM",
    )
  }
})
