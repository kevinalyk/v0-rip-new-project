import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"

async function resolveRedirects(url: string): Promise<string> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(currentUrl, {
          method: "HEAD", // Use HEAD instead of GET for faster redirects
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
          if (!location) {
            console.log(`[v0] No location header for ${currentUrl}, trying GET request`)
            break
          }

          const nextUrl = new URL(location, currentUrl).toString()
          console.log(`[v0] Redirect ${redirectCount + 1}: ${currentUrl} -> ${nextUrl}`)
          currentUrl = nextUrl
          redirectCount++
        } else if (response.status === 200) {
          console.log(`[v0] Final URL reached: ${currentUrl}`)
          return currentUrl
        } else if (response.status === 405) {
          console.log(`[v0] HEAD not allowed for ${currentUrl}, trying GET`)
          const getResponse = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
            signal: controller.signal,
          })

          if (getResponse.status >= 300 && getResponse.status < 400) {
            const location = getResponse.headers.get("location")
            if (location) {
              const nextUrl = new URL(location, currentUrl).toString()
              console.log(`[v0] Redirect via GET: ${currentUrl} -> ${nextUrl}`)
              currentUrl = nextUrl
              redirectCount++
              continue
            }
          }

          return currentUrl
        } else {
          console.log(`[v0] Unexpected status ${response.status} for ${currentUrl}`)
          return currentUrl
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError") {
          console.log(`[v0] Request timeout for ${currentUrl}`)
          return currentUrl
        }
        throw fetchError
      }
    }

    console.log(`[v0] Max redirects reached for ${currentUrl}`)
    return currentUrl
  } catch (error: any) {
    console.error("[v0] Error resolving redirects:", error.message)
    return currentUrl
  }
}

function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.origin}${urlObj.pathname}`
  } catch {
    const questionMarkIndex = url.indexOf("?")
    return questionMarkIndex !== -1 ? url.substring(0, questionMarkIndex) : url
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { campaignId } = await request.json()

    if (!campaignId) {
      return NextResponse.json({ success: false, error: "Campaign ID or share link is required" }, { status: 400 })
    }

    let actualCampaignId = campaignId.trim()
    let isShareToken = false

    // Check if it's a share link URL
    if (actualCampaignId.includes("/share/")) {
      const match = actualCampaignId.match(/\/share\/([^/?#]+)/)
      if (match) {
        actualCampaignId = match[1]
        isShareToken = true
      }
    }

    const sql = neon(process.env.DATABASE_URL!)

    let campaign: any = null
    let campaignType: "email" | "sms" | null = null

    // First try email campaigns
    let campaigns
    if (isShareToken) {
      campaigns = await sql`
        SELECT id, "ctaLinks", "senderName", "senderEmail", "subject"
        FROM "CompetitiveInsightCampaign"
        WHERE "shareToken" = ${actualCampaignId}
      `
    } else {
      campaigns = await sql`
        SELECT id, "ctaLinks", "senderName", "senderEmail", "subject"
        FROM "CompetitiveInsightCampaign"
        WHERE id = ${actualCampaignId}
      `
    }

    if (campaigns.length > 0) {
      campaign = campaigns[0]
      campaignType = "email"
    } else {
      // Try SMS table
      let smsMessages
      if (isShareToken) {
        smsMessages = await sql`
          SELECT id, "ctaLinks", "phoneNumber", "message"
          FROM "SmsQueue"
          WHERE "shareToken" = ${actualCampaignId}
        `
      } else {
        smsMessages = await sql`
          SELECT id, "ctaLinks", "phoneNumber", "message"
          FROM "SmsQueue"
          WHERE id = ${actualCampaignId}
        `
      }

      if (smsMessages.length > 0) {
        campaign = smsMessages[0]
        campaignType = "sms"
      }
    }

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign or SMS not found with that ID or share link" },
        { status: 404 },
      )
    }

    const ctaLinks = typeof campaign.ctaLinks === "string" ? JSON.parse(campaign.ctaLinks) : campaign.ctaLinks

    if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `This ${campaignType === "email" ? "campaign" : "SMS"} has no CTA links to unwrap`,
        },
        { status: 400 },
      )
    }

    const updatedLinks = []
    let linksUpdated = 0
    const unwrapDetails: Array<{ original: string; final: string; changed: boolean }> = []

    for (const link of ctaLinks) {
      if (link.finalUrl && link.finalUrl !== link.url) {
        updatedLinks.push(link)
        unwrapDetails.push({
          original: link.url,
          final: link.finalUrl,
          changed: true,
        })
        continue
      }

      const resolvedUrl = await resolveRedirects(link.url)

      const cleanedUrl = stripQueryParams(link.url)
      const cleanedFinalUrl = stripQueryParams(resolvedUrl)

      if (cleanedFinalUrl !== cleanedUrl) {
        updatedLinks.push({
          ...link,
          url: cleanedUrl,
          finalUrl: cleanedFinalUrl,
          displayUrl: cleanedFinalUrl,
        })
        linksUpdated++
        unwrapDetails.push({
          original: cleanedUrl,
          final: cleanedFinalUrl,
          changed: true,
        })
      } else {
        updatedLinks.push({
          ...link,
          url: cleanedUrl,
          finalUrl: cleanedUrl,
          displayUrl: cleanedUrl,
        })
        unwrapDetails.push({
          original: cleanedUrl,
          final: cleanedUrl,
          changed: false,
        })
      }
    }

    if (campaignType === "email") {
      await sql`
        UPDATE "CompetitiveInsightCampaign"
        SET "ctaLinks" = ${JSON.stringify(updatedLinks)}
        WHERE id = ${campaign.id}
      `
    } else {
      await sql`
        UPDATE "SmsQueue"
        SET "ctaLinks" = ${JSON.stringify(updatedLinks)}
        WHERE id = ${campaign.id}
      `
    }

    const displayInfo =
      campaignType === "email"
        ? {
            type: "email" as const,
            subject: campaign.subject,
            senderName: campaign.senderName,
            senderEmail: campaign.senderEmail,
          }
        : {
            type: "sms" as const,
            phoneNumber: campaign.phoneNumber,
            messagePreview: campaign.message.substring(0, 100),
          }

    return NextResponse.json({
      success: true,
      message: `Unwrapped ${linksUpdated} out of ${ctaLinks.length} links`,
      campaign: {
        id: campaign.id,
        ...displayInfo,
        ctaLinks: updatedLinks,
      },
      linksUpdated,
      totalLinks: ctaLinks.length,
      unwrapDetails,
    })
  } catch (error: any) {
    console.error("[Admin] Error unwrapping campaign:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
