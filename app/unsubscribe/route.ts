import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import {
  emailPreferenceChanges,
  isEmailUnsubscribeScope,
  verifyEmailUnsubscribeToken,
} from "@/lib/email-unsubscribe"

export const dynamic = "force-dynamic"

const pageHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'self'; style-src 'unsafe-inline'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
}

function page(title: string, content: string, status = 200) {
  return new NextResponse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | Inbox.GOP</title><style>
body{font:16px/1.5 system-ui,sans-serif;background:#f4f6f8;color:#14212b;margin:0;padding:32px 16px}
main{max-width:560px;margin:8vh auto;background:white;border:1px solid #dce2e6;border-radius:16px;padding:32px}
h1{font-size:1.6rem;margin-top:0}button{display:block;width:100%;font:inherit;background:#d9414d;color:white;border:0;border-radius:8px;padding:14px;margin-top:12px;cursor:pointer}
button.secondary{background:#e9eef1;color:#14212b}small{color:#536370}
</style></head><body><main><h1>${title}</h1>${content}</main></body></html>`, {
    status,
    headers: { ...pageHeaders, "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (!token || !verifyEmailUnsubscribeToken(token)) {
    return page("Invalid unsubscribe link", "<p>This link is invalid. Please contact support@rip-tool.com for help.</p>", 400)
  }

  // The token is limited to base64url characters and a dot by the verifier.
  return page("Email preferences", `<p>Choose which Inbox.GOP emails to stop. No sign-in is required. Account, billing, and security messages are unaffected.</p>
<form method="post" action="/unsubscribe"><input type="hidden" name="token" value="${token}">
<button name="scope" value="all">Stop all update and alert emails</button>
<button class="secondary" name="scope" value="product_update">Stop What's New emails only</button>
<button class="secondary" name="scope" value="daily_digest">Stop daily digests only</button>
<button class="secondary" name="scope" value="weekly_digest">Stop weekly digests only</button>
<button class="secondary" name="scope" value="campaign_launch">Stop campaign launch alerts only</button>
</form><p><small>You can turn these preferences back on in account settings later.</small></p>`)
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0")
  if (declaredLength > 4096) {
    return page("Invalid unsubscribe request", "<p>The request is too large.</p>", 413)
  }
  const form = await request.formData().catch(() => null)
  const token = form?.get("token") ?? new URL(request.url).searchParams.get("token")
  const userId = typeof token === "string" ? verifyEmailUnsubscribeToken(token) : null
  // RFC 8058 one-click POSTs supply List-Unsubscribe=One-Click, not a scope.
  const oneClick = form?.get("List-Unsubscribe") === "One-Click"
  const scope = oneClick ? "all" : form?.get("scope")
  if (!userId || !isEmailUnsubscribeScope(scope)) {
    return page("Invalid unsubscribe request", "<p>This link is invalid. Please contact support@rip-tool.com for help.</p>", 400)
  }

  try {
    const disableLaunchAlerts = () => prisma.campaignAlertSubscription.updateMany({
      where: { userId, kind: "campaign_launch" },
      data: { enabled: false },
    })
    if (scope === "campaign_launch") {
      await disableLaunchAlerts()
    } else if (scope === "all") {
      await prisma.$transaction([
        prisma.user.updateMany({ where: { id: userId }, data: emailPreferenceChanges(scope) }),
        disableLaunchAlerts(),
      ])
    } else {
      await prisma.user.updateMany({ where: { id: userId }, data: emailPreferenceChanges(scope) })
    }
  } catch {
    console.error("Email unsubscribe update failed")
    return page("Please try again", "<p>We couldn't update your preferences. Please try the link again later.</p>", 500)
  }

  return page("You're unsubscribed", "<p>Your email preferences have been updated. Account, billing, and security messages may still be sent.</p>")
}
