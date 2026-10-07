import assert from "node:assert/strict"
import { test } from "node:test"
import { GET, POST } from "../../app/unsubscribe/route"
import {
  addEmailUnsubscribeHeaders,
  createEmailUnsubscribeToken,
  createEmailUnsubscribeUrl,
  EMAIL_POSTAL_ADDRESS,
  emailPreferenceChanges,
  isEmailUnsubscribeScope,
  verifyEmailUnsubscribeToken,
} from "../email-unsubscribe"

const secret = "test-only-secret"

test("signed links identify only their intended user", () => {
  const token = createEmailUnsubscribeToken("user-123", secret)
  assert.equal(verifyEmailUnsubscribeToken(token, secret), "user-123")
  assert.equal(verifyEmailUnsubscribeToken(token, "another-secret"), null)
  assert.equal(verifyEmailUnsubscribeToken(`${token}x`, secret), null)
  assert.equal(verifyEmailUnsubscribeToken("not-a-token", secret), null)
})

test("unsubscribe URL and one-click headers use the same signed link", () => {
  const url = createEmailUnsubscribeUrl("user-123", "https://app.rip-tool.com", secret)
  assert.equal(new URL(url).pathname, "/unsubscribe")
  assert.equal(verifyEmailUnsubscribeToken(new URL(url).searchParams.get("token")!, secret), "user-123")

  const form = new FormData()
  addEmailUnsubscribeHeaders(form, url)
  assert.equal(form.get("h:List-Unsubscribe"), `<${url}>`)
  assert.equal(form.get("h:List-Unsubscribe-Post"), "List-Unsubscribe=One-Click")
})

test("all-email opt-out covers product updates and both digests", () => {
  assert.deepEqual(emailPreferenceChanges("all"), {
    productUpdateEnabled: false,
    digestEnabled: false,
    weeklyDigestEnabled: false,
  })
  assert.deepEqual(emailPreferenceChanges("weekly_digest"), { weeklyDigestEnabled: false })
  assert.deepEqual(emailPreferenceChanges("campaign_launch"), {})
  assert.equal(isEmailUnsubscribeScope("all"), true)
  assert.equal(isEmailUnsubscribeScope("unknown"), false)
})

test("postal address is present for marketing email templates", () => {
  assert.match(EMAIL_POSTAL_ADDRESS, /Republican Inboxing Protocol LLC/)
  assert.match(EMAIL_POSTAL_ADDRESS, /Albuquerque, NM 87110/)
})

test("GET previews preferences without writing, and invalid POST fails closed", async () => {
  const previousSecret = process.env.JWT_SECRET
  process.env.JWT_SECRET = secret
  try {
    const url = createEmailUnsubscribeUrl("user-123", "https://app.rip-tool.com")
    const preview = await GET(new Request(url))
    assert.equal(preview.status, 200)
    assert.match(await preview.text(), /Stop all update and alert emails/)
    assert.equal(preview.headers.get("Cache-Control"), "no-store")

    const invalid = await POST(new Request("https://app.rip-tool.com/unsubscribe", {
      method: "POST",
      body: new URLSearchParams({ token: "invalid", scope: "all" }),
    }))
    assert.equal(invalid.status, 400)
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = previousSecret
  }
})

test("product-update email contains postal address and a direct unsubscribe link", async () => {
  const previous = {
    secret: process.env.JWT_SECRET,
    apiKey: process.env.MAILGUN_API_KEY,
    domain: process.env.MAILGUN_DOMAIN,
    encryptionKey: process.env.ENCRYPTION_KEY,
    fetch: globalThis.fetch,
  }
  process.env.JWT_SECRET = secret
  process.env.MAILGUN_API_KEY = "test-only-key"
  process.env.MAILGUN_DOMAIN = "example.test"
  process.env.ENCRYPTION_KEY = "12345678901234567890123456789012"
  let sent: FormData | null = null
  globalThis.fetch = async (_input, init) => {
    sent = init?.body as FormData
    return new Response("ok", { status: 200 })
  }

  try {
    const { sendProductUpdateEmail } = await import("../mailgun")
    const ok = await sendProductUpdateEmail({
      to: "reader@example.test",
      firstName: "Reader",
      clientSlug: "sample",
      userId: "user-123",
      items: [{
        id: "article-1",
        slug: "update",
        title: "New feature",
        body: "A short update",
        imageUrl: null,
        publishedAt: new Date("2026-10-07T12:00:00Z"),
      }],
    })
    assert.equal(ok, true)
    assert.ok(sent)
    assert.match(String(sent.get("html")), /Republican Inboxing Protocol LLC/)
    assert.match(String(sent.get("text")), /Unsubscribe from email updates: https:\/\/app\.rip-tool\.com\/unsubscribe\?token=/)
    assert.match(String(sent.get("h:List-Unsubscribe")), /^<https:\/\/app\.rip-tool\.com\/unsubscribe\?token=/)
    assert.equal(sent.get("h:List-Unsubscribe-Post"), "List-Unsubscribe=One-Click")
  } finally {
    globalThis.fetch = previous.fetch
    for (const [key, value] of [
      ["JWT_SECRET", previous.secret],
      ["MAILGUN_API_KEY", previous.apiKey],
      ["MAILGUN_DOMAIN", previous.domain],
      ["ENCRYPTION_KEY", previous.encryptionKey],
    ] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
