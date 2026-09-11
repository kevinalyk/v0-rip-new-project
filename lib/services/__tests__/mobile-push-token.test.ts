import assert from "node:assert/strict"
import test from "node:test"

import { MobileAuthError } from "@/lib/mobile-auth"
import {
  validateMobileDeviceId,
  validateMobilePushTokenInput,
  validateFollowingPushPreference,
} from "@/lib/services/mobile-push-token-service"

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

test("validates and normalizes device IDs used by preference routes", () => {
  assert.equal(validateMobileDeviceId(" device-1 "), "device-1")
  for (const deviceId of [undefined, "", " ", "x".repeat(101)]) {
    assert.throws(
      () => validateMobileDeviceId(deviceId),
      (error: unknown) => error instanceof MobileAuthError && error.code === "INVALID_DEVICE",
    )
  }
})

test("following notification preference accepts only explicit booleans", () => {
  assert.equal(validateFollowingPushPreference(true), true)
  assert.equal(validateFollowingPushPreference(false), false)
  for (const value of [undefined, null, "true", 1]) {
    assert.throws(
      () => validateFollowingPushPreference(value),
      (error: unknown) => error instanceof MobileAuthError && error.code === "INVALID_PREFERENCE",
    )
  }
})
