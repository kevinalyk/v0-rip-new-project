import { prisma } from "@/lib/prisma"

/**
 * Extract the sending IP from raw email headers.
 * Priority: client-ip= (Received-SPF) → sender IP (Authentication-Results) → Received: from
 */
export function extractSendingIp(rawHeaders: string): string | null {
  // Received-SPF: pass (... client-ip=1.2.3.4; ...)
  const spfMatch = /client-ip=([\d.]+)/i.exec(rawHeaders)
  if (spfMatch) return spfMatch[1]

  // Authentication-Results: ... sender IP is 1.2.3.4
  const authMatch = /sender IP is ([\d.]+)/i.exec(rawHeaders)
  if (authMatch) return authMatch[1]

  // Received: from hostname ([1.2.3.4]) — first external hop
  const receivedMatch = /Received: from [^\n]*\[([\d.]+)\]/i.exec(rawHeaders)
  if (receivedMatch) return receivedMatch[1]

  return null
}

/**
 * Look up ARIN RDAP for an IP and return org name + CIDR.
 * Returns null if the lookup fails or times out.
 */
export async function lookupRdap(ip: string): Promise<{ orgName: string | null; cidr: string | null } | null> {
  try {
    const res = await fetch(`https://rdap.arin.net/registry/ip/${ip}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()

    // OrgName lives in entities[].vcardArray or entities[].handle
    let orgName: string | null = null
    if (Array.isArray(data.entities)) {
      for (const entity of data.entities) {
        if (Array.isArray(entity.roles) && entity.roles.includes("registrant")) {
          // vcardArray: [["vcard", [["fn", {}, "text", "OrgName"], ...]]]
          const vcards = entity.vcardArray?.[1] ?? []
          const fn = vcards.find((v: any[]) => v[0] === "fn")
          if (fn?.[3]) { orgName = fn[3]; break }
        }
      }
      // Fallback: first entity with a name
      if (!orgName) {
        for (const entity of data.entities) {
          const vcards = entity.vcardArray?.[1] ?? []
          const fn = vcards.find((v: any[]) => v[0] === "fn")
          if (fn?.[3]) { orgName = fn[3]; break }
        }
      }
    }

    // CIDR from handle or cidr0 extension
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
