// Scraper for Ballotpedia state-level election pages (e.g. Alabama House/Senate 2026)
// Extracts candidate data from HTML tables structured as:
//   Office | Democratic | Republican | Other
// where each cell can contain candidate names and status markers.

export interface ScrapedCandidate {
  district: string
  office: string
  name: string
  party: "Democratic" | "Republican" | "Other" | "Independent"
  isIncumbent: boolean
  completedBallotpediaSurvey: boolean
  status: string // e.g., "Primary was canceled", "Did not make ballot", etc
}

interface RawTableRow {
  office: string
  democratic: string
  republican: string
  other: string
}

// Extract all candidate data from a Ballotpedia state election page
export async function scrapeStateLevelElection(url: string): Promise<ScrapedCandidate[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  }

  const html = await response.text()
  return parseStateElectionHtml(html, extractStateAndLevel(url))
}

// Extract state and chamber level from URL
function extractStateAndLevel(url: string): { state: string; level: string } {
  // e.g., "Alabama_House_of_Representatives_elections,_2026"
  // or "Alabama_State_Senate_elections,_2026"
  const match = url.match(/\/([^/]+)_(House_of_Representatives|State_Senate|House|Senate)_elections,_2026/)
  if (!match) {
    return { state: "Unknown", level: "Unknown" }
  }

  const state = match[1].replace(/_/g, " ")
  const level =
    match[2] === "House_of_Representatives" || match[2] === "House"
      ? "House"
      : match[2] === "State_Senate" || match[2] === "Senate"
        ? "Senate"
        : match[2]

  return { state, level }
}

// Parse the HTML and extract candidate data from the candidates table
function parseStateElectionHtml(
  html: string,
  context: { state: string; level: string },
): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []

  // Find the "Candidates" section and the table that follows
  const candidatesSectionMatch = html.match(
    /<h\d[^>]*>\s*Candidates\s*<\/h\d>([\s\S]*?)(?=<h\d[\s>]|$)/i,
  )
  if (!candidatesSectionMatch) {
    console.warn("[ballotpedia-state-scraper] No Candidates section found")
    return []
  }

  const candidatesSection = candidatesSectionMatch[1]

  // Find all tables within the Candidates section
  const tables = candidatesSection.match(/<table[\s\S]*?<\/table>/gi) || []

  for (const table of tables) {
    const rows = parseTable(table, context)
    candidates.push(...rows)
  }

  return candidates
}

// Parse a single table and extract row data
function parseTable(
  tableHtml: string,
  context: { state: string; level: string },
): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []
  const office = context.level // "House" or "Senate"

  // Extract table rows (skip header)
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) || []

  // Skip first row (header)
  for (let i = 1; i < rowMatches.length; i++) {
    const rowHtml = rowMatches[i]
    const cells = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || []

    if (cells.length < 2) continue

    // Extract district/office label from first cell
    const districtCell = cleanCellContent(cells[0])
    if (!districtCell) continue

    // Process remaining cells (party columns)
    // Usually: Democratic | Republican | Other (but may vary)
    for (let j = 1; j < cells.length; j++) {
      const cellContent = cells[j]
      const candidatesInCell = extractCandidatesFromCell(cellContent, districtCell, office)
      candidates.push(...candidatesInCell)
    }
  }

  return candidates
}

// Extract candidates from a single table cell
function extractCandidatesFromCell(
  cellHtml: string,
  district: string,
  office: string,
): ScrapedCandidate[] {
  const candidates: ScrapedCandidate[] = []

  // Determine party from column header or context
  // This is heuristic — we'll need to check the <th> context
  // For now, just extract all names from the cell

  // Extract all links (candidate names)
  const nameMatches = cellHtml.match(/<a[^>]+href="[^"]*"[^>]*>([^<]+)<\/a>/gi) || []

  for (const nameMatch of nameMatches) {
    const name = nameMatch.replace(/<[^>]+>/g, "").trim()
    if (!name) continue

    // Check status markers
    const isIncumbent = cellHtml.includes("(i)") && nameMatch.includes("(i)")
    const completedSurvey =
      cellHtml.includes("Ⓒ") || cellHtml.includes("&Ⓒ;") || cellHtml.includes("✓")
    const status = extractCellStatus(cellHtml)

    candidates.push({
      district,
      office,
      name: name.replace(/\s*\([^)]*\)/g, "").trim(), // Remove inline markers
      party: "Unknown", // Will be determined from column headers later
      isIncumbent,
      completedBallotpediaSurvey: completedSurvey,
      status,
    })
  }

  // If no links found, extract plain text candidates
  if (candidates.length === 0) {
    const plainText = cleanCellContent(cellHtml)
    if (plainText && plainText.length > 2 && !plainText.toLowerCase().includes("canceled")) {
      candidates.push({
        district,
        office,
        name: plainText,
        party: "Unknown",
        isIncumbent: plainText.includes("(i)"),
        completedBallotpediaSurvey: plainText.includes("*"),
        status: "",
      })
    }
  }

  return candidates
}

// Extract status message from a cell (e.g., "Primary was canceled")
function extractCellStatus(cellHtml: string): string {
  // Look for common status messages
  const statusPatterns = [
    /Primary was canceled/i,
    /Primary runoff/i,
    /Did not make ballot/i,
    /Primary results pending/i,
    /General election/i,
  ]

  for (const pattern of statusPatterns) {
    const match = cellHtml.match(pattern)
    if (match) {
      return match[0]
    }
  }

  return ""
}

// Clean HTML cell content to extract plain text
function cleanCellContent(cellHtml: string): string {
  return cellHtml
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
}
