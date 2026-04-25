import { prisma } from "@/lib/prisma"

// ── Tier 1: DKIM selector (.s=) ─────────────────────────────────────────────

/**
 * Extract the plain text value from a header line that may be JSON-wrapped.
 * Headers are stored as:  headername: {"value":[...],"html":"...","text":"raw value"}
 * Falls back to treating the raw line value as plain text if JSON parse fails.
 */
function extractHeaderText(rawHeaders: string, headerName: string): string | null {
  const nameLower = headerName.toLowerCase()
  const searchKey = nameLower + ":"

  // ── Format A: multi-line MIME text (plain RFC 2822) ──────────────────────
  // e.g. "List-Unsubscribe: <https://...>\nMIME-Version: 1.0\n..."
  // Normalize CRLF → LF, unfold continuation lines (lines starting with whitespace)
  const normalized = rawHeaders.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ")
  for (const line of normalized.split("\n")) {
    const colonIdx = line.indexOf(":")
    if (colonIdx === -1) continue
    const name = line.substring(0, colonIdx).trim().toLowerCase()
    if (name !== nameLower) continue
    const value = line.substring(colonIdx + 1).trim()
    return parseHeaderValue(value)
  }

  // ── Format B: single-line JSON (mailparser stored format) ────────────────
  // e.g. "delivered-to: {"value":[...],"text":"..."} list-unsubscribe: {"value":[...],"text":"<https://...>"} ..."
  // Find the exact header key surrounded by whitespace (or start), followed by a JSON object.
  // We use indexOf on the lowercased string to find the position, then extract the JSON blob.
  const lower = rawHeaders.toLowerCase()
  let searchIdx = 0
  while (searchIdx < lower.length) {
    const keyIdx = lower.indexOf(searchKey, searchIdx)
    if (keyIdx === -1) break

    // Ensure this is a real header start — character before must be whitespace or start of string
    const charBefore = keyIdx === 0 ? " " : lower[keyIdx - 1]
    if (charBefore !== " " && charBefore !== "\n" && charBefore !== "\t") {
      searchIdx = keyIdx + 1
      continue
    }

    // Find the start of the value (after "headername: ")
    const valueStart = rawHeaders.indexOf(":", keyIdx) + 1
    const trimmedStart = rawHeaders.substring(valueStart).trimStart()
    const offset = valueStart + (rawHeaders.substring(valueStart).length - trimmedStart.length)

    if (trimmedStart.startsWith("{")) {
      // Extract the JSON blob by counting braces
      let depth = 0
      let end = offset
      for (let i = offset; i < rawHeaders.length; i++) {
        if (rawHeaders[i] === "{") depth++
        else if (rawHeaders[i] === "}") { depth--; if (depth === 0) { end = i + 1; break } }
      }
      const jsonBlob = rawHeaders.substring(offset, end)
      const result = parseHeaderValue(jsonBlob)
      if (result) return result
    }

    searchIdx = keyIdx + 1
  }

  return null
}

function parseHeaderValue(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.text === "string") return parsed.text
    if (Array.isArray(parsed?.value)) {
      return parsed.value.map((v: any) => v.text ?? v.value ?? "").join(", ")
    }
    return JSON.stringify(parsed)
  } catch {
    return raw
  }
}

/**
 * Extract the DKIM selector value from the DKIM-Signature header.
 * e.g. "DKIM-Signature: v=1; a=rsa-sha256; s=gears; ..." → "gears"
 */
export function extractDkimSelector(rawHeaders: string): string | null {
  const value = extractHeaderText(rawHeaders, "DKIM-Signature")
  if (!value) return null
  const sMatch = value.match(/\bs=([^;\s]+)/i)
  return sMatch ? sMatch[1].toLowerCase().trim() : null
}

/**
 * Look up a DKIM selector in the DkimSenderMapping table.
 * Returns the friendly provider name if found, null otherwise.
 */
export async function resolveDkimProvider(selector: string): Promise<string | null> {
  const mapping = await prisma.dkimSenderMapping.findUnique({
    where: { selectorValue: selector },
    select: { friendlyName: true },
  })
  return mapping?.friendlyName ?? null
}

// ── Tier 2: Unsubscribe URL domain ──────────────────────────────────────────

/**
 * Extract the host from the List-Unsubscribe header's HTTP URL.
 * Handles both plain-text and JSON-wrapped header formats.
 * Returns the full hostname (e.g. "unsubscribe.spmta.com") for accurate manual assignment.
 */
export function extractUnsubDomain(rawHeaders: string): string | null {
  const value = extractHeaderText(rawHeaders, "List-Unsubscribe")
  if (!value) return null

  // Extract the first https:// URL — skip mailto: entries
  const urlMatch = value.match(/https?:\/\/([^\/>\s,]+)/i)
  if (!urlMatch) return null

  return urlMatch[1].toLowerCase().trim()
}

/**
 * Ensure the unsub domain is recorded in UnsubDomainMapping.
 * Creates the row if it doesn't exist (with no friendlyName — manually assigned later).
 * Returns the friendly name if one has been assigned, null otherwise.
 */
export async function resolveUnsubProvider(domain: string): Promise<string | null> {
  const existing = await prisma.unsubDomainMapping.findUnique({
    where: { domain },
    select: { friendlyName: true },
  })
  if (existing) return existing.friendlyName ?? null

  // New domain — record it for manual assignment, no provider yet
  try {
    await prisma.unsubDomainMapping.create({ data: { domain } })
    console.log(`[resolveUnsubProvider] New domain inserted: ${domain}`)
  } catch (err: any) {
    // P2002 = unique constraint violation — already exists, safe to ignore
    if (err?.code !== "P2002") {
      console.error(`[resolveUnsubProvider] Failed to insert domain ${domain}:`, err)
    }
  }

  return null
}

// ── Private IP check ─────────────────────────────────────────────────────────

/**
 * Returns true if the IP is a private/internal/loopback address that
 * should never be used as a sending provider IP.
 */
function isPrivateIp(ip: string): boolean {
  if (ip === "127.0.0.1") return true
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4) return false
  // 10.0.0.0/8
  if (parts[0] === 10) return true
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true
  // 127.0.0.0/8
  if (parts[0] === 127) return true
  return false
}

/**
 * Extract the public sending IP from raw email headers.
 * Priority: client-ip= (Received-SPF) → sender IP (Authentication-Results) →
 *           first public IP in Received: from chain.
 * Skips all private/internal IP ranges.
 */
export function extractSendingIp(rawHeaders: string): string | null {
  // Received-SPF: pass (... client-ip=1.2.3.4; ...)
  const spfMatches = [...rawHeaders.matchAll(/client-ip=([\d.]+)/gi)]
  for (const m of spfMatches) {
    if (!isPrivateIp(m[1])) return m[1]
  }

  // Authentication-Results: ... sender IP is 1.2.3.4
  const authMatches = [...rawHeaders.matchAll(/sender IP is ([\d.]+)/gi)]
  for (const m of authMatches) {
    if (!isPrivateIp(m[1])) return m[1]
  }

  // Received: from 1.2.3.4 (EHLO ...) — bare IP directly after "from "
  const receivedFromBare = [...rawHeaders.matchAll(/[Rr]eceived:[^\n]*\bfrom\s+([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})\b/gi)]
  for (const m of receivedFromBare) {
    if (!isPrivateIp(m[1])) return m[1]
  }

  // Received: from hostname ([1.2.3.4]) — IP in brackets
  const receivedBracket = [...rawHeaders.matchAll(/[Rr]eceived:[^\n]*\[([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})\]/gi)]
  for (const m of receivedBracket) {
    if (!isPrivateIp(m[1])) return m[1]
  }

  // Last resort: any public IP anywhere in the headers
  const anyIp = [...rawHeaders.matchAll(/\b([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})\b/g)]
  for (const m of anyIp) {
    if (!isPrivateIp(m[1])) return m[1]
  }

  return null
}

/**
 * Extract org name from an RDAP network object's entities array.
 * Prefers the "registrant" role, falls back to any entity with a name.
 */
function extractOrgNameFromEntities(entities: any[]): string | null {
  if (!Array.isArray(entities)) return null

  // First pass: registrant role only
  for (const entity of entities) {
    if (Array.isArray(entity.roles) && entity.roles.includes("registrant")) {
      const vcards = entity.vcardArray?.[1] ?? []
      const fn = vcards.find((v: any[]) => v[0] === "fn")
      if (fn?.[3]) return fn[3]
      // Some ARIN entities use handle as the name
      if (entity.handle) return entity.handle
    }
  }

  // Second pass: any entity with a vcard fn
  for (const entity of entities) {
    const vcards = entity.vcardArray?.[1] ?? []
    const fn = vcards.find((v: any[]) => v[0] === "fn")
    if (fn?.[3]) return fn[3]
  }

  return null
}

/**
 * Look up ARIN RDAP for an IP and return org name + CIDR.
 *
 * ARIN returns the MOST SPECIFIC network block for the queried IP as the
 * top-level object. For reassigned IPs (e.g. a /25 inside a /19), the
 * top-level data IS the most specific record (e.g. MessageGears), not the
 * parent allocation (e.g. Limestone Networks).
 *
 * We extract orgName from the top-level entities first. If that yields only
 * abuse/tech contacts and no registrant, we also check the `networks` array
 * that ARIN sometimes includes for parent context, but we still prefer the
 * top-level (most specific) result.
 *
 * Returns null if the lookup fails or times out.
 */
export async function lookupRdap(ip: string): Promise<{ orgName: string | null; cidr: string | null } | null> {
  try {
    const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`, {
      headers: { Accept: "application/rdap+json, application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()

    // The top-level `data` object is the most specific network for this IP.
    // Extract orgName from its entities (registrant preferred).
    let orgName = extractOrgNameFromEntities(data.entities ?? [])

    // If no registrant found in top-level entities, check if ARIN embedded
    // child network records in a `networks` array (some RDAP implementations).
    if (!orgName && Array.isArray(data.networks)) {
      for (const network of data.networks) {
        const candidate = extractOrgNameFromEntities(network.entities ?? [])
        if (candidate) { orgName = candidate; break }
      }
    }

    // Last resort: use the NetName field (data.name) which is always the
    // most-specific network name (e.g. "MESSAGEGEARS-1")
    if (!orgName && data.name) {
      orgName = data.name
    }

    // CIDR: prefer cidr0 extension (most accurate), fall back to handle
    const cidr: string | null = data.cidr0_cidrs?.[0]
      ? `${data.cidr0_cidrs[0].v4prefix}/${data.cidr0_cidrs[0].length}`
      : data.handle ?? null

    return { orgName, cidr }
  } catch {
    return null
  }
}

/**
 * Reverse DNS (PTR) lookup via Google's DNS-over-HTTPS.
 */
export async function lookupReverseDns(ip: string): Promise<string | null> {
  try {
    // Convert to in-addr.arpa format
    const reversed = ip.split(".").reverse().join(".") + ".in-addr.arpa"
    const res = await fetch(`https://dns.google/resolve?name=${reversed}&type=PTR`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const ptr = data.Answer?.[0]?.data as string | undefined
    return ptr?.replace(/\.$/, "") ?? null
  } catch {
    return null
  }
}

/**
 * Given an IP, ensure an IpSenderMapping row exists with RDAP + PTR data.
 * Returns the mapping row (existing or newly created).
 */
export async function ensureIpMapping(ip: string) {
  // Already mapped?
  const existing = await prisma.ipSenderMapping.findUnique({ where: { ip } })
  if (existing) return existing

  // Look up RDAP + PTR concurrently
  const [rdap, ptr] = await Promise.all([lookupRdap(ip), lookupReverseDns(ip)])

  const mapping = await prisma.ipSenderMapping.create({
    data: {
      ip,
      cidr: rdap?.cidr ?? null,
      orgName: rdap?.orgName ?? null,
      reverseDns: ptr,
      rdapChecked: true,
      lastLookedUpAt: new Date(),
    },
  })

  return mapping
}

/**
 * Resolve the display name for an IP mapping.
 * Prefers friendlyName → orgName → reverseDns → raw IP.
 */
export function resolveProviderName(mapping: {
  friendlyName: string | null
  orgName: string | null
  reverseDns: string | null
  ip: string
}): string {
  return mapping.friendlyName ?? mapping.orgName ?? mapping.reverseDns ?? mapping.ip
}
