import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

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
  // NPA = "No Party Affiliation" — display as independent
  if (p === "NPA") return "independent"
  // W = "Write-in" — no party affiliation, leave null
  if (p === "W") return null
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

    // Diagnostics object — returned in the response so you can see exactly
    // what happened at each step when hitting this endpoint manually.
    const diagnostics: {
      since: string
      electionYears: number[]
      queryUrlSample: string | null
      totalFromApi: number
      pagesFetched: number
      droppedReasons: Record<string, number>
      sampleRawCandidates: Array<{
        name: string
        office: string
        state: string | null
        party: string | null
        candidate_status: string
        first_file_date: string | null
        load_date: string | null
        election_years: number[]
      }>
      apiError: string | null
    } = {
      since: "",
      electionYears: [],
      queryUrlSample: null,
      totalFromApi: 0,
      pagesFetched: 0,
      droppedReasons: {
        unsupported_office: 0,
        missing_first_file_date: 0,
        first_file_date_too_old: 0,
      },
      sampleRawCandidates: [],
      apiError: null,
    }

    // Pull candidates whose FEC first_file_date is within the last 7 days.
    // first_file_date = when the candidate originally filed for this cycle, NOT when
    // the record was last updated (which is what `load_date` tracks). Using first_file_date
    // means we only catch genuinely new launches, not refiles/address changes.
    // 7-day window matches what the /directory/new-campaigns page displays and gives us
    // recovery headroom if the cron misses a day or two.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const sinceStr = since.toISOString().split("T")[0] // "YYYY-MM-DD"
    diagnostics.since = sinceStr

    // FEC scopes data per election cycle. We query BOTH the current and next
    // cycle so we don't miss freshly-filed 2028 presidential candidates etc.
    const currentYear = new Date().getFullYear()
    const cycleYears = [
      currentYear % 2 === 0 ? currentYear : currentYear + 1,    // nearest even year
      currentYear % 2 === 0 ? currentYear + 2 : currentYear + 3, // following even year
    ]
    diagnostics.electionYears = cycleYears

    console.log(`[fec-scraper] Fetching candidates filed since ${sinceStr} for cycles ${cycleYears.join(", ")}`)

    const newLaunches: Array<{
      fecId: string
      name: string
      party: string | null
      state: string | null
      office: string
      district: string | null
      launchDate: string
    }> = []

    // Hard cap: never fetch more than 10 pages per cycle (1000 candidates).
    // If FEC ever returns more than that in a 7-day window we have bigger
    // problems and the cron should bail rather than time out.
    const MAX_PAGES_PER_CYCLE = 10

    // Iterate each election cycle and paginate through all results
    for (const electionYear of cycleYears) {
      let page = 1
      let totalPages = 1

      while (page <= totalPages && page <= MAX_PAGES_PER_CYCLE) {
        const url = new URLSearchParams({
          api_key: apiKey,
          election_year: String(electionYear),
          first_file_date_min: sinceStr,
          per_page: "100",
          page: String(page),
          sort: "-first_file_date",
        })

        // Note: we intentionally DO NOT filter on candidate_status here. Newly
        // filed candidates often start as "F" (Future) or "N" (Not yet) before
        // reaching "C" (Statutory). Filtering on status was hiding fresh launches.

        // Add each supported office as a separate param (FEC uses multi-value)
        for (const office of SUPPORTED_OFFICES) {
          url.append("office", office)
        }

        // Capture the first URL for diagnostics (with API key redacted)
        if (!diagnostics.queryUrlSample) {
          const redacted = new URLSearchParams(url)
          redacted.set("api_key", "REDACTED")
          diagnostics.queryUrlSample = `https://api.open.fec.gov/v1/candidates/?${redacted}`
        }

        const res = await fetch(`https://api.open.fec.gov/v1/candidates/?${url}`, {
          headers: { Accept: "application/json" },
          next: { revalidate: 0 },
        })

        if (!res.ok) {
          const errText = await res.text()
          console.error(`[fec-scraper] FEC API error ${res.status}: ${errText}`)
          diagnostics.apiError = `${res.status}: ${errText.slice(0, 300)}`
          break
        }

        const data: FecApiResponse = await res.json()
        totalPages = data.pagination.pages
        diagnostics.totalFromApi += data.pagination.count
        diagnostics.pagesFetched += 1

        for (const c of data.results) {
          // Capture a sample of raw candidates so you can inspect what FEC sent back
          if (diagnostics.sampleRawCandidates.length < 5) {
            diagnostics.sampleRawCandidates.push({
              name: c.name,
              office: c.office,
              state: c.state,
              party: c.party,
              candidate_status: c.candidate_status,
              first_file_date: c.first_file_date ?? null,
              load_date: c.load_date ?? null,
              election_years: c.election_years,
            })
          }

          if (!SUPPORTED_OFFICES.has(c.office)) {
            diagnostics.droppedReasons.unsupported_office += 1
            continue
          }
          if (!c.first_file_date) {
            diagnostics.droppedReasons.missing_first_file_date += 1
            continue
          }
          // FEC's first_file_date_min filter is date-precise (not timestamp), so we
          // re-check here to enforce a strict rolling window.
          const filedAt = new Date(c.first_file_date)
          if (filedAt < since) {
            diagnostics.droppedReasons.first_file_date_too_old += 1
            continue
          }
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
    }

    console.log(`[fec-scraper] Found ${newLaunches.length} candidates from FEC after filtering`)

    if (newLaunches.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No new candidates found",
        created: 0,
        diagnostics,
      })
    }

    // Deduplicate within this run by FEC ID (a candidate may appear in both cycles)
    const seenFecIds = new Set<string>()
    const dedupedLaunches = newLaunches.filter((c) => {
      if (seenFecIds.has(c.fecId)) return false
      seenFecIds.add(c.fecId)
      return true
    })

    // Check which FEC IDs are already in our database to avoid duplicates
    const existingLaunches = await prisma.campaignLaunch.findMany({
      where: {
        source: "fec",
        sourceExternalId: { in: dedupedLaunches.map((c) => c.fecId) },
      },
      select: { sourceExternalId: true },
    })
    const existingIds = new Set(existingLaunches.map((l) => l.sourceExternalId))

    const brandNew = dedupedLaunches.filter((c) => !existingIds.has(c.fecId))
    console.log(`[fec-scraper] ${brandNew.length} genuinely new candidates to create`)

    // Pre-format names so we can match/create CiEntities by their final display name.
    const formattedCandidates = brandNew.map((c) => ({
      ...c,
      formattedName: formatFecName(c.name),
    }))
    const formattedNames = formattedCandidates.map((c) => c.formattedName)

    // Auto-create stub CiEntities for every new launch. `name` is unique on
    // CiEntity, so skipDuplicates lets us insert without trampling pre-existing
    // entities — they'll just be left alone and matched in the next step.
    // Presidential candidates have FEC state="US" which isn't a real state, so
    // we drop it on entity creation but keep it on the CampaignLaunch row for
    // audit fidelity.
    let entitiesCreated = 0
    if (formattedCandidates.length > 0) {
      const entityResult = await prisma.ciEntity.createMany({
        data: formattedCandidates.map((c) => ({
          name: c.formattedName,
          type: "candidate",
          party: c.party,
          state: c.state === "US" ? null : c.state,
        })),
        skipDuplicates: true,
      })
      entitiesCreated = entityResult.count
      console.log(`[fec-scraper] Created ${entitiesCreated} new stub entities`)
    }

    // Now look up every entity by name (existing + just-created) so we can
    // populate linkedEntityId on each launch row. One query, regardless of
    // batch size — avoids per-candidate roundtrips that caused the earlier
    // function timeouts.
    const allEntities = formattedNames.length
      ? await prisma.ciEntity.findMany({
          where: { name: { in: formattedNames } },
          select: { id: true, name: true, ballotpediaUrl: true },
        })
      : []
    const entityIdByName = new Map(allEntities.map((e) => [e.name, e.id]))

    // For each entity that doesn't already have a Ballotpedia URL, try to
    // discover one. We process in concurrency-limited batches (5 at a time)
    // to be polite to ballotpedia.org and avoid hitting their rate limits.
    // Failures (404, disambiguation, wrong person) are silently ignored —
    // the URL stays null and an admin can fill it in manually later.
    const candidatesToResolve = formattedCandidates.filter((c) => {
      const entity = allEntities.find((e) => e.name === c.formattedName)
      return entity && !entity.ballotpediaUrl
    })

    let ballotpediaUrlsFound = 0
    const BATCH_SIZE = 5
    for (let i = 0; i < candidatesToResolve.length; i += BATCH_SIZE) {
      const batch = candidatesToResolve.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (c) => {
          const url = await attemptFindBallotpediaUrl(c.formattedName, c.state, c.office)
          return { name: c.formattedName, url }
        }),
      )

      // Update any entities where we found a clean match
      const updates = results.filter((r) => r.url !== null)
      for (const { name, url } of updates) {
        const id = entityIdByName.get(name)
        if (!id) continue
        try {
          await prisma.ciEntity.update({
            where: { id },
            data: { ballotpediaUrl: url },
          })
          ballotpediaUrlsFound++
          console.log(`[fec-scraper] Found Ballotpedia URL for ${name}: ${url}`)
        } catch (err) {
          console.error(`[fec-scraper] Failed to save Ballotpedia URL for ${name}:`, err)
        }
      }
    }

    console.log(`[fec-scraper] Resolved ${ballotpediaUrlsFound} Ballotpedia URLs out of ${candidatesToResolve.length} attempts`)

    // Bulk insert all launches in one createMany call. skipDuplicates handles
    // any race where a record was inserted in parallel.
    let created = 0
    let skipped = 0
    const createdNames: string[] = []

    if (formattedCandidates.length > 0) {
      try {
        const result = await prisma.campaignLaunch.createMany({
          data: formattedCandidates.map((candidate) => ({
            name: candidate.formattedName,
            party: candidate.party,
            state: candidate.state,
            office: candidate.office,
            district: candidate.district,
            launchedAt: new Date(candidate.launchDate),
            source: "fec",
            sourceUrl: `https://www.fec.gov/data/candidate/${candidate.fecId}/`,
            sourceExternalId: candidate.fecId,
            linkedEntityId: entityIdByName.get(candidate.formattedName) ?? null,
          })),
          skipDuplicates: true,
        })
        created = result.count
        skipped = formattedCandidates.length - result.count
        createdNames.push(...formattedCandidates.map((c) => c.formattedName))
      } catch (err) {
        console.error(`[fec-scraper] Bulk insert failed:`, err)
        skipped = formattedCandidates.length
      }
    }

    console.log(`[fec-scraper] Done — launches created: ${created}, entities created: ${entitiesCreated}`)

    return NextResponse.json({
      success: true,
      totalFromFecAfterFilter: newLaunches.length,
      afterDedupInRun: dedupedLaunches.length,
      alreadyTracked: existingIds.size,
      created,
      entitiesCreated,
      ballotpediaUrlsFound,
      ballotpediaUrlsAttempted: candidatesToResolve.length,
      skipped,
      createdNames,
      diagnostics,
    })
  } catch (error) {
    console.error("[fec-scraper] Unexpected error:", error)
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

// State abbreviation → full name. Used to validate that a Ballotpedia page
// resolved by name actually belongs to the right candidate (vs another person
// with the same name in a different state).
const STATE_FULL_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
}

// Convert a candidate's display name into a Ballotpedia URL slug.
// "Larry Marker" -> "Larry_Marker", "John Smith Jr" -> "John_Smith_Jr"
function nameToBallotpediaSlug(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("_")
}

// Validate that a Ballotpedia page is the RIGHT candidate by checking:
//   1. Not a disambiguation page (multiple matches)
//   2. State context appears (full state name)
//   3. Office context appears (House/Senate/President)
// Returns false if any check fails — we'd rather skip than save a wrong URL.
function isCleanBallotpediaPage(html: string, state: string | null, office: string): boolean {
  // Disambiguation detection. Ballotpedia uses two patterns:
  //   "<name> may refer to:" header followed by a bulleted list
  //   "This disambiguation page lists articles with similar titles"
  if (/may refer to:/i.test(html.slice(0, 8000))) return false
  if (/disambiguation page lists/i.test(html)) return false

  // State match — only check if we know the state
  if (state) {
    const fullName = STATE_FULL_NAMES[state]
    if (fullName) {
      // Word-boundary check so "New Mexico" doesn't accidentally match "Mexico"
      const stateRegex = new RegExp(`\\b${fullName.replace(/\s+/g, "\\s+")}\\b`, "i")
      if (!stateRegex.test(html)) return false
    }
  }

  // Office match — keyword check based on which office we're looking for
  if (/U\.S\.\s*House/i.test(office)) {
    if (!/U\.?S\.?\s*House|House of Representatives/i.test(html)) return false
  } else if (/U\.S\.\s*Senate/i.test(office)) {
    if (!/U\.?S\.?\s*Senate|United States Senate/i.test(html)) return false
  } else if (/President/i.test(office)) {
    if (!/President of the United States|U\.?S\.?\s*President/i.test(html)) return false
  }

  return true
}

// Try to discover a Ballotpedia URL for a candidate by:
//   1. Constructing https://ballotpedia.org/<First_Last>
//   2. Fetching it
//   3. Validating it's the right person via state + office match
// Returns the URL on a clean match, or null otherwise (404, disambiguation,
// wrong state, network error). Failing closed is intentional — we'd rather
// have a missing URL than a wrong one.
async function attemptFindBallotpediaUrl(
  name: string,
  state: string | null,
  office: string,
): Promise<string | null> {
  const slug = nameToBallotpediaSlug(name)
  const url = `https://ballotpedia.org/${slug}`

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RIPTool/1.0; +https://app.rip-tool.com)",
        Accept: "text/html",
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    if (!isCleanBallotpediaPage(html, state, office)) return null
    return url
  } catch {
    return null
  }
}

// FEC sometimes embeds honorifics inline with the name ("AXTELL SCHULTZ, DEBRA LEANNE MS").
// Strip them so display names read cleanly.
const HONORIFICS = new Set(["MR", "MR.", "MRS", "MRS.", "MS", "MS.", "DR", "DR."])

function stripHonorifics(name: string): string {
  return name
    .split(/\s+/)
    .filter((token) => !HONORIFICS.has(token.toUpperCase()))
    .join(" ")
    .trim()
}

// FEC stores names as "[LAST NAME], [FIRST] [MIDDLE...] [SUFFIX]" in ALL CAPS.
// We convert to "First Last [Suffix]" — preserving multi-word last names
// (e.g. "Axtell Schultz", "Van Buren") but DROPPING middle names and
// initials so cards read cleanly.
function formatFecName(fecName: string): string {
  if (fecName.includes(",")) {
    const [last, ...firstParts] = fecName.split(",")
    const firstSection = stripHonorifics(firstParts.join(" "))
    const lastClean = stripHonorifics(last)

    const tokens = firstSection.split(/\s+/).filter(Boolean)
    if (tokens.length === 0) {
      return titleCase(lastClean)
    }
    // We only keep the first token as the first name. Everything else
    // (middle names, initials, generational suffixes like "II"/"Jr") is
    // dropped — we want a clean "First Last" display name.
    const firstName = tokens[0]

    return `${titleCase(firstName)} ${titleCase(lastClean)}`.trim()
  }
  // Fallback: no comma — just title-case whatever we got
  return titleCase(stripHonorifics(fecName))
}

function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bMc(\w)/g, (_, c) => `Mc${c.toUpperCase()}`) // McDonald etc.
    .replace(/\bO'(\w)/g, (_, c) => `O'${c.toUpperCase()}`) // O'Brien etc.
}
