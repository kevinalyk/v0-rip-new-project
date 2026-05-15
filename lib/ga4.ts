import { BetaAnalyticsDataClient } from "@google-analytics/data"

function getGA4Client() {
  const email = process.env.GA4_CLIENT_EMAIL
  const rawKey = process.env.GA4_PRIVATE_KEY

  if (!email || !rawKey) {
    throw new Error(`GA4 credentials missing — GA4_CLIENT_EMAIL: ${!!email}, GA4_PRIVATE_KEY: ${!!rawKey}`)
  }

  // Normalise the key: handle both literal \\n (Vercel env var paste) and real newlines,
  // and strip any surrounding quotes that may have been included in the value.
  const privateKey = rawKey
    .replace(/^["']|["']$/g, "")   // strip surrounding quotes
    .replace(/\\n/g, "\n")          // literal \n → real newline

  if (!privateKey.includes("-----BEGIN")) {
    throw new Error("GA4_PRIVATE_KEY does not look like a valid PEM key — check the env var value in Vercel")
  }

  console.log(`[ga4] Initialising client — email: ${email.slice(0, 20)}... key starts: ${privateKey.slice(0, 28)}`)

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
  })
}

export interface PageMetrics {
  pagePath: string
  sessions: number
  pageViews: number
  bounceRate: number
  avgSessionDuration: number
}

export interface TopPage {
  pagePath: string
  pageViews: number
  sessions: number
}

/** Fetch top-performing pages by page views over the last N days */
export async function getTopPages(days = 30, limit = 20): Promise<TopPage[]> {
  const client = getGA4Client()
  const propertyId = process.env.GA4_PROPERTY_ID

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  })

  return (response.rows ?? []).map((row) => ({
    pagePath: row.dimensionValues?.[0]?.value ?? "",
    pageViews: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
    sessions: parseInt(row.metricValues?.[1]?.value ?? "0", 10),
  }))
}

/** Fetch metrics for a specific page path */
export async function getPageMetrics(pagePath: string, days = 30): Promise<PageMetrics | null> {
  const client = getGA4Client()
  const propertyId = process.env.GA4_PROPERTY_ID

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "pagePath" }],
    dimensionFilter: {
      filter: {
        fieldName: "pagePath",
        stringFilter: { value: pagePath, matchType: "EXACT" },
      },
    },
    metrics: [
      { name: "sessions" },
      { name: "screenPageViews" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
  })

  const row = response.rows?.[0]
  if (!row) return null

  return {
    pagePath,
    sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
    pageViews: parseInt(row.metricValues?.[1]?.value ?? "0", 10),
    bounceRate: parseFloat(row.metricValues?.[2]?.value ?? "0"),
    avgSessionDuration: parseFloat(row.metricValues?.[3]?.value ?? "0"),
  }
}

/** Get search terms that brought users to the site (requires linking GA4 to GSC) */
export async function getSearchTerms(days = 30, limit = 50): Promise<{ term: string; sessions: number }[]> {
  const client = getGA4Client()
  const propertyId = process.env.GA4_PROPERTY_ID

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "sessionGoogleAdsKeyword" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
  })

  return (response.rows ?? [])
    .filter((row) => row.dimensionValues?.[0]?.value && row.dimensionValues[0].value !== "(not set)")
    .map((row) => ({
      term: row.dimensionValues?.[0]?.value ?? "",
      sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
    }))
}
