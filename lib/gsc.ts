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

/** Submit one or more URLs for indexing via IndexNow.
 *
 *  IndexNow is supported by Bing, Yandex, and (via Bing's pipeline) Google.
 *  It requires no service account or OAuth — just an INDEXNOW_KEY env var
 *  and a verification file at /{key}.txt in the public directory containing
 *  only the key value on a single line.
 *
 *  Generate a key once with: crypto.randomUUID().replace(/-/g, "")
 *  Set it as INDEXNOW_KEY, create public/{key}.txt, and you're done.
 */
export async function submitUrlForIndexing(url: string): Promise<boolean> {
  return submitUrlsForIndexing([url])
}

export async function submitUrlsForIndexing(urls: string[]): Promise<boolean> {
  const key = process.env.INDEXNOW_KEY

  if (!key) {
    throw new Error(
      "Missing INDEXNOW_KEY env var. Generate a key (e.g. a random hex string), " +
      "set it as INDEXNOW_KEY, and create public/{key}.txt containing just the key."
    )
  }

  const host = "app.rip-tool.com"
  const keyLocation = `https://${host}/${key}.txt`

  const body = {
    host,
    key,
    keyLocation,
    urlList: urls,
  }

  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  })

  if (!response.ok && response.status !== 202) {
    const text = await response.text()
    throw new Error(`IndexNow returned HTTP ${response.status}: ${text}`)
  }

  console.log(`[indexnow] Submitted ${urls.length} URL(s) — HTTP ${response.status}`)
  return true
}
