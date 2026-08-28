/**
 * Remote MCP server for the "CI Entity Assignment" workflow, built for a
 * Claude.ai / Claude Desktop custom connector. See
 * docs/plans/CLAUDE_CI_ASSIGNMENT_MCP.md for the full design.
 *
 * Deliberately exposes ONLY these 5 tools - nothing else exists on this
 * surface, so Claude physically cannot call anything beyond this narrow
 * workflow:
 *   1. list_unassigned_messages   (ci:read)
 *   2. list_entities              (ci:read)
 *   3. assign_messages_to_entity  (ci:assign)
 *   4. create_entity              (ci:create_entity)
 *   5. update_entity_donation_identifiers (ci:update_entity)
 *
 * Auth: bearer token -> ApiKey table (shared with the read-only public v1
 * API, distinguished by scope strings - see lib/ci-api-auth.ts). Every write
 * tool additionally checks the global kill switch (AutomationSetting) and a
 * DB-backed rate limit, and writes a CiApiActionLog row with Claude's
 * "reasoning" for full auditability + Undo support.
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"
import prisma from "@/lib/prisma"
import {
  CI_SCOPES,
  CI_API_LIMITS,
  CiApiError,
  verifyBearerToken,
  requireCiScope,
  assertAutomationEnabled,
  enforceCiRateLimit,
  logCiApiAction,
} from "@/lib/ci-api-auth"
import {
  getUnassignedCampaigns,
  getUnassignedSms,
  getAllEntitiesWithCounts,
  createEntity,
  assignCampaignsToEntity,
  assignSmsToEntity,
  mergeEntityDonationIdentifiers,
  type DonationIdentifiers,
} from "@/lib/ci-entity-utils"
import { sendCiEntityCreatedByApiNotification } from "@/lib/ci-api-notifications"

const donationIdentifiersSchema = z
  .object({
    winred: z.array(z.string()).optional(),
    anedot: z.array(z.string()).optional(),
    actblue: z.array(z.string()).optional(),
    psqimpact: z.array(z.string()).optional(),
    ngpvan: z.array(z.string()).optional(),
    engage: z.array(z.string()).optional(),
    substack: z.string().optional(),
    revv: z.array(z.string()).optional(),
  })
  .strict()

function toolError(error: unknown) {
  const message = error instanceof CiApiError ? error.message : "An unexpected error occurred"
  console.error("[v0] CI Assignment MCP tool error:", error)
  return { content: [{ type: "text" as const, text: message }], isError: true }
}

const handler = createMcpHandler(
  (server) => {
    // ── Tool 1: list_unassigned_messages ──────────────────────────────────
    server.registerTool(
      "list_unassigned_messages",
      {
        title: "List Unassigned Messages",
        description:
          "Lists unassigned email campaigns and/or SMS messages awaiting entity assignment. Returns only sender name/email/phone, subject/message preview, CTA links, and date - the same fields already visible in the manual admin UI. No full raw bodies, no donor-level data, no client account data.",
        inputSchema: {
          kind: z.enum(["email", "sms", "both"]).default("both").describe("Which message type to list"),
          limit: z.number().int().min(1).max(100).default(50),
        },
      },
      async ({ kind, limit }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.READ)

          const results: Record<string, unknown> = {}

          if (kind === "email" || kind === "both") {
            const campaigns = await getUnassignedCampaigns()
            results.emails = campaigns.slice(0, limit).map((c) => ({
              id: c.id,
              senderName: c.senderName,
              senderEmail: c.senderEmail,
              subject: c.subject,
              preview: c.emailPreview,
              ctaLinks: c.ctaLinks,
              dateReceived: c.dateReceived,
            }))
          }

          if (kind === "sms" || kind === "both") {
            const smsMessages = await getUnassignedSms()
            results.sms = smsMessages.slice(0, limit).map((s) => ({
              id: s.id,
              phoneNumber: s.phoneNumber,
              message: s.message,
              ctaLinks: s.ctaLinks,
              createdAt: s.createdAt,
            }))
          }

          return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 2: list_entities ──────────────────────────────────────────────
    server.registerTool(
      "list_entities",
      {
        title: "List Entities",
        description:
          "Searches existing CI entities (politicians, PACs, organizations) by name, party, or state. Returns entity id, name, type, party, state, and existing donationIdentifiers - use this to find the right entity before calling assign_messages_to_entity, or to confirm no match exists before calling create_entity.",
        inputSchema: {
          search: z.string().optional().describe("Case-insensitive substring match on entity name"),
          party: z.string().optional(),
          state: z.string().optional(),
          limit: z.number().int().min(1).max(100).default(25),
        },
      },
      async ({ search, party, state, limit }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.READ)

          const { entities } = await getAllEntitiesWithCounts({
            search,
            party: party || "all",
            state: state || "all",
            pageSize: limit,
          })

          const results = entities.map((e) => ({
            id: e.id,
            name: e.name,
            type: e.type,
            party: e.party,
            state: e.state,
            donationIdentifiers: e.donationIdentifiers,
          }))

          return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 3: assign_messages_to_entity ──────────────────────────────────
    server.registerTool(
      "assign_messages_to_entity",
      {
        title: "Assign Messages to Entity",
        description: `Assigns a batch of unassigned email and/or SMS message IDs to an entity. Requires a "reasoning" string explaining the match (e.g. sender domain, donation link, phone number) - this is stored in the audit log. Only touches messages you explicitly list; never re-assigns already-assigned messages. Max ${CI_API_LIMITS.MAX_BATCH_SIZE} message IDs per call.`,
        inputSchema: {
          entityId: z.string().describe("The CiEntity id to assign these messages to"),
          campaignIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
          smsIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
          reasoning: z.string().min(1).describe("Why this batch of messages belongs to this entity"),
        },
      },
      async ({ entityId, campaignIds, smsIds, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.ASSIGN)
          await assertAutomationEnabled()

          const totalCount = campaignIds.length + smsIds.length
          if (totalCount === 0) {
            throw new CiApiError("At least one campaignId or smsId is required", 400)
          }
          if (totalCount > CI_API_LIMITS.MAX_BATCH_SIZE) {
            throw new CiApiError(`Batch size exceeds the max of ${CI_API_LIMITS.MAX_BATCH_SIZE} messages`, 400)
          }

          const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
          if (!entity) {
            throw new CiApiError(`Entity ${entityId} not found`, 404)
          }

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "assign_messages")

          let campaignResult: { success: boolean; assignedCount?: number; error?: string } = { success: true }
          let smsResult: { success: boolean; assignedCount?: number; error?: string } = { success: true }

          if (campaignIds.length > 0) {
            campaignResult = await assignCampaignsToEntity(campaignIds, entityId, false, "api_claude")
          }
          if (smsIds.length > 0) {
            smsResult = await assignSmsToEntity(smsIds, entityId, false, "api_claude")
          }

          await logCiApiAction({
            apiKeyId,
            action: "assign_messages",
            reasoning,
            targetType: campaignIds.length > 0 && smsIds.length > 0 ? undefined : campaignIds.length > 0 ? "campaign" : "sms",
            targetIds: [...campaignIds, ...smsIds],
            entityId,
            afterState: { entityId, campaignIds, smsIds },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: campaignResult.success && smsResult.success,
                    assignedEmailCount: campaignResult.assignedCount ?? 0,
                    assignedSmsCount: smsResult.assignedCount ?? 0,
                    entityId,
                    entityName: entity.name,
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 4: create_entity ──────────────────────────────────────────────
    server.registerTool(
      "create_entity",
      {
        title: "Create Entity",
        description:
          'Creates a new CiEntity (politician, PAC, or organization) when no existing entity matches an unassigned message. Requires a "reasoning" string. Triggers an immediate admin email alert for review since a wrong new entity is the highest-risk mistake on this surface.',
        inputSchema: {
          name: z.string().min(1),
          type: z.enum(["politician", "pac", "organization"]),
          description: z.string().optional(),
          party: z.enum(["republican", "democrat", "independent"]).optional(),
          state: z.string().optional().describe('State abbreviation (e.g. "CA") or "Nationwide"'),
          donationIdentifiers: donationIdentifiersSchema.optional(),
          reasoning: z.string().min(1).describe("Why this entity needs to be created (no existing match found)"),
        },
      },
      async ({ name, type, description, party, state, donationIdentifiers, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.CREATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          const apiKeyName = extra.authInfo!.extra!.apiKeyName as string
          await enforceCiRateLimit(apiKeyId, "create_entity")

          const existing = await prisma.ciEntity.findUnique({ where: { name } })
          if (existing) {
            throw new CiApiError(
              `An entity named "${name}" already exists (id: ${existing.id}). Use list_entities to find it instead of creating a duplicate.`,
              409,
            )
          }

          const result = await createEntity(
            name,
            type,
            description,
            party,
            state,
            donationIdentifiers as DonationIdentifiers | undefined,
          )

          if (!result.success || !result.entity) {
            throw new CiApiError(result.error || "Failed to create entity", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "create_entity",
            reasoning,
            targetType: "entity",
            entityId: result.entity.id,
            afterState: { name, type, description, party, state, donationIdentifiers },
          })

          sendCiEntityCreatedByApiNotification({
            entityId: result.entity.id,
            entityName: name,
            entityType: type,
            party,
            state,
            reasoning,
            apiKeyName,
            createdAt: new Date(),
          }).catch((err) => console.error("[v0] Failed to send CI entity creation alert email:", err))

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId: result.entity.id, name }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 5: update_entity_donation_identifiers ─────────────────────────
    server.registerTool(
      "update_entity_donation_identifiers",
      {
        title: "Update Entity Donation Identifiers",
        description:
          'Merges new WinRed/ActBlue/Anedot/etc. slugs into an existing entity\'s donationIdentifiers. Only this field is editable through this tool - name, party, state, bio, and image stay off-limits. New values are merged/de-duped with existing ones, never overwritten. Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string(),
          donationIdentifiers: donationIdentifiersSchema,
          reasoning: z.string().min(1).describe("Why these identifiers belong to this entity"),
        },
      },
      async ({ entityId, donationIdentifiers, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.UPDATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "update_entity_identifiers")

          const result = await mergeEntityDonationIdentifiers(entityId, donationIdentifiers as DonationIdentifiers)

          if (!result.success) {
            throw new CiApiError(result.error || "Failed to update entity", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "update_entity_identifiers",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: result.before,
            afterState: result.after,
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, donationIdentifiers: result.after }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )
  },
  {
    serverInfo: { name: "rip-tool-ci-assignment", version: "1.0.0" },
  },
  { basePath: "/api/mcp/ci-assignment" },
)

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const verified = await verifyBearerToken(bearerToken ? `Bearer ${bearerToken}` : null)
    if (!verified) return undefined
    return {
      token: bearerToken || "",
      clientId: verified.id,
      scopes: verified.scopes,
      extra: { apiKeyId: verified.id, apiKeyName: verified.name },
    }
  },
  { required: true },
)

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
