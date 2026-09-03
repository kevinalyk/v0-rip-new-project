import { PrismaClient } from "@prisma/client"
import { generateObject } from "ai"
import { z } from "zod"
import { nanoid } from "nanoid"
import { isSenderThirdParty, isPhoneThirdParty, invalidateEntityMappingCache } from "@/lib/ci-mapping-cache"

const prisma = new PrismaClient()

// Intentionally NOT sending Slack alerts from manual/retroactive assignment in
// this file. `assignCampaignsToEntity` / `assignSmsToEntity` (below) only ever
// run against messages that already existed and failed entity detection at
// ingestion time - by definition backlog, not something that "just happened."
// Alerting here previously caused day(s)-old messages to show up in Slack as
// "New email!" the moment someone clicked "Assign sender." Live alerts belong
// only at the two true ingestion points: processCompetitiveInsights() (email)
// and the SMS webhook, where entityId is set the moment the message arrives.
// We still backfill a shareToken here since share links/digests depend on it
// regardless of how a message got assigned.

async function ensureShareTokenForCampaign(campaign: { id: string; shareToken: string | null }): Promise<void> {
  if (campaign.shareToken) return
  await prisma.competitiveInsightCampaign.update({
    where: { id: campaign.id },
    data: { shareToken: nanoid(16), shareTokenCreatedAt: new Date(), shareTokenSource: "Manual Assignment" },
  })
}

async function ensureShareTokenForSms(sms: { id: string; shareToken: string | null }): Promise<void> {
  if (sms.shareToken) return
  await prisma.smsQueue.update({
    where: { id: sms.id },
    data: { shareToken: nanoid(16), shareTokenCreatedAt: new Date(), shareTokenSource: "Manual Assignment" },
  })
}

// Type for platform-specific donation identifiers
export type DonationIdentifiers = {
  winred?: string[]
  anedot?: string[]
  actblue?: string[]
  psqimpact?: string[]
  ngpvan?: string[]
  engage?: string[] // Engage subdomain e.g. "tomemmer" from engage.tomemmer.com
  substack?: string // Substack handle e.g. "kirstengillibrand"
  revv?: string[]   // Revv slug e.g. "amacaction" from amacaction.revv.co/... or revv.com/amacaction
}

// Type for entity assignment
type EntityAssignment = {
  entityId: string
  assignmentMethod: "auto_domain" | "auto_winred" | "auto_anedot" | "auto_actblue" | "auto_psqimpact" | "auto_engage" | "auto_phone" | "auto_substack" | "auto_revv" | "auto_cta_domain"
} | null

function stripHtmlAndExtract(html: string): string {
  // Remove style tags and their content
  let cleaned = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
  // Remove script tags and their content
  cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
  // Remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "")
  // Replace <br>, <p>, <div>, <tr> with newlines to preserve structure
  cleaned = cleaned.replace(/<\/(p|div|tr|td|h[1-6])>/gi, "\n")
  cleaned = cleaned.replace(/<br\s*\/?>/gi, "\n")
  // Remove all remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, " ")
  // Decode HTML entities
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
  // Remove excessive whitespace and blank lines
  cleaned = cleaned.replace(/[ \t]+/g, " ")
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, "\n\n")
  // Trim
  return cleaned.trim()
}

/**
 * Analyze email content with AI to determine if it's a newsletter or focused campaign
 */
async function analyzeEmailWithAI(
  subject: string,
  body: string,
): Promise<{
  type: "newsletter" | "sponsored_campaign"
  confidence: number
  reasoning: string
} | null> {
  try {
    const cleanBody = stripHtmlAndExtract(body)
    const bodyPreview = cleanBody.slice(0, 12000)

    console.log("[Data Broker AI] Analyzing email (clean text length):", cleanBody.length)

  const result = await generateObject({
    model: "openai/gpt-4o-mini",
    schema: z.object({
        type: z.enum(["newsletter", "sponsored_campaign"]),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
      }),
      prompt: `You are analyzing a political email to classify it as either a "newsletter" or "sponsored_campaign".

EMAIL SUBJECT: ${subject}

EMAIL CONTENT:
${bodyPreview}${cleanBody.length > 12000 ? "\n\n[Content truncated...]" : ""}

CLASSIFICATION RULES:

**newsletter** - Contains MULTIPLE distinct articles or topics. Look for:
- Different article headlines (e.g., "Trump Announces...", "Biden Says...", "Poll Shows...")
- Multiple author names or bylines
- "You Might Like" or "Daily Briefing" sections with multiple stories
- Mix of unrelated topics in one email
- Commercial ads mixed with political content

**sponsored_campaign** - Focused on ONE specific candidate or cause. Look for:
- "Sponsored Message from..." or "Paid by [Candidate]" disclaimers
- Personal first-person message from a single candidate
- Entire email is about ONE race or initiative
- All donation links go to the same candidate

IMPORTANT: Read the full email content above, not just the subject line. If you see multiple article headlines or topics, classify as "newsletter" even if the subject mentions one topic.

Return JSON with:
- type: "newsletter" or "sponsored_campaign"
- confidence: number between 0 and 1 (use 0.8-0.95 for clear cases)
- reasoning: brief explanation

Respond ONLY with the JSON object, no other text.`,
    })

    console.log("========== [Data Broker AI] GEMINI RESULT ==========")
    console.log("[Data Broker AI] Subject:", subject)
    console.log("[Data Broker AI] Type:", result.object.type)
    console.log("[Data Broker AI] Confidence:", result.object.confidence)
    console.log("[Data Broker AI] Reasoning:", result.object.reasoning)
    console.log("=====================================================")
    return result.object
  } catch (error) {
    console.error("[Data Broker AI] Analysis failed:", error)
    return null
  }
}

/**
 * Find entity mapping for a given sender email
 * Checks donation identifiers first (most reliable), then exact email match, then domain match
 * For data broker emails, uses AI to determine newsletter vs sponsored campaign
 */
export async function findEntityForSender(
  senderEmail: string,
  senderName?: string,
  ctaLinks?: any,
  emailSubject?: string,
  emailBody?: string,
): Promise<EntityAssignment> {
  try {
    const normalizedEmail = senderEmail.toLowerCase()

    const emailMapping = await prisma.ciEntityMapping.findFirst({
      where: { senderEmail: normalizedEmail },
      include: { entity: true },
    })

    const domain = senderEmail.split("@")[1]?.toLowerCase()
    const domainMapping =
      !emailMapping && domain
        ? await prisma.ciEntityMapping.findFirst({
            where: { senderDomain: domain },
            include: { entity: true },
          })
        : null

    const mapping = emailMapping || domainMapping
    const entity = mapping?.entity

    // Substack detection — only match via explicit donationIdentifiers.substack handle.
    // Fuzzy name matching was removed because it caused false positives (e.g. rajaforil@substack.com
    // being assigned to an unrelated entity). If no explicit handle is set, leave unassigned.
    if (!mapping && domain === "substack.com") {
      const localPart = senderEmail.split("@")[0].toLowerCase()

      const allEntities = await prisma.ciEntity.findMany({
        where: { donationIdentifiers: { not: null } },
        select: { id: true, name: true, donationIdentifiers: true },
      })
      for (const entity of allEntities) {
        const identifiers = entity.donationIdentifiers as DonationIdentifiers | null
        if (identifiers?.substack?.toLowerCase() === localPart) {
          console.log(`[Substack] Matched ${senderEmail} → entity "${entity.name}" via donationIdentifiers.substack`)
          return { entityId: entity.id, assignmentMethod: "auto_substack" }
        }
      }
      // No explicit match — fall through to unassigned
    }

    if (entity && entity.type === "data_broker" && emailSubject && emailBody) {
      console.log(`[Data Broker] ${entity.name} (${senderEmail}) - running AI analysis`)

      const aiAnalysis = await analyzeEmailWithAI(emailSubject, emailBody)

      if (aiAnalysis && aiAnalysis.confidence >= 0.7) {
        if (aiAnalysis.type === "newsletter") {
          console.log(`[Data Broker] Newsletter -> assigned to ${entity.name} (confidence: ${aiAnalysis.confidence})`)
          return { entityId: entity.id, assignmentMethod: "auto_domain" }
        } else {
          console.log(`[Data Broker] Sponsored (confidence: ${aiAnalysis.confidence}) -> checking ${ctaLinks?.length ?? 0} CTAs`)

          const donationMatch = await findEntityByDonationIdentifier(ctaLinks, true)
          if (donationMatch) {
            const method = `auto_${donationMatch.platform}` as "auto_winred" | "auto_anedot" | "auto_actblue" | "auto_psqimpact" | "auto_engage"
            console.log(`[Data Broker] ✓ Assigned via donation identifier: ${method} (${donationMatch.matchedIdentifier})`)
            return { entityId: donationMatch.entity.id, assignmentMethod: method }
          }

          console.log("[Data Broker] ✗ Sponsored - no donation identifier match, leaving for manual review")
          return null
        }
      } else {
        console.log(`[Data Broker] ✗ AI uncertain (confidence: ${aiAnalysis?.confidence ?? "null"}) - leaving for manual review`)
        return null
      }
    }

    if (ctaLinks) {
      const donationMatch = await findEntityByDonationIdentifier(ctaLinks)
      if (donationMatch) {
        return { entityId: donationMatch.entity.id, assignmentMethod: `auto_${donationMatch.platform}` as "auto_winred" | "auto_anedot" | "auto_actblue" | "auto_psqimpact" | "auto_engage" }
      }
    }

    // Check exact email match
    if (emailMapping) {
      return { entityId: emailMapping.entityId, assignmentMethod: "auto_domain" }
    }

    // Check domain match
    if (domainMapping) {
      return { entityId: domainMapping.entityId, assignmentMethod: "auto_domain" }
    }

    return null
  } catch (error) {
    console.error("Error finding entity for sender:", error)
    return null
  }
}

/**
 * Find entity mapping for a given phone number
 * Checks donation identifiers first (most reliable), then exact phone match
 */
export async function findEntityForPhone(phoneNumber: string, ctaLinks?: any): Promise<EntityAssignment> {
  try {
    if (ctaLinks) {
      const donationMatch = await findEntityByDonationIdentifier(ctaLinks)
      if (donationMatch) {
        return { entityId: donationMatch.entity.id, assignmentMethod: `auto_${donationMatch.platform}` as "auto_winred" | "auto_anedot" | "auto_actblue" | "auto_psqimpact" | "auto_engage" }
      }
    }

    // Normalize phone number (remove spaces, dashes, etc.)
    const normalized = phoneNumber.replace(/[\s\-()]/g, "")

    const phoneMatch = await prisma.ciEntityMapping.findFirst({
      where: { senderPhone: normalized },
      select: { entityId: true },
    })

    if (phoneMatch) {
      return { entityId: phoneMatch.entityId, assignmentMethod: "auto_phone" }
    }

    return null
  } catch (error) {
    console.error("Error finding entity for phone:", error)
    return null
  }
}

/**
 * Extract the exact hostname from a URL (e.g., "support.johnkennedy.com").
 * No subdomain stripping — what you store is what gets matched.
 */
export function extractRootDomain(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Find entity by matching exact hostnames from CTA links against ctaDomain mappings.
 */
export async function findEntityByCtaDomain(ctaLinks: any): Promise<EntityAssignment> {
  try {
    if (!ctaLinks) return null

    const links = Array.isArray(ctaLinks) ? ctaLinks : []
    if (links.length === 0) return null

    // Collect unique root domains from all CTA links
    const rootDomains = new Set<string>()
    for (const link of links) {
      const url = typeof link === "string" ? link : link.finalUrl || link.url
      if (!url) continue
      const root = extractRootDomain(url)
      if (root) rootDomains.add(root)
    }

    if (rootDomains.size === 0) return null

    // Query for any matching ctaDomain mapping
    const mapping = await prisma.ciEntityMapping.findFirst({
      where: {
        ctaDomain: { in: Array.from(rootDomains) },
      },
      select: { entityId: true },
    })

    if (mapping) {
      return { entityId: mapping.entityId, assignmentMethod: "auto_cta_domain" }
    }

    return null
  } catch (error) {
    console.error("Error finding entity by CTA domain:", error)
    return null
  }
}

/**
 * Get all entities with their mapping counts (paginated with filters)
 */
export async function getAllEntitiesWithCounts(options?: {
  page?: number
  pageSize?: number
  party?: string
  state?: string
  type?: string
  search?: string
  ballotpedia?: string
  sortBy?: "name" | "newest" | "oldest"
  ids?: string[]
}) {
  try {
    const page = options?.page || 1
    const pageSize = options?.pageSize || 100
    const skip = (page - 1) * pageSize

    // Build where clause for filtering
    const where: any = {
      // Never show data brokers in the public/user-facing directory
      type: { not: "data_broker" },
    }

    // Filter by specific IDs (used for fetching followed entity details)
    if (options?.ids && options.ids.length > 0) {
      where.id = { in: options.ids }
    }

    if (options?.party && options.party !== "all") {
      if (options.party === "unknown") {
        where.party = null
      } else {
        where.party = {
          equals: options.party,
          mode: "insensitive",
        }
      }
    }

    if (options?.state && options.state !== "all") {
      if (options.state === "unknown") {
        where.state = null
      } else {
        where.state = options.state
      }
    }

    if (options?.type && options.type !== "all") {
      // Override the data_broker exclusion with the specific type filter
      // (data_broker type can still be explicitly requested if needed)
      where.type = options.type
    }

    if (options?.search?.trim()) {
      where.name = {
        contains: options.search.trim(),
        mode: "insensitive",
      }
    }

    // Filter for ballotpedia information
    if (options?.ballotpedia && options.ballotpedia !== "all") {
      if (options.ballotpedia === "missing") {
        where.ballotpediaUrl = null
      } else if (options.ballotpedia === "has") {
        where.ballotpediaUrl = {
          not: null,
        }
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.ciEntity.count({ where })

    const sortBy = options?.sortBy || "name"
    const orderBy =
      sortBy === "newest"
        ? { createdAt: "desc" as const }
        : sortBy === "oldest"
          ? { createdAt: "asc" as const }
          : { name: "asc" as const }

    const entities = await prisma.ciEntity.findMany({
      where,
      include: {
        _count: {
          select: {
            campaigns: true,
            smsMessages: true,
            mappings: true,
          },
        },
      },
      orderBy,
      skip,
      take: pageSize,
    })

    const entitiesWithCombinedCount = entities.map((entity) => ({
      ...entity,
      _count: {
        campaigns: entity._count.campaigns,
        smsMessages: entity._count.smsMessages,
        // Combined count of email campaigns + SMS messages
        totalCommunications: entity._count.campaigns + entity._count.smsMessages,
        mappings: entity._count.mappings,
      },
    }))

    return {
      entities: entitiesWithCombinedCount,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    }
  } catch (error) {
    console.error("Error fetching entities:", error)
    return {
      entities: [],
      pagination: {
        page: 1,
        pageSize: 100,
        totalCount: 0,
        totalPages: 0,
      },
    }
  }
}

/**
 * Get unassigned CI campaigns
 */
export async function getUnassignedCampaigns() {
  try {
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
        isDeleted: false,
      },
      orderBy: { dateReceived: "desc" },
      take: 100, // Limit to recent 100 unassigned
    })

    return campaigns
  } catch (error) {
    console.error("Error fetching unassigned campaigns:", error)
    return []
  }
}

/**
 * Get unassigned SMS messages
 */
export async function getUnassignedSms() {
  try {
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        entityId: null,
        processed: true,
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
      take: 100, // Limit to recent 100 unassigned
    })

    return smsMessages
  } catch (error) {
    console.error("Error fetching unassigned SMS:", error)
    return []
  }
}

// ── SOP-based junk detection for delete_messages / list_delete_eligible_messages ──
//
// Senders/shortcodes the SOP says to always delete on sight, regardless of
// anything else about the message.
const SOP_DELETE_SENDER_EMAILS = new Set(["no-reply@multiscreensite.com", "alana@superhuman.com"])
const SOP_DELETE_SMS_SENDERS = new Set(["57414", "6232805635"])
// Any CTA landing on an official .gov page (e.g. a member's official House/Senate
// site) is not a real campaign call-to-action - members can't fundraise off
// taxpayer-funded government infrastructure, so a message whose only links are
// .gov links is functionally CTA-less for this SOP's purposes.
const NON_REAL_CTA_HOST_SUFFIX = ".gov"

type ParsedCtaLink = { url?: string; finalUrl?: string; type?: string }

function parseCtaLinks(raw: unknown): ParsedCtaLink[] {
  if (!raw) return []
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw
    return Array.isArray(value) ? (value as ParsedCtaLink[]) : []
  } catch {
    return []
  }
}

function linkHostname(link: ParsedCtaLink): string | null {
  const target = link.finalUrl || link.url
  if (!target) return null
  try {
    return new URL(target).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** Real CTAs = links that aren't a bare .gov page. */
function countRealCtas(rawCtaLinks: unknown): number {
  const links = parseCtaLinks(rawCtaLinks)
  return links.filter((link) => {
    const host = linkHostname(link)
    return !(host && host.endsWith(NON_REAL_CTA_HOST_SUFFIX))
  }).length
}

/** True if any CTA link is (or resolves through) the dead t.ly/redirect intermediate page. */
function hasTlyRedirectPlaceholder(rawCtaLinks: unknown): boolean {
  const links = parseCtaLinks(rawCtaLinks)
  return links.some((link) => {
    const target = (link.finalUrl || link.url || "").toLowerCase()
    return target.includes("t.ly/redirect")
  })
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone || "").replace(/[^0-9]/g, "")
}

export interface SopDeleteEvaluation {
  eligible: boolean
  reasons: string[]
}

/**
 * Evaluates a single unassigned email campaign against the SOP's "always
 * delete" rules. Purely a pure function over already-loaded fields so it's
 * cheap to run over a whole backlog and easy to unit test / eyeball.
 */
export function evaluateCampaignForSopDelete(campaign: {
  senderEmail: string
  ctaLinks: unknown
  dateReceived: Date
}): SopDeleteEvaluation {
  const reasons: string[] = []
  const senderEmail = campaign.senderEmail.toLowerCase()
  const domain = senderEmail.split("@")[1]

  if (SOP_DELETE_SENDER_EMAILS.has(senderEmail)) {
    reasons.push(`sender ${senderEmail} is on the always-delete sender list`)
  }
  if (domain?.endsWith(".gov")) {
    reasons.push(`sender domain "${domain}" is a .gov address`)
  }
  if (hasTlyRedirectPlaceholder(campaign.ctaLinks)) {
    reasons.push("CTA resolves to the dead t.ly/redirect page")
  }
  if (countRealCtas(campaign.ctaLinks) === 0) {
    reasons.push("0 real CTAs (.gov links don't count)")
  }
  if (campaign.dateReceived.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    reasons.push("message is more than 1 day old")
  }

  return { eligible: reasons.length > 0, reasons }
}

/**
 * Evaluates a single unassigned SMS message against the SOP's "always
 * delete" rules.
 */
export function evaluateSmsForSopDelete(sms: {
  phoneNumber: string | null
  ctaLinks: unknown
  createdAt: Date
}): SopDeleteEvaluation {
  const reasons: string[] = []
  const phone = normalizePhone(sms.phoneNumber)

  if (phone && SOP_DELETE_SMS_SENDERS.has(phone)) {
    reasons.push(`shortcode/number ${sms.phoneNumber} is on the always-delete sender list`)
  }
  if (hasTlyRedirectPlaceholder(sms.ctaLinks)) {
    reasons.push("CTA is/resolves to t.ly/redirect")
  }
  if (countRealCtas(sms.ctaLinks) === 0) {
    reasons.push("0 real CTAs (.gov links don't count)")
  }
  if (sms.createdAt.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
    reasons.push("message is more than 1 day old")
  }

  return { eligible: reasons.length > 0, reasons }
}

/**
 * Scans the current unassigned backlog (same source as getUnassignedCampaigns /
 * getUnassignedSms) and returns only the ones that match at least one SOP
 * "always delete" rule, each tagged with the specific reason(s) it matched.
 */
export async function getSopDeleteEligibleMessages(): Promise<{
  emails: Array<{ id: string; senderEmail: string; subject: string; dateReceived: Date; reasons: string[] }>
  sms: Array<{ id: string; phoneNumber: string | null; message: string | null; createdAt: Date; reasons: string[] }>
}> {
  const [campaigns, smsMessages]: [any[], any[]] = await Promise.all([getUnassignedCampaigns(), getUnassignedSms()])

  const emails = campaigns
    .map((c: any) => ({ campaign: c, evaluation: evaluateCampaignForSopDelete(c) }))
    .filter((row: { campaign: any; evaluation: SopDeleteEvaluation }) => row.evaluation.eligible)
    .map((row: { campaign: any; evaluation: SopDeleteEvaluation }) => ({
      id: row.campaign.id,
      senderEmail: row.campaign.senderEmail,
      subject: row.campaign.subject,
      dateReceived: row.campaign.dateReceived,
      reasons: row.evaluation.reasons,
    }))

  const sms = smsMessages
    .map((s: any) => ({ sms: s, evaluation: evaluateSmsForSopDelete(s) }))
    .filter((row: { sms: any; evaluation: SopDeleteEvaluation }) => row.evaluation.eligible)
    .map((row: { sms: any; evaluation: SopDeleteEvaluation }) => ({
      id: row.sms.id,
      phoneNumber: row.sms.phoneNumber,
      message: row.sms.message,
      createdAt: row.sms.createdAt,
      reasons: row.evaluation.reasons,
    }))

  return { emails, sms }
}

/**
 * Soft-deletes a batch of email campaigns and/or SMS messages (same
 * isDeleted/deletedAt/deletedBy fields the admin UI's manual delete uses -
 * see app/api/campaigns/[id]/route.ts and app/api/sms/[id]/route.ts).
 * Never hard-deletes, and never touches anything already assigned to an
 * entity or already deleted, so a bad batch only ever double-marks rows
 * that are already gone.
 */
export async function softDeleteMessages(
  campaignIds: string[],
  smsIds: string[],
  deletedBy: string,
): Promise<{ deletedCampaignCount: number; deletedSmsCount: number }> {
  const now = new Date()

  const [campaignResult, smsResult] = await Promise.all([
    campaignIds.length > 0
      ? prisma.competitiveInsightCampaign.updateMany({
          where: { id: { in: campaignIds }, isDeleted: false },
          data: { isDeleted: true, deletedAt: now, deletedBy },
        })
      : Promise.resolve({ count: 0 }),
    smsIds.length > 0
      ? prisma.smsQueue.updateMany({
          where: { id: { in: smsIds }, isDeleted: false },
          data: { isDeleted: true, deletedAt: now, deletedBy },
        })
      : Promise.resolve({ count: 0 }),
  ])

  return { deletedCampaignCount: campaignResult.count, deletedSmsCount: smsResult.count }
}

// ── "Categorize" auto-assignment (same logic as the admin UI's Categorize
// button / app/api/admin/auto-assign-single/route.ts) ──────────────────────
//
// Matches a message's CTA links against known donation-platform identifiers
// (WinRed/Anedot/ActBlue/PSQ/Revv) already saved on an entity, falling back
// to a known CTA root-domain mapping (CiEntityMapping.ctaDomain - e.g.
// donate.gregabbott.com). Deliberately conservative: only assigns when a
// link is an EXACT match against something already on file, never a guess.
export type CategorizeResult =
  | { id: string; type: "email" | "sms"; success: true; entityId: string; entityName: string; method: string }
  | { id: string; type: "email" | "sms"; success: false; reason: string }

/**
 * Attempts to auto-assign a single unassigned message (email or SMS) to an
 * entity by matching donation-platform identifiers or CTA domain found in
 * its CTA links. Only touches the message if a match is found; never
 * reassigns an already-assigned message.
 */
export async function categorizeMessage(id: string, type: "email" | "sms"): Promise<CategorizeResult> {
  let ctaLinks: unknown = null
  let senderIdentity: string | null = null

  if (type === "email") {
    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id },
      select: { id: true, ctaLinks: true, entityId: true, senderEmail: true },
    })
    if (!campaign) return { id, type, success: false, reason: "Campaign not found" }
    if (campaign.entityId) return { id, type, success: false, reason: "Already assigned" }
    ctaLinks = campaign.ctaLinks
    senderIdentity = campaign.senderEmail
  } else {
    const sms = await prisma.smsQueue.findUnique({
      where: { id },
      select: { id: true, ctaLinks: true, entityId: true, phoneNumber: true },
    })
    if (!sms) return { id, type, success: false, reason: "SMS not found" }
    if (sms.entityId) return { id, type, success: false, reason: "Already assigned" }
    ctaLinks = sms.ctaLinks
    senderIdentity = sms.phoneNumber
  }

  const links: Array<{ url: string; finalUrl?: string; type: string }> = Array.isArray(ctaLinks)
    ? (ctaLinks as any)
    : typeof ctaLinks === "string"
      ? (() => {
          try {
            return JSON.parse(ctaLinks as string)
          } catch {
            return []
          }
        })()
      : []

  if (links.length === 0) {
    return { id, type, success: false, reason: "No CTA links found in this message" }
  }

  const winredIds = new Set(extractWinRedIdentifiers(links))
  const anedotIds = new Set(extractAnedotIdentifiers(links))
  const actblueIds = new Set(extractActBlueIdentifiers(links))
  const psqIds = new Set(extractPSQIdentifiers(links))
  const revvIds = new Set(extractRevvIdentifiers(links))

  const entities = await prisma.ciEntity.findMany({
    where: { donationIdentifiers: { not: null }, type: { not: "data_broker" } },
    select: { id: true, name: true, donationIdentifiers: true },
  })

  let matchedEntity: { id: string; name: string; method: string } | null = null

  for (const entity of entities) {
    let ids: any = {}
    try {
      ids =
        typeof entity.donationIdentifiers === "string"
          ? JSON.parse(entity.donationIdentifiers)
          : entity.donationIdentifiers ?? {}
    } catch {
      continue
    }

    const winred: string[] = (ids.winred ?? []).map((s: string) => s.toLowerCase())
    const anedot: string[] = (ids.anedot ?? []).map((s: string) => s.toLowerCase())
    const actblue: string[] = (ids.actblue ?? []).map((s: string) => s.toLowerCase())
    const psq: string[] = (ids.psq ?? []).map((s: string) => s.toLowerCase())
    const revv: string[] = (ids.revv ?? []).map((s: string) => s.toLowerCase())

    if ([...winredIds].some((wid) => winred.includes(wid))) {
      matchedEntity = { id: entity.id, name: entity.name, method: "auto_winred" }
      break
    }
    if ([...anedotIds].some((aid) => anedot.includes(aid))) {
      matchedEntity = { id: entity.id, name: entity.name, method: "auto_anedot" }
      break
    }
    if ([...actblueIds].some((abid) => actblue.includes(abid))) {
      matchedEntity = { id: entity.id, name: entity.name, method: "auto_actblue" }
      break
    }
    if ([...psqIds].some((pid) => psq.includes(pid))) {
      matchedEntity = { id: entity.id, name: entity.name, method: "auto_psq" }
      break
    }
    if ([...revvIds].some((rid) => revv.includes(rid))) {
      matchedEntity = { id: entity.id, name: entity.name, method: "auto_revv" }
      break
    }
  }

  if (!matchedEntity) {
    const ctaMatch = await findEntityByCtaDomain(links)
    if (ctaMatch) {
      const entity = await prisma.ciEntity.findUnique({
        where: { id: ctaMatch.entityId },
        select: { id: true, name: true },
      })
      if (entity) {
        matchedEntity = { id: entity.id, name: entity.name, method: ctaMatch.assignmentMethod }
      }
    }
  }

  if (!matchedEntity) {
    return { id, type, success: false, reason: "No matching entity found via donation identifiers or CTA domain" }
  }

  if (type === "email") {
    const isThirdParty = await isSenderThirdParty(matchedEntity.id, senderIdentity)
    await prisma.competitiveInsightCampaign.update({
      where: { id },
      data: { entityId: matchedEntity.id, assignmentMethod: matchedEntity.method, assignedAt: new Date(), isThirdParty },
    })
  } else {
    const isThirdParty = await isPhoneThirdParty(matchedEntity.id, senderIdentity)
    await prisma.smsQueue.update({
      where: { id },
      data: { entityId: matchedEntity.id, assignmentMethod: matchedEntity.method, assignedAt: new Date(), isThirdParty },
    })
  }

  return { id, type, success: true, entityId: matchedEntity.id, entityName: matchedEntity.name, method: matchedEntity.method }
}

/**
 * Batch version of categorizeMessage - runs each message through the same
 * matching logic sequentially and returns one result per message, whether
 * matched, skipped (already assigned / no links), or not found.
 */
export async function categorizeMessages(
  items: Array<{ id: string; type: "email" | "sms" }>,
): Promise<CategorizeResult[]> {
  const results: CategorizeResult[] = []
  for (const item of items) {
    results.push(await categorizeMessage(item.id, item.type))
  }
  return results
}

/**
 * Create a new entity
 */
export async function createEntity(
  name: string,
  type: string,
  description?: string,
  party?: string,
  state?: string,
  donationIdentifiers?: DonationIdentifiers,
  ballotpediaUrl?: string,
) {
  try {
    const entity = await prisma.ciEntity.create({
      data: {
        name,
        type,
        description,
        party,
        state,
        donationIdentifiers: donationIdentifiers || null,
        ...(ballotpediaUrl ? { ballotpediaUrl } : {}),
      },
    })

    return { success: true, entity }
  } catch (error: any) {
    console.error("Error creating entity:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Update an existing entity
 */
export async function updateEntity(
  entityId: string,
  name: string,
  type: string,
  description?: string,
  party?: string,
  state?: string,
  donationIdentifiers?: DonationIdentifiers,
  ballotpediaUrl?: string,
) {
  try {
    const entity = await prisma.ciEntity.update({
      where: { id: entityId },
      data: {
        name,
        type,
        description,
        party,
        state,
        donationIdentifiers: donationIdentifiers || null,
        ...(ballotpediaUrl !== undefined && { ballotpediaUrl: ballotpediaUrl || null }),
      },
    })

    return { success: true, entity }
  } catch (error: any) {
    console.error("Error updating entity:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Merge new donation-platform identifiers into an existing entity's
 * `donationIdentifiers` JSON, without touching any other field (name, type,
 * party, state, description, ballotpediaUrl, image, etc.). Used by the
 * Claude-facing CI Assignment MCP's `update_entity_donation_identifiers`
 * tool, which is deliberately restricted to only this one field to keep
 * blast radius small. Array-valued platforms (winred, anedot, actblue,
 * psqimpact, ngpvan, engage, revv) are unioned/de-duped with existing
 * values; string-valued platforms (substack) are overwritten with the new
 * value. Returns the before/after state so callers can log a full audit
 * trail and support Undo.
 */
export async function mergeEntityDonationIdentifiers(entityId: string, newIdentifiers: DonationIdentifiers) {
  try {
    const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
    if (!entity) {
      return { success: false, error: `Entity ${entityId} not found` }
    }

    const before = (entity.donationIdentifiers as DonationIdentifiers | null) || {}
    const merged: DonationIdentifiers = { ...before }

    const arrayKeys: (keyof DonationIdentifiers)[] = [
      "winred",
      "anedot",
      "actblue",
      "psqimpact",
      "ngpvan",
      "engage",
      "revv",
    ]
    for (const key of arrayKeys) {
      const incoming = newIdentifiers[key] as string[] | undefined
      if (!incoming || incoming.length === 0) continue
      const existing = (before[key] as string[] | undefined) || []
      merged[key] = Array.from(new Set([...existing, ...incoming])) as never
    }

    if (newIdentifiers.substack) {
      merged.substack = newIdentifiers.substack
    }

    const updated = await prisma.ciEntity.update({
      where: { id: entityId },
      data: { donationIdentifiers: merged },
    })

    return { success: true, entity: updated, before, after: merged }
  } catch (error: any) {
    console.error("Error merging entity donation identifiers:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Assign campaigns to an entity and create mapping
 */
export async function assignCampaignsToEntity(
  campaignIds: string[],
  entityId: string,
  createMapping = true,
  assignmentMethod: "manual" | "api_claude" = "manual",
) {
  try {
    const directCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: { id: { in: campaignIds } },
      select: { id: true, shareToken: true, senderEmail: true },
    })

    if (createMapping) {
      // A mapping is about to be created for these senders (below), so once that happens
      // they become the entity's own confirmed identity — freeze isThirdParty=false now
      // rather than resolving it against the pre-mapping state.
      await prisma.competitiveInsightCampaign.updateMany({
        where: { id: { in: campaignIds } },
        data: {
          entityId,
          assignmentMethod,
          assignedAt: new Date(),
          isThirdParty: false,
        },
      })
    } else {
      // No mapping is being created — classify each campaign against whatever mappings
      // already exist for this entity (may still resolve to third-party=true).
      for (const campaign of directCampaigns) {
        const isThirdParty = await isSenderThirdParty(entityId, campaign.senderEmail)
        await prisma.competitiveInsightCampaign.update({
          where: { id: campaign.id },
          data: {
            entityId,
            assignmentMethod,
            assignedAt: new Date(),
            isThirdParty,
          },
        })
      }
    }

    for (const campaign of directCampaigns) {
      await ensureShareTokenForCampaign(campaign)
    }

    let additionalAssignedCount = 0

    // If requested, create mappings for future auto-assignment
    if (createMapping && campaignIds.length > 0) {
      // Get unique sender emails from these campaigns
      const campaigns = await prisma.competitiveInsightCampaign.findMany({
        where: { id: { in: campaignIds } },
        select: { senderEmail: true },
        distinct: ["senderEmail"],
      })

      // Create mappings for each unique sender and assign all matching campaigns
      for (const campaign of campaigns) {
        const senderEmail = campaign.senderEmail.toLowerCase()
        const domain = senderEmail.split("@")[1]

        // Check if mapping already exists
        const existingMapping = await prisma.ciEntityMapping.findFirst({
          where: {
            OR: [{ senderEmail }, { senderDomain: domain }],
          },
        })

        if (!existingMapping) {
          await prisma.ciEntityMapping.create({
            data: {
              entityId,
              senderEmail,
              senderDomain: domain,
            },
          })
          // New mapping just changed the classification rules — drop the stale cache
          // immediately so any concurrent/subsequent reads in this request see it.
          invalidateEntityMappingCache()
        }

        const matchingWhere = {
          entityId: null, // Only update unassigned campaigns
          OR: [
            { senderEmail: senderEmail },
            { senderEmail: { endsWith: `@${domain}` } }, // Match all emails from this domain
          ],
        }

        const additionalCampaigns = await prisma.competitiveInsightCampaign.findMany({
          where: matchingWhere,
          select: { id: true, shareToken: true },
        })

        // These campaigns match the sender/domain we just mapped to this entity's own
        // identity, so they are house file (isThirdParty=false) by construction.
        const matchingCampaigns = await prisma.competitiveInsightCampaign.updateMany({
          where: matchingWhere,
          data: {
            entityId,
            assignmentMethod,
            assignedAt: new Date(),
            isThirdParty: false,
          },
        })

        for (const additionalCampaign of additionalCampaigns) {
          await ensureShareTokenForCampaign(additionalCampaign)
        }

        additionalAssignedCount += matchingCampaigns.count
      }
    }

    return {
      success: true,
      assignedCount: campaignIds.length,
      additionalAssignedCount,
    }
  } catch (error: any) {
    console.error("Error assigning campaigns:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Assign SMS messages to an entity and create phone mapping
 */
export async function assignSmsToEntity(
  smsIds: string[],
  entityId: string,
  createMapping = true,
  assignmentMethod: "manual" | "api_claude" = "manual",
) {
  try {
    // Fetch content for the alert before we lose the "just became assigned" moment
    const directSms = await prisma.smsQueue.findMany({
      where: { id: { in: smsIds } },
      select: { id: true, shareToken: true, phoneNumber: true },
    })

    if (createMapping) {
      // A mapping is about to be created for these phone numbers (below), so once that
      // happens they become the entity's own confirmed identity — freeze isThirdParty=false
      // now rather than resolving it against the pre-mapping state.
      await prisma.smsQueue.updateMany({
        where: { id: { in: smsIds } },
        data: {
          entityId,
          assignmentMethod,
          assignedAt: new Date(),
          isThirdParty: false,
        },
      })
    } else {
      // No mapping is being created — classify each SMS against whatever mappings
      // already exist for this entity (may still resolve to third-party=true).
      for (const sms of directSms) {
        const isThirdParty = await isPhoneThirdParty(entityId, sms.phoneNumber)
        await prisma.smsQueue.update({
          where: { id: sms.id },
          data: {
            entityId,
            assignmentMethod,
            assignedAt: new Date(),
            isThirdParty,
          },
        })
      }
    }

    for (const sms of directSms) {
      await ensureShareTokenForSms(sms)
    }

    let additionalAssignedCount = 0

    // If requested, create mappings for future auto-assignment
    if (createMapping && smsIds.length > 0) {
      // Get unique phone numbers from these SMS messages
      const smsMessages = await prisma.smsQueue.findMany({
        where: { id: { in: smsIds } },
        select: { phoneNumber: true },
        distinct: ["phoneNumber"],
      })

      // Create mappings for each unique phone number and assign all matching SMS
      for (const sms of smsMessages) {
        if (!sms.phoneNumber) continue

        const normalizedPhone = sms.phoneNumber.replace(/[\s\-()]/g, "")

        // Check if mapping already exists
        const existingMapping = await prisma.ciEntityMapping.findFirst({
          where: { senderPhone: normalizedPhone },
        })

        if (!existingMapping) {
          await prisma.ciEntityMapping.create({
            data: {
              entityId,
              senderPhone: normalizedPhone,
            },
          })
          // New mapping just changed the classification rules — drop the stale cache
          // immediately so any concurrent/subsequent reads in this request see it.
          invalidateEntityMappingCache()
        }

        const matchingSmsWhere = {
          entityId: null, // Only update unassigned SMS
          phoneNumber: sms.phoneNumber,
        }

        const additionalSms = await prisma.smsQueue.findMany({
          where: matchingSmsWhere,
          select: { id: true, shareToken: true },
        })

        // These SMS match the phone number we just mapped to this entity's own
        // identity, so they are house file (isThirdParty=false) by construction.
        const matchingSms = await prisma.smsQueue.updateMany({
          where: matchingSmsWhere,
          data: {
            entityId,
            assignmentMethod,
            assignedAt: new Date(),
            isThirdParty: false,
          },
        })

        for (const additionalSmsItem of additionalSms) {
          await ensureShareTokenForSms(additionalSmsItem)
        }

        additionalAssignedCount += matchingSms.count
      }
    }

    return {
      success: true,
      assignedCount: smsIds.length,
      additionalAssignedCount,
    }
  } catch (error: any) {
    console.error("Error assigning SMS:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete an entity mapping
 */
export async function deleteEntityMapping(mappingId: string) {
  try {
    await prisma.ciEntityMapping.delete({
      where: { id: mappingId },
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error deleting mapping:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Delete an entity and its associated mappings
 */
export async function deleteEntity(entityId: string) {
  try {
    // First, delete all mappings associated with this entity
    await prisma.ciEntityMapping.deleteMany({
      where: { entityId },
    })

    // Unassign campaigns from this entity (set entityId to null)
    await prisma.competitiveInsightCampaign.updateMany({
      where: { entityId },
      data: { entityId: null },
    })

    // Unassign SMS messages from this entity (set entityId to null)
    await prisma.smsQueue.updateMany({
      where: { entityId },
      data: { entityId: null },
    })

    // Finally, delete the entity itself
    await prisma.ciEntity.delete({
      where: { id: entityId },
    })

    return { success: true }
  } catch (error: any) {
    console.error("Error deleting entity:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Get entity mappings only when needed (not on initial page load)
 */
export async function getEntityMappings(entityId: string) {
  try {
    const mappings = await prisma.ciEntityMapping.findMany({
      where: { entityId },
      orderBy: { createdAt: "desc" },
    })

    return mappings
  } catch (error) {
    console.error("Error fetching entity mappings:", error)
    return []
  }
}

/**
 * Add a new mapping to an entity
 */
export async function addEntityMapping(entityId: string, emailOrDomain: string) {
  try {
    const normalized = emailOrDomain.toLowerCase().trim()

    // Determine the type:
    //   phone  = numeric-only (short codes like "55404")
    //   email  = contains "@"
    //   url    = contains "://" → extract root domain → ctaDomain
    //   domain = everything else (e.g., "fundconservatives.org")
    const isPhone = /^\d+$/.test(normalized)
    const isEmail = !isPhone && normalized.includes("@")
    const isUrl = !isPhone && !isEmail && normalized.includes("://")

    // For URLs, extract the root domain
    const ctaDomainValue = isUrl ? extractRootDomain(normalized) : null
    const isCta = isUrl || (!isPhone && !isEmail && !normalized.includes("@"))

    // For plain domains entered without a protocol treat as ctaDomain if they
    // look like a domain (contain a dot and no @) — only if not a senderDomain.
    // We still support senderDomain for backward compat (no protocol, no @, has dot).
    // Decision: if the user enters something like "fundconservatives.org" (no @, no ://)
    // we store it as senderDomain (existing behavior). Only URLs trigger ctaDomain.

    const whereClause = isPhone
      ? [{ senderPhone: normalized }]
      : isEmail
      ? [{ senderEmail: normalized }]
      : isUrl
      ? [{ ctaDomain: ctaDomainValue }]
      : [{ senderDomain: normalized }]

    // Check if mapping already exists
    const existingMapping = await prisma.ciEntityMapping.findFirst({
      where: { entityId, OR: whereClause },
    })

    if (existingMapping) {
      return { success: false, error: "Mapping already exists" }
    }

    // Create the mapping, routing to the correct column based on type
    const mapping = await prisma.ciEntityMapping.create({
      data: {
        entityId,
        ...(isPhone
          ? { senderPhone: normalized }
          : isEmail
          ? { senderEmail: normalized, senderDomain: normalized.split("@")[1] }
          : isUrl
          ? { ctaDomain: ctaDomainValue }
          : { senderDomain: normalized }),
      },
    })

    return { success: true, mapping }
  } catch (error: any) {
    console.error("Error adding mapping:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Get total campaign count across all entities
 */
export async function getTotalCampaignCount() {
  try {
    const [totalCampaigns, totalSms] = await Promise.all([
      prisma.competitiveInsightCampaign.count(),
      prisma.smsQueue.count({ where: { processed: true } }),
    ])

    const totalCommunications = totalCampaigns + totalSms

    return totalCommunications
  } catch (error) {
    console.error("Error fetching total campaign count:", error)
    return 0
  }
}

/**
 * Try to decode a tracking URL to extract the embedded destination URL
 * Common tracking formats: base64-encoded JSON with "u" field, query param "url", etc.
 */
function tryDecodeTrackingUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    
    // Check for common tracking URL query parameters
    const urlParam = urlObj.searchParams.get("url") || urlObj.searchParams.get("u") || urlObj.searchParams.get("target")
    if (urlParam) {
      return urlParam
    }
    
    // Try to decode base64-encoded path segments (common in tracking links)
    const pathSegments = urlObj.pathname.split("/").filter(Boolean)
    for (const segment of pathSegments) {
      try {
        // Try base64 decoding
        const decoded = Buffer.from(segment, "base64").toString("utf-8")
        
        // Check if it's JSON
        try {
          const json = JSON.parse(decoded)
          if (json.u) return json.u // Common field name for destination URL
          if (json.url) return json.url
          if (json.target) return json.target
        } catch {
          // Not JSON, check if it's a raw URL
          if (decoded.startsWith("http")) {
            return decoded
          }
        }
      } catch {
        // Not base64 or failed to decode
      }
    }
  } catch {
    // Invalid URL
  }
  
  return null
}

/**
 * Extract WinRed identifiers from CTA links
 */
export function extractWinRedIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    let url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    // Try the URL directly first
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("winred.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
          continue
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // If finalUrl is undefined, try decoding the tracking URL
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decodedUrl = tryDecodeTrackingUrl(url)
      if (decodedUrl) {
        try {
          const urlObj = new URL(decodedUrl)
          if (urlObj.hostname.includes("winred.com")) {
            const pathParts = urlObj.pathname.split("/").filter(Boolean)
            if (pathParts.length > 0 && pathParts[0]) {
              const identifier = pathParts[0].toLowerCase()
              identifiers.add(identifier)
            }
          }
        } catch {
          // Invalid decoded URL, skip
        }
      }
    }
  }

  return identifiers
}

/**
 * Extract Anedot identifiers from CTA links
 */
export function extractAnedotIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    let url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    // Try the URL directly first
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("anedot.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
          continue
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // If finalUrl is undefined, try decoding the tracking URL
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decodedUrl = tryDecodeTrackingUrl(url)
      if (decodedUrl) {
        try {
          const urlObj = new URL(decodedUrl)
          if (urlObj.hostname.includes("anedot.com")) {
            const pathParts = urlObj.pathname.split("/").filter(Boolean)
            if (pathParts.length > 0 && pathParts[0]) {
              const identifier = pathParts[0].toLowerCase()
              identifiers.add(identifier)
            }
          }
        } catch {
          // Invalid decoded URL, skip
        }
      }
    }
  }

  return identifiers
}

/**
 * Extract ActBlue identifiers from CTA links.
 * Handles two URL patterns:
 *   secure.actblue.com/donate/{identifier}
 *   secure.actblue.com/contribute/page/{identifier}
 */
export function extractActBlueIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    const tryExtract = (u: string) => {
      try {
        const urlObj = new URL(u)
        if (!urlObj.hostname.includes("actblue.com")) return
        const parts = urlObj.pathname.split("/").filter(Boolean)
        // Pattern 1: /donate/{identifier}
        if (parts[0] === "donate" && parts[1]) {
          identifiers.add(parts[1].toLowerCase())
        }
        // Pattern 2: /contribute/page/{identifier}
        if (parts[0] === "contribute" && parts[1] === "page" && parts[2]) {
          identifiers.add(parts[2].toLowerCase())
        }
      } catch {
        // invalid URL
      }
    }

    tryExtract(url)

    // Also try decoded tracking URL if finalUrl is absent
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decoded = tryDecodeTrackingUrl(url)
      if (decoded) tryExtract(decoded)
    }
  }

  return identifiers
}

/**
 * Extract PSQ identifiers from CTA links
 */
export function extractPSQIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    let url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    // Try the URL directly first
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("psqimpact.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length >= 2 && pathParts[0] === "donate") {
          const identifier = pathParts[1]
          identifiers.add(identifier)
          console.log(`[Data Broker] Extracted PSQ identifier: ${identifier}`)
          continue
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // If finalUrl is undefined, try decoding the tracking URL
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decodedUrl = tryDecodeTrackingUrl(url)
      if (decodedUrl) {
        try {
          const urlObj = new URL(decodedUrl)
          if (urlObj.hostname.includes("psqimpact.com")) {
            const pathParts = urlObj.pathname.split("/").filter(Boolean)
            if (pathParts.length >= 2 && pathParts[0] === "donate") {
              const identifier = pathParts[1]
              identifiers.add(identifier)
              console.log(`[Data Broker] Extracted PSQ identifier from tracking URL: ${identifier}`)
            }
          }
        } catch {
          // Invalid decoded URL, skip
        }
      }
    }
  }

  return identifiers
}

/**
 * Extract Revv identifiers from CTA links.
 * Handles two URL patterns:
 *   revv.com/{slug}/...          e.g. revv.com/amacaction
 *   {slug}.revv.co/{path}        e.g. amacaction.revv.co/db4ce6ba3f5c8287
 */
export function extractRevvIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  const tryExtract = (url: string) => {
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname.toLowerCase()

      // Pattern 1: revv.com/{slug}/...
      if (hostname === "revv.com" || hostname === "www.revv.com") {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          identifiers.add(pathParts[0].toLowerCase())
        }
        return
      }

      // Pattern 2: {slug}.revv.co
      if (hostname.endsWith(".revv.co")) {
        const subdomain = hostname.replace(/\.revv\.co$/, "")
        if (subdomain && subdomain !== "www") {
          identifiers.add(subdomain.toLowerCase())
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  for (const link of links) {
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    tryExtract(url)

    // Also try decoded tracking URL if finalUrl is absent
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decoded = tryDecodeTrackingUrl(url)
      if (decoded) tryExtract(decoded)
    }
  }

  return identifiers
}

/**
 * Extract NGPVAN identifiers from CTA links
 */
export function extractNGPVANIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    let url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    // Try the URL directly first
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("ngpvan.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
          continue
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // If finalUrl is undefined, try decoding the tracking URL
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decodedUrl = tryDecodeTrackingUrl(url)
      if (decodedUrl) {
        try {
          const urlObj = new URL(decodedUrl)
          if (urlObj.hostname.includes("ngpvan.com")) {
            const pathParts = urlObj.pathname.split("/").filter(Boolean)
            if (pathParts.length > 0 && pathParts[0]) {
              const identifier = pathParts[0].toLowerCase()
              identifiers.add(identifier)
            }
          }
        } catch {
          // Invalid decoded URL, skip
        }
      }
    }
  }

  return identifiers
}

/**
 * Extract Engage identifiers from CTA links
 * Pattern: engage.{identifier}.com or engage.{identifier}.gop or engage.{identifier}.org
 * e.g., engage.tomemmer.com -> "tomemmer"
 */
export function extractEngageIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    let url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    // Try the URL directly first
    try {
      const urlObj = new URL(url)
      // Check if hostname starts with "engage." and has a subdomain identifier
      const hostParts = urlObj.hostname.toLowerCase().split(".")
      if (hostParts[0] === "engage" && hostParts.length >= 2) {
        // The identifier is the second part (e.g., "tomemmer" from "engage.tomemmer.com")
        const identifier = hostParts[1]
        if (identifier && identifier !== "com" && identifier !== "org" && identifier !== "gop" && identifier !== "net") {
          identifiers.add(identifier)
          continue
        }
      }
    } catch {
      // Invalid URL, skip
    }
    
    // If finalUrl is undefined, try decoding the tracking URL
    if ((typeof link !== "string" && !link.finalUrl) || url.includes("trk.") || url.includes("tracking") || url.includes("click.")) {
      const decodedUrl = tryDecodeTrackingUrl(url)
      if (decodedUrl) {
        try {
          const urlObj = new URL(decodedUrl)
          const hostParts = urlObj.hostname.toLowerCase().split(".")
          if (hostParts[0] === "engage" && hostParts.length >= 2) {
            const identifier = hostParts[1]
            if (identifier && identifier !== "com" && identifier !== "org" && identifier !== "gop" && identifier !== "net") {
              identifiers.add(identifier)
            }
          }
        } catch {
          // Invalid decoded URL, skip
        }
      }
    }
  }

  return identifiers
}

/**
 * Extract donation platform identifiers from CTA links
 * Returns: { platform: "winred" | "anedot" | "psqimpact" | "ngpvan" | "engage", identifier: "nrcc" }
 */
function extractDonationIdentifiers(ctaLinks: any): Array<{ platform: string; identifier: string }> {
  const identifiers: Array<{ platform: string; identifier: string }> = []
  const winredIdentifiers = extractWinRedIdentifiers(ctaLinks)
  const anedotIdentifiers = extractAnedotIdentifiers(ctaLinks)
  const actblueIdentifiers = extractActBlueIdentifiers(ctaLinks)
  const psqIdentifiers = extractPSQIdentifiers(ctaLinks)
  const ngpvanIdentifiers = extractNGPVANIdentifiers(ctaLinks)
  const engageIdentifiers = extractEngageIdentifiers(ctaLinks)
  const revvIdentifiers = extractRevvIdentifiers(ctaLinks)

  for (const identifier of winredIdentifiers) {
    identifiers.push({ platform: "winred", identifier })
  }

  for (const identifier of anedotIdentifiers) {
    identifiers.push({ platform: "anedot", identifier })
  }

  for (const identifier of actblueIdentifiers) {
    identifiers.push({ platform: "actblue", identifier })
  }

  for (const identifier of psqIdentifiers) {
    identifiers.push({ platform: "psqimpact", identifier })
  }

  for (const identifier of ngpvanIdentifiers) {
    identifiers.push({ platform: "ngpvan", identifier })
  }

  for (const identifier of engageIdentifiers) {
    identifiers.push({ platform: "engage", identifier })
  }

  for (const identifier of revvIdentifiers) {
    identifiers.push({ platform: "revv", identifier })
  }

  return identifiers
}

/**
 * Find entity by donation identifier (supports WinRed, Anedot, PSQ Impact, NGPVAN, etc.)
 * Returns entity ID and the specific platform that matched
 */
async function findEntityByDonationIdentifier(
  ctaLinks: any,
  isDataBrokerFlow = false,
): Promise<{ entity: any; matchedIdentifier: string; platform: string } | null> {
  if (!ctaLinks || ctaLinks.length === 0) {
    return null
  }

  // Extract identifiers from CTAs
  const extractedIdentifiers = extractDonationIdentifiers(ctaLinks)

  if (isDataBrokerFlow) {
    console.log("[Data Broker] Extracted donation identifiers from CTAs:", {
      count: extractedIdentifiers.length,
      identifiers: extractedIdentifiers,
    })
  }

  if (extractedIdentifiers.length === 0) {
    if (isDataBrokerFlow) {
      console.log("[Data Broker] ✗ No donation identifiers found in CTAs")
    }
    return null
  }

  // Get all entities with donation identifiers
  const entities = await prisma.ciEntity.findMany({
    where: {
      donationIdentifiers: { not: null },
    },
    select: {
      id: true,
      name: true,
      donationIdentifiers: true,
    },
  })

  // Check each entity's identifiers against extracted ones
  for (const entity of entities) {
    if (!entity.donationIdentifiers) continue

    let identifiers: DonationIdentifiers
    if (typeof entity.donationIdentifiers === "string") {
      try {
        identifiers = JSON.parse(entity.donationIdentifiers)
      } catch (err) {
        console.warn(`Could not parse donationIdentifiers for entity ${entity.name}:`, err)
        continue
      }
    } else {
      identifiers = entity.donationIdentifiers as DonationIdentifiers
    }

    // Check each extracted identifier against entity's platform-specific identifiers
    for (const extracted of extractedIdentifiers) {
      const platformIdentifiers = identifiers[extracted.platform as keyof DonationIdentifiers]

      if (!platformIdentifiers) {
        continue
      }

      // Check if this identifier matches
      if (platformIdentifiers.includes(extracted.identifier)) {
        if (isDataBrokerFlow) {
          console.log("[Data Broker] ✓ Match found:", {
            entity: entity.name,
            platform: extracted.platform,
            identifier: extracted.identifier,
          })
        }
        return {
          entity: entity,
          matchedIdentifier: extracted.identifier,
          platform: extracted.platform,
        }
      }
    }
  }

  if (isDataBrokerFlow) {
    console.log("[Data Broker] ✗ No matching entity found for extracted identifiers")
  }

  return null
}
