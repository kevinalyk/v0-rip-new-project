import { unzipSync, strFromU8 } from "fflate"
import prisma from "@/lib/prisma"

export type DomainCategory =
  | "president"
  | "congress"
  | "senate"
  | "governor"
  | "state_legislature"
  | "local"
  | "general"
  | "candidate_name"

export const CATEGORY_LABELS: Record<DomainCategory, string> = {
  congress: "Congress",
  senate: "Senate",
  governor: "Governor",
  president: "President",
  state_legislature: "State Legislature",
  local: "Local Office",
  general: "Other Political",
  candidate_name: "Candidate Name Match",
}

export const CATEGORY_ORDER: DomainCategory[] = [
  "congress",
  "senate",
  "governor",
  "president",
  "state_legislature",
  "local",
  "general",
  "candidate_name",
]

interface Rule {
  category: DomainCategory
  keyword: string
  pattern: RegExp
}

// Order matters: the first match wins, so the more specific rules come first
// (e.g. "forstatesenate" must resolve to state_legislature, not senate).
// Patterns run against the label with hyphens removed.
const RULES: Rule[] = [
  {
    category: "state_legislature",
    keyword: "state legislature",
    pattern:
      /(for|4)(state)?(assembly|assemblyman|assemblywoman|statehouse|statesenate|statesen|staterep|delegate|legislature)|statesenat|statehouse|assembly(man|woman)/,
  },
  { category: "governor", keyword: "governor", pattern: /governor|gubernatorial|(for|4)gov(\d|$)/ },
  { category: "senate", keyword: "senate", pattern: /senat(e|or)/ },
  { category: "congress", keyword: "congress", pattern: /congress|(for|4)(house|rep|representative)(\d|$)/ },
  { category: "president", keyword: "president", pattern: /(for|4)(president|potus)(\d|$)|president(ial)?2028/ },
  {
    category: "local",
    keyword: "local office",
    pattern:
      /(for|4)(mayor|sheriff|judge|council|councilman|councilwoman|commissioner|clerk|treasurer|schoolboard|attorney|attorneygeneral|auditor|coroner|constable|assessor|supervisor|alderman|selectboard)(\d|$)/,
  },
  {
    category: "general",
    keyword: "political keyword",
    pattern: /reelect|republican|conservativ|gopfor|forgop/,
  },
]

export type Confidence = "high" | "medium" | "low"

// A real campaign domain is nearly always "<name>for<office>", optionally
// followed by a year or a short suffix, e.g. fergusonforsenate2028.
const OFFICE_WORDS =
  "president|potus|senator|senate|congressman|congresswoman|congress|representative|rep|house|governor|gov|mayor|sheriff|judge|councilman|councilwoman|council|commissioner|clerk|treasurer|schoolboard|attorneygeneral|attorney|auditor|coroner|constable|assessor|supervisor|alderman|selectboard|assemblyman|assemblywoman|assembly|statehouse|statesenate|statesen|staterep|delegate|legislature|ltgovernor|ltgov"
const FOR_OFFICE_SHAPE = new RegExp(
  `^[a-z0-9]{3,}(?:for|4)(?:us|the|our|state)?(?:${OFFICE_WORDS})(?:\\d{1,4}|hq|official|team|campaign|pac|now)*$`,
)

// Signals that only make sense for a US race. Office words like "mayor" or
// "president" exist everywhere, so they do not count on their own.
const US_SIGNAL =
  /(for|4)us(senate|congress|house|rep)|^us(senate|congress|house|rep)|sheriff|schoolboard|statehouse|statesen|staterep|assembly(man|woman)?|county|potus|america|republican|conservativ|gopfor|forgop/
const US_TOKEN = /(^|-)(gop|usa)(-|$)/

// Spam, crypto and non-English words that slip in through the loose office keywords.
const BLOCKED_WORDS =
  /hyperliquid|hyperliuquid|moonshot|airdrop|crypto|bitcoin|memecoin|binance|solana|ethereum|casino|forex|giveaway|sweepstake|porn|xxx|diplomatie|diplomat|wahl|eleccion|votacion|votar/

// Checked after state names are stripped, so "indiana" does not trip "india".
const FOREIGN_PLACES =
  /argentina|nigeria|ghana|gambia|kenya|uganda|pakistan|bangladesh|philippines|indonesia|brazil|ukraine|russia|turkey|egypt|morocco|algeria|tunisia|southafrica|zimbabwe|zambia|malawi|tanzania|cameroon|senegal|liberia|sierraleone|ethiopia|rwanda|somalia|sudan|nepal|srilanka|malaysia|vietnam|thailand|australia|newzealand|canada|canadian|mexico|jamaica|haiti|trinidad|guyana|peru|chile|colombia|venezuela|ecuador|israel|iran|iraq|syria|korea|japan|china|taiwan|hongkong|france|germany|italy|spain|portugal|netherlands|belgium|poland|romania|greece|sweden|norway|denmark|finland|switzerland|india/

const GOP_TOKEN = /(^|-)gop(-|$)/

// Two-letter ccTLDs are almost never US political registrations. Keep the few
// that double as generic TLDs.
const ALLOWED_SHORT_TLDS = new Set(["us", "co", "io", "tv", "me", "cc", "ai"])

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  newhampshire: "NH", newjersey: "NJ", newmexico: "NM", newyork: "NY", northcarolina: "NC",
  northdakota: "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  rhodeisland: "RI", southcarolina: "SC", southdakota: "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", westvirginia: "WV", washington: "WA",
  wisconsin: "WI", wyoming: "WY",
}
const STATE_NAME_KEYS = Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length)

const NAME_CONTEXT = /(for|4|vote|elect|pac|campaign|committee|friends|team|win|official|hq|2024|2026|2028|2030)/
const NAME_SUFFIX_WORDS = new Set(["campaign", "for", "congress", "senate", "pac", "committee", "inc", "jr", "sr", "ii", "iii", "iv"])

export interface NameIndexEntry {
  key: string
  entityId: string | null
  state: string | null
}

export interface DomainMatch {
  category: DomainCategory
  keyword: string | null
  state: string | null
  linkedEntityId: string | null
  confidence: Confidence
}

const STATE_NAME_PATTERN = new RegExp(STATE_NAME_KEYS.join("|"), "g")

function lettersOnly(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "")
}

// Turns "SMITH, JOHN A" or "John Smith Campaign" into "johnsmith".
export function personKey(rawName: string): string | null {
  let first: string
  let last: string
  if (rawName.includes(",")) {
    const [lastPart, rest] = rawName.split(",", 2)
    last = lettersOnly(lastPart)
    first = lettersOnly((rest || "").trim().split(/\s+/)[0] || "")
  } else {
    const tokens = rawName
      .split(/\s+/)
      .map((token) => lettersOnly(token))
      .filter((token) => token && !NAME_SUFFIX_WORDS.has(token))
    if (tokens.length < 2) return null
    first = tokens[0]
    last = tokens[tokens.length - 1]
  }
  if (first.length < 2 || last.length < 3) return null
  const key = first + last
  return key.length >= 9 ? key : null
}

export async function buildNameIndex(): Promise<NameIndexEntry[]> {
  const [entities, launches] = await Promise.all([
    prisma.ciEntity.findMany({
      where: { type: "politician", isCorporate: false },
      select: { id: true, name: true, state: true },
    }),
    prisma.campaignLaunch.findMany({
      where: { status: "active" },
      select: { name: true, state: true, linkedEntityId: true },
    }),
  ])

  const byKey = new Map<string, NameIndexEntry>()
  for (const entity of entities) {
    const key = personKey(entity.name)
    if (key) byKey.set(key, { key, entityId: entity.id, state: normalizeStateCode(entity.state) })
  }
  for (const launch of launches) {
    const key = personKey(launch.name)
    if (!key) continue
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.entityId && launch.linkedEntityId) existing.entityId = launch.linkedEntityId
      if (!existing.state) existing.state = normalizeStateCode(launch.state)
    } else {
      byKey.set(key, { key, entityId: launch.linkedEntityId, state: normalizeStateCode(launch.state) })
    }
  }
  return Array.from(byKey.values())
}

function normalizeStateCode(state: string | null | undefined): string | null {
  if (!state) return null
  const code = state.trim().toUpperCase()
  return code.length === 2 && code !== "US" ? code : null
}

export function splitDomain(domain: string): { label: string; tld: string } | null {
  const parts = domain.split(".")
  if (parts.length < 2) return null
  return { label: parts[0], tld: parts[parts.length - 1] }
}

export function classifyDomain(domain: string, names: NameIndexEntry[]): DomainMatch | null {
  const parts = splitDomain(domain)
  if (!parts) return null
  const { label, tld } = parts
  if (label.length < 6 || label.length > 60 || label.startsWith("xn--")) return null
  if (tld.length === 2 && !ALLOWED_SHORT_TLDS.has(tld)) return null

  const compact = label.replace(/-/g, "")

  if (BLOCKED_WORDS.test(compact)) return null
  if (FOREIGN_PLACES.test(compact.replace(STATE_NAME_PATTERN, ""))) return null

  let category: DomainCategory | null = null
  let keyword: string | null = null
  for (const rule of RULES) {
    if (rule.pattern.test(compact)) {
      category = rule.category
      keyword = rule.keyword
      break
    }
  }
  if (!category && GOP_TOKEN.test(label)) {
    category = "general"
    keyword = "gop"
  }

  let nameMatch: NameIndexEntry | null = null
  if (compact.length >= 9) {
    for (const entry of names) {
      const at = compact.indexOf(entry.key)
      if (at === -1) continue
      if (category) {
        nameMatch = entry
        break
      }
      const remainder = compact.slice(0, at) + compact.slice(at + entry.key.length)
      if (remainder === "" || NAME_CONTEXT.test(remainder)) {
        nameMatch = entry
        break
      }
    }
  }

  if (!category && nameMatch) {
    category = "candidate_name"
    keyword = "tracked candidate name"
  }
  if (!category) return null

  let state: string | null = null
  for (const stateName of STATE_NAME_KEYS) {
    if (compact.includes(stateName)) {
      state = STATE_NAMES[stateName]
      break
    }
  }
  if (!state && nameMatch) state = nameMatch.state

  const hasUsSignal = tld === "us" || US_SIGNAL.test(compact) || US_TOKEN.test(label) || state !== null
  const hasOfficeShape = FOR_OFFICE_SHAPE.test(compact)

  let confidence: Confidence
  if (nameMatch) confidence = "high"
  else if (hasOfficeShape && hasUsSignal) confidence = "high"
  else if (hasOfficeShape && (category === "senate" || category === "congress" || category === "governor")) {
    confidence = "medium"
  } else if (hasUsSignal) confidence = "medium"
  else confidence = "low"

  return { category, keyword, state, linkedEntityId: nameMatch?.entityId ?? null, confidence }
}

// WhoisDS publishes a free zip of newly registered domains per day. The file
// URL embeds the base64 of "<YYYY-MM-DD>.zip".
export async function fetchNewDomainList(date: string): Promise<string[] | null> {
  const encoded = Buffer.from(`${date}.zip`).toString("base64")
  const response = await fetch(`https://whoisds.com/whois-database/newly-registered-domains/${encoded}/nrd`, {
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) return null

  const bytes = new Uint8Array(await response.arrayBuffer())
  // Zip files start with "PK"; anything else is an error page.
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null

  const files = unzipSync(bytes)
  const first = Object.values(files)[0]
  if (!first) return null

  return strFromU8(first)
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter(Boolean)
}

function isoDate(daysAgo: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

export interface ScanSummary {
  date: string
  listed: number
  matched: number
  inserted: number
  status: "ok" | "unavailable"
}

// Scans the last `days` daily lists (starting from yesterday). Safe to re-run:
// domains are unique so repeat scans only insert what's new.
export async function scanNewDomains(days: number): Promise<ScanSummary[]> {
  const names = await buildNameIndex()
  const summaries: ScanSummary[] = []

  for (let offset = 1; offset <= days; offset++) {
    const date = isoDate(offset)
    let list: string[] | null = null
    try {
      list = await fetchNewDomainList(date)
    } catch {
      list = null
    }
    if (!list) {
      summaries.push({ date, listed: 0, matched: 0, inserted: 0, status: "unavailable" })
      continue
    }

    const registeredOn = new Date(`${date}T00:00:00.000Z`)
    const rows: {
      domain: string
      tld: string
      category: DomainCategory
      matchedKeyword: string | null
      state: string | null
      linkedEntityId: string | null
      confidence: Confidence
      registeredOn: Date
    }[] = []

    for (const domain of list) {
      const match = classifyDomain(domain, names)
      if (!match) continue
      rows.push({
        domain,
        tld: domain.slice(domain.lastIndexOf(".") + 1),
        category: match.category,
        matchedKeyword: match.keyword,
        state: match.state,
        linkedEntityId: match.linkedEntityId,
        confidence: match.confidence,
        registeredOn,
      })
    }

    let inserted = 0
    for (let i = 0; i < rows.length; i += 500) {
      const result = await prisma.newDomainRegistration.createMany({
        data: rows.slice(i, i + 500),
        skipDuplicates: true,
      })
      inserted += result.count
    }
    summaries.push({ date, listed: list.length, matched: rows.length, inserted, status: "ok" })
  }

  return summaries
}
