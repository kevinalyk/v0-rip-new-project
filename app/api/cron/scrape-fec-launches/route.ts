import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { nameToSlug } from "@/lib/directory"

export const runtime = "nodejs"
// Allow up to 5 minutes — we may be fetching many candidates + creating entities
export const maxDuration = 300

// FEC office codes we care about: House, Senate, President.
// Governor is state-level and not covered by FEC — we'll add that via a
// separate source (Ballotpedia / manual) in a future phase.
const SUPPORTED_OFFICES = new Set(["H", "S", "P"]) // House, Senate, President

// Map FEC party codes to your app's internal party strings
function normalizeFecParty(fecParty: string | null): string | null {
  if (!fecParty) return null
  const p = fecParty.toUpperCase()
  if (p === "REP" || p === "R") return "republican"
  if (p === "DEM" || p === "D") return "democrat"
  if (p === "IND" || p === "I") return "independent"
  if (p === "LIB" || p === "L") return "libertarian"
  if (p === "GRE" || p === "G") return "green"
  return p.toLowerCase()
}

// Map FEC office code to a readable office string
function fecOfficeLabel(officeCode: string, state: string | null, district: string | null): string {
  if (officeCode === "S") return `U.S. Senate${state ? ` — ${state}` : ""}`
  if (officeCode === "P") return "U.S. President"
  if (officeCode === "H") {
    const base = "U.S. House"
    if (state && district) return `${base} — ${state}-${district.padStart(2, "0")}`
    if (state) return `${base} — ${state}`
    return base
  }
  return officeCode
}

// Derive a two-letter state abbreviation from the FEC state field
function normalizeState(fecState: string | null): string | null {
  if (!fecState) return null
  const s = fecState.trim().toUpperCase()
  // FEC already returns two-letter state codes
  return s.length === 2 ? s : null
}

interface FecCandidate {
  candidate_id: string
  name: string
  party: string | null
  state: string | null
  district: string | null
  office: string
  load_date: string         // when FEC last touched the record (refile, address change, etc.)
  first_file_date: string   // when the candidate FIRST filed for this cycle — what we want
  candidate_status: string  // "C" = candidate, "F" = future, "N" = not yet, "P" = primary, "W" = winner
  election_years: number[]
  incumbent_challenge: string | null
}

interface FecApiResponse {
  results: FecCandidate[]
  pagination: { count: number; page: number; pages: number; per_page: number }
}

export async function GET(request: Request) {
  try {
    // Allow this route in two ways:
    // 1. Vercel Cron — identified by the `vercel-cron/1.0` user agent (set automatically)
    // 2. Manual trigger — pass `?secret=<CRON_SECRET>` (only if CRON_SECRET is set)
    const userAgent = request.headers.get("user-agent") || ""
    const isVercelCron = userAgent.includes("vercel-cron")

    if (!isVercelCron) {
      const { searchParams } = new URL(request.url)
      const cronSecret = searchParams.get("secret")
      if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const apiKey = process.env.FEC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: "FEC_API_KEY not configured" }, { status: 500 })
    }

    // Pull candidates whose FEC first_file_date is within the last 24 hours.
    // first_file_date = when the candidate originally filed for this cycle, NOT when
    // the record was last updated (which is what `load_date` tracks). Using first_file_date
    // means we only catch genuinely new launches, not refiles/address changes.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().split("T")[0] // "YYYY-MM-DD"

    // Current election year — FEC data is scoped per election cycle
    const electionYear = new Date().getFullYear() % 2 === 0
      ? new Date().getFullYear()
      : new Date().getFullYear() + 1

    console.log(`[fec-scraper] Fetching candidates filed since ${sinceStr} for ${electionYear} cycle`)

    let page = 1
    let totalPages = 1
    const newLaunches: Array<{
      fecId: string
      name: string
      party: string | null
      state: string | null
      office: string
      district: string | null
      launchDate: string
    }> = []

    // Paginate through all results
    while (page <= totalPages) {
      const url = new URLSearchParams({
        api_key: apiKey,
        election_year: String(electionYear),
        first_file_date_min: sinceStr,
        candidate_status: "C",         // confirmed candidates only
        per_page: "100",
        page: String(page),
        sort: "-first_file_date",
      })

      // Add each supported office as a separate param (FEC uses multi-value)
      for (const office of SUPPORTED_OFFICES) {
        url.append("office", office)
      }

      const res = await fetch(`https://api.open.fec.gov/v1/candidates/?${url}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
      })

      if (!res.ok) {
        console.error(`[fec-scraper] FEC API error ${res.status}: ${await res.text()}`)
        break
      }

      const data: FecApiResponse = await res.json()
      totalPages = data.pagination.pages

      for (const c of data.results) {
        if (!SUPPORTED_OFFICES.has(c.office)) continue
        // FEC's first_file_date_min filter is date-precise (not timestamp), so we
        // re-check here to enforce a strict 24-hour rolling window. Skip records
        // missing first_file_date entirely (very rare but defensive).
        if (!c.first_file_date) continue
        const filedAt = new Date(c.first_file_date)
        if (filedAt < since) continue
        newLaunches.push({
          fecId: c.candidate_id,
          name: c.name,
          party: normalizeFecParty(c.party),
          state: normalizeState(c.state),
          office: fecOfficeLabel(c.office, normalizeState(c.state), c.district),
          district: c.district || null,
          launchDate: c.first_file_date,
        })
      }

      page++
    }

    console.log(`[fec-scraper] Found ${newLaunches.length} candidates from FEC`)

    if (newLaunches.length === 0) {
      return NextResponse.json({ success: true, message: "No new candidates found", created: 0 })
    }

    // Check which FEC IDs are already in our database to avoid duplicates
    const existingLaunches = await prisma.campaignLaunch.findMany({
      where: {
        source: "fec",
        sourceExternalId: { in: newLaunches.map((c) => c.fecId) },
      },
      select: { sourceExternalId: true },
    })
    const existingIds = new Set(existingLaunches.map((l) => l.sourceExternalId))

    const brandNew = newLaunches.filter((c) => !existingIds.has(c.fecId))
    console.log(`[fec-scraper] ${brandNew.length} genuinely new candidates to create`)

    let created = 0
    let skipped = 0

    for (const candidate of brandNew) {
      try {
        // FEC names are ALL CAPS (e.g. "SMITH, JOHN") — convert to Title Case
        const formattedName = formatFecName(candidate.name)

        // Try to link to an existing CiEntity by exact name match.
        // We do NOT auto-create entities here — that produced too many
        // duplicates from name spelling/format variations. Entities can
        // be created and linked manually in the admin UI later.
        const existingEntity = await prisma.ciEntity.findUnique({
          where: { name: formattedName },
          select: { id: true },
        })

        await prisma.campaignLaunch.create({
          data: {
            name: formattedName,
            party: candidate.party,
            state: candidate.state,
            office: candidate.office,
            district: candidate.district,
            launchedAt: new Date(candidate.launchDate),
            source: "fec",
            sourceUrl: `https://www.fec.gov/data/candidate/${candidate.fecId}/`,
            sourceExternalId: candidate.fecId,
            linkedEntityId: existingEntity?.id ?? null,
          },
        })

        created++
      } catch (err) {
        console.error(`[fec-scraper] Failed to create launch for ${candidate.name}:`, err)
        skipped++
      }
    }

    console.log(`[fec-scraper] Done — created: ${created}, skipped: ${skipped}`)

    return NextResponse.json({
      success: true,
      totalFromFec: newLaunches.length,
      alreadyTracked: existingIds.size,
      created,
      skipped,
    })
  } catch (error) {
    console.error("[fec-scraper] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// FEC returns names as "LAST, FIRST MIDDLE" in ALL CAPS.
// Convert to "First Last" for display.
function formatFecName(fecName: string): string {
  // Handle "LAST, FIRST" format
  if (fecName.includes(",")) {
    const [last, ...firstParts] = fecName.split(",")
    const first = firstParts.join(" ").trim()
    const formatted = `${titleCase(first)} ${titleCase(last)}`.trim()
    return formatted
  }
  // Fallback: just title-case whatever we got
  return titleCase(fecName)
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`) // McDonald etc.
    .replace(/\bO'(\w)/g, (_, c) => `O'${c.toUpperCase()}`) // O'Brien etc.
}
