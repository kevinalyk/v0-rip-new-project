// Scraper for Ballotpedia state-level election pages (e.g. Alabama House/Senate 2026)
// Ballotpedia renders ALL election tabs (Primary, Runoff, General) in the full HTML —
// the hash fragment (#General_election) is purely client-side JS. So we scrape all
// wikitable candidates tables and tag each row with the section it appears under.

export interface ScrapedCandidate {
  district: string
  office: string
  name: string
  ballotpediaUrl: string | null
  party: "Democratic" | "Republican" | "Other" | "Unknown"
  isIncumbent: boolean
  completedSurvey: boolean
  didNotMakeBallot: boolean
  electionType: string // "Primary" | "General election" | "Primary runoff" | etc
  state: string
  chamber: string // "House" | "Senate"
}

export async function scrapeStateLevelElection(url: string): Promise<ScrapedCandidate[]> {
  // Strip hash — server doesn't use it
  const cleanUrl = url.split("#")[0]

  const response = await fetch(cleanUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${cleanUrl}: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  console.log(`[ballotpedia-scraper] Fetched HTML length: ${html.length}`)

  const context = extractStateAndChamber(url)
  return parseHtml(html, context)
}

function extractStateAndChamber(url: string): { state: string; chamber: string } {
  const path = decodeURIComponent(url.split("/").pop() || "")
  // e.g. "Alabama_House_of_Representatives_elections,_2026"
  // e.g. "Alabama_State_Senate_elections,_2026"
  const stateMatch = path.match(/^([A-Za-z_]+?)_(House_of_Representatives|State_House|House|State_Senate|Senate)_elections/)
  if (!stateMatch) return { state: "Unknown", chamber: "Unknown" }

  const state = stateMatch[1].replace(/_/g, " ")
  const chamberRaw = stateMatch[2]
  const chamber =
    chamberRaw.toLowerCase().includes("senate") ? "Senate" : "House"

  return { state, chamber }
}

function parseHtml(html: string, context: { state: string; chamber: string }): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []

  // ── Find all sections (h2/h3) and the content that follows each ──────────
  // We split the HTML on heading tags so we know which election type
  // (Primary, General, Runoff) each table belongs to.
  //
  // Strategy: find each <span id="..."> anchor that Ballotpedia uses for tabs,
  // then extract the wikitables that follow until the next anchor.

  // Collect all span id anchors and their positions — these correspond to the tabs
  const anchorRegex = /<span[^>]+id="([^"]+)"[^>]*>/gi
  const anchors: Array<{ id: string; index: number }> = []
  let anchorMatch: RegExpExecArray | null
  while ((anchorMatch = anchorRegex.exec(html)) !== null) {
    anchors.push({ id: anchorMatch[1], index: anchorMatch.index })
  }

  // Also find all wikitables and their positions
  const wikitableRegex = /<table[^>]+class="[^"]*wikitable[^"]*"[^>]*>([\s\S]*?)<\/table>/gi
  const tables: Array<{ html: string; index: number }> = []
  let tableMatch: RegExpExecArray | null
  while ((tableMatch = wikitableRegex.exec(html)) !== null) {
    tables.push({ html: tableMatch[0], index: tableMatch.index })
  }

  console.log(`[ballotpedia-scraper] Found ${anchors.length} anchors, ${tables.length} wikitables`)

  if (tables.length === 0) {
    // Fallback: try any <table> with Office/Democratic/Republican headers
    console.warn("[ballotpedia-scraper] No wikitables found, trying any table")
    const anyTableRegex = /<table[\s\S]*?<\/table>/gi
    let m: RegExpExecArray | null
    while ((m = anyTableRegex.exec(html)) !== null) {
      if (m[0].toLowerCase().includes("office") && m[0].toLowerCase().includes("republican")) {
        tables.push({ html: m[0], index: m.index })
      }
    }
    console.log(`[ballotpedia-scraper] Fallback found ${tables.length} candidate tables`)
  }

  // For each table, find which anchor section it falls under
  for (const table of tables) {
    // Check if this table looks like a candidates table (has Office column)
    if (!table.html.toLowerCase().includes("office") || 
        (!table.html.toLowerCase().includes("republican") && !table.html.toLowerCase().includes("democratic"))) {
      continue
    }

    // Find the nearest anchor before this table
    let electionType = "Unknown"
    for (let i = anchors.length - 1; i >= 0; i--) {
      if (anchors[i].index < table.index) {
        electionType = anchors[i].id.replace(/_/g, " ").replace(/\d+$/, "").trim()
        break
      }
    }

    const rows = parseWikitable(table.html, context, electionType)
    candidates.push(...rows)
  }

  return candidates
}

function parseWikitable(
  tableHtml: string,
  context: { state: string; chamber: string },
  electionType: string,
): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []

  // Extract all rows
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi
  const rows = tableHtml.match(rowRegex) || []

  if (rows.length < 2) return candidates

  // Parse header to determine column → party mapping
  const headerRow = rows[0]
  const headerCells = extractCells(headerRow)
  const colPartyMap: Record<number, "Democratic" | "Republican" | "Other"> = {}

  headerCells.forEach((cell, idx) => {
    const text = stripHtml(cell).toLowerCase()
    if (text.includes("democrat")) colPartyMap[idx] = "Democratic"
    else if (text.includes("republican")) colPartyMap[idx] = "Republican"
    else if (text.includes("other") || text.includes("independent")) colPartyMap[idx] = "Other"
  })

  // Parse data rows
  for (let i = 1; i < rows.length; i++) {
    const cells = extractCells(rows[i])
    if (cells.length < 2) continue

    const district = stripHtml(cells[0]).trim()
    if (!district) continue

    // Process each party column
    for (const [colIdxStr, party] of Object.entries(colPartyMap)) {
      const colIdx = parseInt(colIdxStr)
      if (colIdx >= cells.length) continue

      const cellHtml = cells[colIdx]
      const cellCandidates = extractCandidatesFromCell(cellHtml, district, context, electionType, party)
      candidates.push(...cellCandidates)
    }
  }

  return candidates
}

function extractCells(rowHtml: string): string[] {
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  const cells: string[] = []
  let m: RegExpExecArray | null
  while ((m = cellRegex.exec(rowHtml)) !== null) {
    cells.push(m[1])
  }
  return cells
}

function extractCandidatesFromCell(
  cellHtml: string,
  district: string,
  context: { state: string; chamber: string },
  electionType: string,
  party: "Democratic" | "Republican" | "Other",
): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []

  // Skip obviously empty or status-only cells
  const plainText = stripHtml(cellHtml).trim()
  if (!plainText || plainText.length < 2) return candidates

  // Skip cells that are just status messages with no names
  const statusOnlyPhrases = [
    "primary was canceled",
    "primary results pending",
    "no candidates",
  ]
  if (statusOnlyPhrases.some((p) => plainText.toLowerCase().includes(p)) &&
      !cellHtml.includes('<a ')) {
    return candidates
  }

  // Find all candidate links
  const linkRegex = /<a[^>]+href="(https?:\/\/ballotpedia\.org\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const links: Array<{ href: string; text: string; fullMatch: string; index: number }> = []
  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkRegex.exec(cellHtml)) !== null) {
    const text = stripHtml(linkMatch[2]).trim()
    if (text.length > 1) {
      links.push({ href: linkMatch[1], text, fullMatch: linkMatch[0], index: linkMatch.index })
    }
  }

  if (links.length > 0) {
    for (const link of links) {
      // Get context around this link to check incumbent/survey markers
      const surrounding = cellHtml.slice(link.index, link.index + link.fullMatch.length + 20)

      const isIncumbent = /\(i\)/.test(surrounding) || /\(i\)/.test(
        cellHtml.slice(Math.max(0, link.index - 5), link.index + link.fullMatch.length + 10)
      )
      const completedSurvey = /[ⒸC]/.test(surrounding) || /✓/.test(surrounding)
      const didNotMakeBallot = cellHtml.toLowerCase().includes("did not make") &&
        cellHtml.includes(link.text)

      // Clean name — strip trailing markers like (i), *, Ⓒ
      const name = link.text.replace(/\s*[\*(i)Ⓒ✓]+\s*/g, "").trim()

      if (!name) continue

      candidates.push({
        district,
        office: `${context.state} ${context.chamber}`,
        name,
        ballotpediaUrl: link.href,
        party,
        isIncumbent,
        completedSurvey,
        didNotMakeBallot,
        electionType,
        state: context.state,
        chamber: context.chamber,
      })
    }
  } else if (plainText.length > 1) {
    // No links — plain text name (rare but possible)
    const statusPhrases = ["canceled", "pending", "no candidate", "results pending"]
    if (statusPhrases.some((p) => plainText.toLowerCase().includes(p))) return candidates

    candidates.push({
      district,
      office: `${context.state} ${context.chamber}`,
      name: plainText.replace(/\s*\([^)]*\)/g, "").replace(/[*✓Ⓒ]/g, "").trim(),
      ballotpediaUrl: null,
      party,
      isIncumbent: plainText.includes("(i)"),
      completedSurvey: false,
      didNotMakeBallot: false,
      electionType,
      state: context.state,
      chamber: context.chamber,
    })
  }

  return candidates
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
