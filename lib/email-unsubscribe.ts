import { createHmac, timingSafeEqual } from "node:crypto"

// Confirm this remains the sender's valid postal address before deploying.
export const EMAIL_POSTAL_ADDRESS =
  "Republican Inboxing Protocol LLC, 1209 Mountain Road Pl NE, Ste R, Albuquerque, NM 87110"

export type EmailUnsubscribeScope =
  | "all"
  | "product_update"
  | "daily_digest"
  | "weekly_digest"
  | "campaign_launch"

const TOKEN_PURPOSE = "inbox-gop-email-unsubscribe-v1"
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/

function signingSecret(secret?: string): string {
  const value = secret ?? process.env.JWT_SECRET
  if (!value) throw new Error("JWT_SECRET is required for email unsubscribe links")
  return value
}

function signature(encodedUserId: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${TOKEN_PURPOSE}:${encodedUserId}`)
    .digest("base64url")
}

export function createEmailUnsubscribeToken(userId: string, secret?: string): string {
  if (!userId || userId.length > 128) throw new Error("Invalid unsubscribe user ID")
  const encodedUserId = Buffer.from(userId, "utf8").toString("base64url")
  return `${encodedUserId}.${signature(encodedUserId, signingSecret(secret))}`
}

export function verifyEmailUnsubscribeToken(token: string, secret?: string): string | null {
  if (token.length > 256 || !TOKEN_PATTERN.test(token)) return null
  const [encodedUserId, providedSignature] = token.split(".")
  const userId = Buffer.from(encodedUserId, "base64url").toString("utf8")
  if (!userId || userId.length > 128 || Buffer.from(userId).toString("base64url") !== encodedUserId) {
    return null
  }
  const expected = Buffer.from(signature(encodedUserId, signingSecret(secret)), "base64url")
  const provided = Buffer.from(providedSignature, "base64url")
  return provided.length === expected.length && timingSafeEqual(provided, expected) ? userId : null
}

export function createEmailUnsubscribeUrl(userId: string, baseUrl: string, secret?: string): string {
  const url = new URL("/unsubscribe", baseUrl)
  url.searchParams.set("token", createEmailUnsubscribeToken(userId, secret))
  return url.toString()
}

export function addEmailUnsubscribeHeaders(formData: FormData, url: string): void {
  formData.append("h:List-Unsubscribe", `<${url}>`)
  formData.append("h:List-Unsubscribe-Post", "List-Unsubscribe=One-Click")
}

export function isEmailUnsubscribeScope(value: unknown): value is EmailUnsubscribeScope {
  return ["all", "product_update", "daily_digest", "weekly_digest", "campaign_launch"].includes(
    value as string,
  )
}

export function emailPreferenceChanges(scope: EmailUnsubscribeScope) {
  return {
    ...(scope === "all" || scope === "product_update" ? { productUpdateEnabled: false } : {}),
    ...(scope === "all" || scope === "daily_digest" ? { digestEnabled: false } : {}),
    ...(scope === "all" || scope === "weekly_digest" ? { weeklyDigestEnabled: false } : {}),
  }
}
