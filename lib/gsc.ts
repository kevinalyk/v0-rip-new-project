import { google } from "googleapis"

function getGSCClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GSC_CLIENT_ID,
    process.env.GSC_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/api/auth/gsc/callback`
  )

  oauth2Client.setCredentials({
    refresh_token: process.env.GSC_REFRESH_TOKEN,
  })

  return google.webmasters({ version: "v3", auth: oauth2Client })
}

export interface SearchQuery {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchPage {
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** Fetch top search queries driving traffic to the site */
export async function getTopSearchQueries(days = 28, limit = 50): Promise<SearchQuery[]> {
  const gsc = getGSCClient()
  const siteUrl = process.env.GSC_SITE_URL!

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const response = await gsc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dimensions: ["query"],
      rowLimit: limit,
      orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
    },
  })

  return (response.data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}

/** Fetch top pages by clicks from GSC */
export async function getTopSearchPages(days = 28, limit = 50): Promise<SearchPage[]> {
  const gsc = getGSCClient()
  const siteUrl = process.env.GSC_SITE_URL!

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const response = await gsc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dimensions: ["page"],
      rowLimit: limit,
      orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
    },
  })

  return (response.data.rows ?? []).map((row) => ({
    page: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}

/** Fetch queries for a specific page — useful for identifying keyword gaps */
export async function getPageSearchQueries(pagePath: string, days = 28): Promise<SearchQuery[]> {
  const gsc = getGSCClient()
  const siteUrl = process.env.GSC_SITE_URL!

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - days)

  const fullUrl = `${siteUrl.replace(/\/$/, "")}${pagePath}`

  const response = await gsc.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
      dimensions: ["query"],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "page",
              operator: "equals",
              expression: fullUrl,
            },
          ],
        },
      ],
      rowLimit: 50,
    },
  })

  return (response.data.rows ?? []).map((row) => ({
    query: row.keys?.[0] ?? "",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }))
}

/** Submit a URL for indexing via the Google Indexing API.
 *
 *  Uses the GA4 service account (GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY).
 *  The service account must be added as an Owner in GSC property settings.
 *  OAuth2 credentials (GSC_CLIENT_ID / GSC_CLIENT_SECRET) only work for
 *  Search Console queries, not the Indexing API.
 */
export async function submitUrlForIndexing(url: string): Promise<boolean> {
  // Reuse the same service account already configured for GA4
  const email = process.env.GA4_CLIENT_EMAIL
  const rawKey = process.env.GA4_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error(
      "Missing GA4_CLIENT_EMAIL or GA4_PRIVATE_KEY env vars — " +
      "the Indexing API requires a service account JWT (not OAuth2). " +
      "Make sure the service account is also added as an Owner in GSC."
    )
  }

  // Vercel stores multiline env vars with literal \n — convert back to real newlines
  const privateKey = rawKey.replace(/\\n/g, "\n")

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/indexing"],
  })

  const indexing = google.indexing({ version: "v3", auth })

  try {
    const response = await indexing.urlNotifications.publish({
      requestBody: { url, type: "URL_UPDATED" },
    })
    console.log(`[gsc] Submitted ${url} — HTTP ${response.status}`)
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[gsc] Failed to submit ${url}: ${message}`)
    throw err
  }
}
