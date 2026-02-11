import { PrismaClient } from "@prisma/client"
import { generateObject } from "ai"
import { z } from "zod"

const prisma = new PrismaClient()

// Type for platform-specific donation identifiers
export type DonationIdentifiers = {
  winred?: string[]
  anedot?: string[]
  actblue?: string[]
  psqimpact?: string[]
  ngpvan?: string[] // Added NGPVAN to donation identifiers type
}

// Type for entity assignment
type EntityAssignment = {
  entityId: string
  assignmentMethod: "auto_domain" | "auto_winred" | "auto_anedot" | "auto_phone"
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
    model: "openai:gpt-4o-mini",
    mode: "json",
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

    console.log("[Data Broker AI] Analysis complete:", {
      type: result.object.type,
      confidence: result.object.confidence,
      reasoning: result.object.reasoning.slice(0, 100),
    })
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

    if (entity && entity.type === "data_broker" && emailSubject && emailBody) {
      console.log("[Data Broker] Detected data broker email:", {
        sender: senderEmail,
        senderName,
        domain,
        databrokerEntity: entity.name,
        entityId: entity.id,
        subject: emailSubject,
        mappingType: emailMapping ? "email" : "domain",
      })

      const aiAnalysis = await analyzeEmailWithAI(emailSubject, emailBody)

      if (aiAnalysis && aiAnalysis.confidence >= 0.7) {
        if (aiAnalysis.type === "newsletter") {
          console.log("[Data Broker] ✓ Assigning to data broker entity (newsletter):", {
            entityName: entity.name,
            entityId: entity.id,
            confidence: aiAnalysis.confidence,
            reasoning: aiAnalysis.reasoning,
          })
          return { entityId: entity.id, assignmentMethod: "auto_domain" }
        } else {
          console.log("[Data Broker] Sponsored campaign detected, checking donation identifiers:", {
            confidence: aiAnalysis.confidence,
            reasoning: aiAnalysis.reasoning,
          })

          if (ctaLinks) {
            console.log("[Data Broker] CTAs passed to donation matcher:", {
              ctaCount: ctaLinks.length,
              urls: ctaLinks.map((link: any) => ({
                url: link.url,
                finalUrl: link.finalUrl,
                originalUrl: link.originalUrl,
                type: link.type,
              })),
            })

            const donationMatch = await findEntityByDonationIdentifier(ctaLinks, true)
            if (donationMatch) {
              console.log("[Data Broker] ✓ Sponsored campaign assigned via donation identifier:", {
                entityId: donationMatch.entity.id,
                method: donationMatch.assignmentMethod,
              })
              return { entityId: donationMatch.entity.id, assignmentMethod: donationMatch.assignmentMethod }
            }
          } else {
            console.log("[Data Broker] No CTAs provided for donation identifier matching")
          }

          console.log(
            "[Data Broker] ✗ Sponsored campaign but no donation identifier match - leaving unassigned for manual review",
          )
          return null
        }
      } else {
        console.log("[Data Broker] ✗ AI analysis uncertain - leaving unassigned for manual review:", {
          confidence: aiAnalysis?.confidence ?? "null",
          reasoning: aiAnalysis?.reasoning ?? "AI analysis failed",
        })
        return null
      }
    }

    if (ctaLinks) {
      const donationMatch = await findEntityByDonationIdentifier(ctaLinks)
      if (donationMatch) {
        return { entityId: donationMatch.entity.id, assignmentMethod: donationMatch.assignmentMethod }
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
        return { entityId: donationMatch.entity.id, assignmentMethod: donationMatch.assignmentMethod }
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
 * Get all entities with their mapping counts (paginated with filters)
 */
export async function getAllEntitiesWithCounts(options?: {
  page?: number
  pageSize?: number
  party?: string
  state?: string
  type?: string
  search?: string
}) {
  try {
    const page = options?.page || 1
    const pageSize = options?.pageSize || 100
    const skip = (page - 1) * pageSize

    // Build where clause for filtering
    const where: any = {}

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
      where.type = options.type
    }

    if (options?.search?.trim()) {
      where.name = {
        contains: options.search.trim(),
        mode: "insensitive",
      }
    }

    // Get total count for pagination
    const totalCount = await prisma.ciEntity.count({ where })

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
      orderBy: { name: "asc" },
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
      },
    })

    return { success: true, entity }
  } catch (error: any) {
    console.error("Error updating entity:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Assign campaigns to an entity and create mapping
 */
export async function assignCampaignsToEntity(campaignIds: string[], entityId: string, createMapping = true) {
  try {
    await prisma.competitiveInsightCampaign.updateMany({
      where: { id: { in: campaignIds } },
      data: {
        entityId,
        assignmentMethod: "manual",
        assignedAt: new Date(),
      },
    })

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
        }

        const matchingCampaigns = await prisma.competitiveInsightCampaign.updateMany({
          where: {
            entityId: null, // Only update unassigned campaigns
            OR: [
              { senderEmail: senderEmail },
              { senderEmail: { endsWith: `@${domain}` } }, // Match all emails from this domain
            ],
          },
          data: {
            entityId,
            assignmentMethod: "manual",
            assignedAt: new Date(),
          },
        })

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
export async function assignSmsToEntity(smsIds: string[], entityId: string, createMapping = true) {
  try {
    await prisma.smsQueue.updateMany({
      where: { id: { in: smsIds } },
      data: {
        entityId,
        assignmentMethod: "manual",
        assignedAt: new Date(),
      },
    })

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
        }

        const matchingSms = await prisma.smsQueue.updateMany({
          where: {
            entityId: null, // Only update unassigned SMS
            phoneNumber: sms.phoneNumber,
          },
          data: {
            entityId,
            assignmentMethod: "manual",
            assignedAt: new Date(),
          },
        })

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

    // Determine if it's an email or domain
    const isEmail = normalized.includes("@")

    // Check if mapping already exists
    const existingMapping = await prisma.ciEntityMapping.findFirst({
      where: {
        entityId,
        OR: isEmail ? [{ senderEmail: normalized }] : [{ senderDomain: normalized }],
      },
    })

    if (existingMapping) {
      return { success: false, error: "Mapping already exists" }
    }

    // Create the mapping
    const mapping = await prisma.ciEntityMapping.create({
      data: {
        entityId,
        ...(isEmail
          ? { senderEmail: normalized, senderDomain: normalized.split("@")[1] }
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
 * Extract WinRed identifiers from CTA links
 */
export function extractWinRedIdentifiers(ctaLinks: any): Set<string> {
  const identifiers = new Set<string>()
  if (!ctaLinks) return identifiers

  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("winred.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
        }
      }
    } catch {
      // Invalid URL, skip
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
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("anedot.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
        }
      }
    } catch {
      // Invalid URL, skip
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
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("psqimpact.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length >= 2 && pathParts[0] === "donate") {
          const identifier = pathParts[1]
          identifiers.add(identifier)
          console.log(`[Data Broker] Extracted PSQ identifier: ${identifier}`)
        }
      }
    } catch {
      // Invalid URL, skip
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
    const url = typeof link === "string" ? link : link.finalUrl || link.url
    if (!url) continue

    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("ngpvan.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          const identifier = pathParts[0].toLowerCase()
          identifiers.add(identifier)
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return identifiers
}

/**
 * Extract donation platform identifiers from CTA links
 * Returns: { platform: "winred" | "anedot" | "psqimpact" | "ngpvan", identifier: "nrcc" }
 */
function extractDonationIdentifiers(ctaLinks: any): Array<{ platform: string; identifier: string }> {
  const identifiers: Array<{ platform: string; identifier: string }> = []
  const winredIdentifiers = extractWinRedIdentifiers(ctaLinks)
  const anedotIdentifiers = extractAnedotIdentifiers(ctaLinks)
  const psqIdentifiers = extractPSQIdentifiers(ctaLinks)
  const ngpvanIdentifiers = extractNGPVANIdentifiers(ctaLinks)

  for (const identifier of winredIdentifiers) {
    identifiers.push({ platform: "winred", identifier })
  }

  for (const identifier of anedotIdentifiers) {
    identifiers.push({ platform: "anedot", identifier })
  }

  for (const identifier of psqIdentifiers) {
    identifiers.push({ platform: "psqimpact", identifier })
  }

  for (const identifier of ngpvanIdentifiers) {
    identifiers.push({ platform: "ngpvan", identifier })
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
