/**
 * Remote MCP server for the "CI Entity Assignment" workflow, built for a
 * Claude.ai / Claude Desktop custom connector. See
 * docs/plans/CLAUDE_CI_ASSIGNMENT_MCP.md for the full design.
 *
 * Deliberately exposes ONLY these 22 tools - nothing else exists on this
 * surface, so Claude/Grok physically cannot call anything beyond this narrow
 * workflow:
 *   1. list_unassigned_messages   (ci:read)
 *   2. list_entities              (ci:read)
 *   3. assign_messages_to_entity  (ci:assign)
 *   4. create_entity              (ci:create_entity)
 *   5. update_entity_donation_identifiers (ci:update_entity)
 *   6. list_delete_eligible_messages (ci:read)
 *   7. delete_messages            (ci:delete)
 *   8. categorize_messages        (ci:assign)
 *   9. list_entity_mappings       (ci:read)
 *   10. add_entity_mapping        (ci:manage_mappings)
 *   11. remove_entity_mapping     (ci:manage_mappings)
 *   12. update_entity_type        (ci:update_entity)
 *   13. delete_entity             (ci:delete_entity)
 *   14. get_digest_inbox_pulse       (ci:digest_read)
 *   15. get_digest_loudest_senders   (ci:digest_read)
 *   16. get_digest_repeating_content (ci:digest_read)
 *   17. get_digest_patterns_and_types (ci:digest_read)
 *   18. get_digest_dem_footnote      (ci:digest_read)
 *   19. update_entity_name        (ci:update_entity)
 *   20. update_entity_party       (ci:update_entity)
 *   21. update_entity_state       (ci:update_entity)
 *   22. list_accounts             (ci:accounts_read)
 *
 * Tools 9-11 manage the sender email/domain/phone and CTA-domain mappings
 * that assign_messages_to_entity / categorize_messages match against - so
 * Claude can both assign messages using existing mappings AND keep those
 * mappings current (e.g. a candidate switches ESPs and starts sending from
 * a new domain) without needing separate admin UI access.
 *
 * Tool 12 lets an entity's type (politician/pac/organization/nonprofit/
 * state_party) be corrected after creation (e.g. DLCC was miscategorized as
 * "organization" instead of a party committee) - restricted to only the
 * `type` field, same pattern as update_entity_donation_identifiers.
 *
 * Tool 13 lets an entity created by mistake (duplicate, wrong org entirely)
 * be removed outright - unassigns any campaigns/SMS pointed at it and
 * deletes its mappings first, same cleanup order as the admin UI's delete
 * button. Gated by its own scope (ci:delete_entity) and a conservative daily
 * cap, separate from ci:delete (which only covers junk message deletion),
 * since deleting an entity is more destructive than deleting a message.
 *
 * Tools 14-18 back the Mon/Wed/Fri CI digest write-up (originally handed to
 * Claude, now Grok). Gated by their own scope (ci:digest_read) rather than
 * "ci:read" so a digest-only key can't also browse/act on unassigned
 * messages or entities. All five are read-only, global (not client-scoped -
 * this digest goes to every client), and return only aggregated counts and
 * already-sanitized subject/message text - never raw email bodies, donor
 * data, or client account data. No rate limit or kill-switch check, same as
 * the other read-only tools (1, 2, 6, 9).
 *
 * Tool 19 lets an entity's display `name` be corrected after creation (e.g.
 * "Kristen Gillibrand" -> "Kirsten Gillibrand") - restricted to only the
 * `name` field, same pattern as update_entity_type, and blocked if another
 * entity already has the target name.
 *
 * Tool 22 lists client accounts, their user contacts, and live Stripe
 * payment status (subscription state, amount, renewal date, past-due/invoice
 * status). Gated by its own scope (ci:accounts_read) rather than "ci:read"
 * since it exposes contact/billing data across every client, not just CI
 * workflow data - a key without this scope cannot see it. Read-only, no rate
 * limit or kill-switch check, same as the other read-only tools.
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
  updateEntityType,
  updateEntityName,
  updateEntityParty,
  updateEntityState,
  getSopDeleteEligibleMessages,
  softDeleteMessages,
  categorizeMessages,
  getEntityMappings,
  addEntityMapping,
  deleteEntityMapping,
  deleteEntity,
  type DonationIdentifiers,
} from "@/lib/ci-entity-utils"
import { sendCiEntityCreatedByApiNotification } from "@/lib/ci-api-notifications"
import { nameToSlug } from "@/lib/directory-utils"
import { SUBJECT_PATTERNS } from "@/lib/subject-line-classifier"
import { MESSAGE_TYPE_LABELS } from "@/lib/message-classifier"

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
          'Creates a new CiEntity (politician, PAC, organization, nonprofit/foundation, or state party committee) when no existing entity matches an unassigned message. Use "nonprofit" for 501(c) foundations and nonprofit advocacy groups (e.g. a legal foundation or a political action coalition\'s foundation arm) rather than forcing them into "organization". Use "state_party" for state-level party committees (e.g. the Maine Democratic Party) rather than forcing them into "organization" or "pac". Requires a "reasoning" string. Triggers an immediate admin email alert for review since a wrong new entity is the highest-risk mistake on this surface.',
        inputSchema: {
          name: z.string().min(1),
          type: z.enum(["politician", "pac", "organization", "nonprofit", "state_party"]),
          description: z.string().optional(),
          party: z.enum(["republican", "democrat", "independent"]).optional(),
          state: z.string().optional().describe('State abbreviation (e.g. "CA") or "Nationwide"'),
          donationIdentifiers: donationIdentifiersSchema.optional(),
          ballotpediaUrl: z
            .string()
            .url()
            .optional()
            .describe(
              "The entity's Ballotpedia page URL (e.g. https://ballotpedia.org/Jane_Doe), if known. Once set, the nightly refresh cron automatically scrapes it to fill in the entity's bio, office, and headshot - so providing this now saves a manual admin step later.",
            ),
          reasoning: z.string().min(1).describe("Why this entity needs to be created (no existing match found)"),
        },
      },
      async ({ name, type, description, party, state, donationIdentifiers, ballotpediaUrl, reasoning }, extra) => {
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
            ballotpediaUrl,
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
            afterState: { name, type, description, party, state, donationIdentifiers, ballotpediaUrl },
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

    // ── Tool 12: update_entity_type ────────────────────────────────────────
    server.registerTool(
      "update_entity_type",
      {
        title: "Update Entity Type",
        description:
          'Changes an existing entity\'s type (e.g. "organization" -> "state_party" or "pac") to fix a miscategorization. Only this field is editable through this tool - name, party, state, donationIdentifiers, bio, and image stay off-limits. Use list_entities first to confirm the entityId and current type. Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string(),
          type: z.enum(["politician", "pac", "organization", "nonprofit", "state_party"]),
          reasoning: z.string().min(1).describe("Why this entity's type is being corrected"),
        },
      },
      async ({ entityId, type, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.UPDATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "update_entity_type")

          const result = await updateEntityType(entityId, type)

          if (!result.success) {
            throw new CiApiError(result.error || "Failed to update entity type", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "update_entity_type",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: { type: result.before },
            afterState: { type: result.after },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, type: result.after }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 13: delete_entity ───────────────────────────────────────────────
    // NOTE: this tool was documented in the header comment above and
    // deleteEntity() was already imported from lib/ci-entity-utils, but the
    // actual server.registerTool() call was never added - meaning the tool
    // never existed on the MCP surface at all, regardless of the caller's
    // scopes. That's the real cause of Grok's "still can't delete" reports;
    // it wasn't a bad/stale API key or a missing ci:delete_entity scope
    // (the "Grok" key already has it - see AutomationSetting/ApiKey rows).
    server.registerTool(
      "delete_entity",
      {
        title: "Delete Entity",
        description:
          'Permanently deletes a CiEntity created by mistake (exact duplicate, or the wrong org entirely) - unassigns any campaigns/SMS pointed at it (sets their entityId back to null, does not delete the messages themselves) and removes its sender/CTA mappings first, then deletes the entity row. This cannot be undone through this tool. Use list_entities first to confirm the entityId and that it has few/no assigned messages before deleting. Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string().describe("The CiEntity id to delete"),
          reasoning: z.string().min(1).describe("Why this entity is being deleted (e.g. exact duplicate of entity X)"),
        },
      },
      async ({ entityId, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DELETE_ENTITY)
          await assertAutomationEnabled()

          const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
          if (!entity) {
            throw new CiApiError(`Entity ${entityId} not found`, 404)
          }

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "delete_entity")

          const result = await deleteEntity(entityId)
          if (!result.success) {
            throw new CiApiError(result.error || "Failed to delete entity", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "delete_entity",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: { name: entity.name, type: entity.type, party: entity.party, state: entity.state },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, deletedName: entity.name }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 19: update_entity_name ──────���──────────────────────────────────
    server.registerTool(
      "update_entity_name",
      {
        title: "Update Entity Name",
        description:
          'Fixes an existing entity\'s display name (e.g. a misspelling like "Kristen Gillibrand" -> "Kirsten Gillibrand"). Only this field is editable through this tool - type, party, state, donationIdentifiers, bio, and image stay off-limits. Use list_entities first to confirm the entityId and current name. Fails if another entity already has the target name. Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string(),
          name: z.string().min(1).describe("The corrected display name"),
          reasoning: z.string().min(1).describe("Why this entity's name is being corrected"),
        },
      },
      async ({ entityId, name, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.UPDATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "update_entity_name")

          const result = await updateEntityName(entityId, name)

          if (!result.success) {
            throw new CiApiError(result.error || "Failed to update entity name", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "update_entity_name",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: { name: result.before },
            afterState: { name: result.after },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, name: result.after }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 20: update_entity_party ─────────────────────────────────────────
    server.registerTool(
      "update_entity_party",
      {
        title: "Update Entity Party",
        description:
          'Fixes an existing entity\'s party affiliation (e.g. missing/null -> "democrat", or correcting a wrong value). Only this field is editable through this tool - name, type, state, donationIdentifiers, bio, and image stay off-limits. Use list_entities first to confirm the entityId and current party. Pass null to clear the party (e.g. a nonpartisan org). Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string(),
          party: z.enum(["republican", "democrat", "independent"]).nullable().describe("New party, or null to clear"),
          reasoning: z.string().min(1).describe("Why this entity's party is being corrected"),
        },
      },
      async ({ entityId, party, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.UPDATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "update_entity_party")

          const result = await updateEntityParty(entityId, party)

          if (!result.success) {
            throw new CiApiError(result.error || "Failed to update entity party", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "update_entity_party",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: { party: result.before },
            afterState: { party: result.after },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, party: result.after }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 21: update_entity_state ─────────────────────────────────────────
    server.registerTool(
      "update_entity_state",
      {
        title: "Update Entity State",
        description:
          'Fixes an existing entity\'s state (e.g. missing/null -> "NY", or correcting a wrong value). Only this field is editable through this tool - name, type, party, donationIdentifiers, bio, and image stay off-limits. Use list_entities first to confirm the entityId and current state. Pass null to clear the state (e.g. a national committee). Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string(),
          state: z
            .string()
            .nullable()
            .describe('Two-letter state code (e.g. "NY"), "Nationwide", or null to clear'),
          reasoning: z.string().min(1).describe("Why this entity's state is being corrected"),
        },
      },
      async ({ entityId, state, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.UPDATE_ENTITY)
          await assertAutomationEnabled()

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "update_entity_state")

          const result = await updateEntityState(entityId, state)

          if (!result.success) {
            throw new CiApiError(result.error || "Failed to update entity state", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "update_entity_state",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: { state: result.before },
            afterState: { state: result.after },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ success: true, entityId, state: result.after }, null, 2),
              },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 6: list_delete_eligible_messages ────────────────────────────────
    server.registerTool(
      "list_delete_eligible_messages",
      {
        title: "List Delete-Eligible Messages",
        description:
          'Scans unassigned email/SMS messages against the SOP\'s "always delete" rules and returns only the ones that match, each with the specific reason(s) it matched (bad sender, no real CTA, dead t.ly/redirect link, or older than 1 day). Read-only - use this to preview exactly what delete_messages would remove before calling it.',
        inputSchema: {},
      },
      async (_args, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.READ)
          const results = await getSopDeleteEligibleMessages()
          return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 7: delete_messages ──────────────────────────────────────────────
    server.registerTool(
      "delete_messages",
      {
        title: "Delete Messages",
        description: `Soft-deletes a batch of unassigned email and/or SMS message IDs per the SOP's "always delete" rules (bad sender/domain, 0 real CTAs, dead t.ly/redirect link, or >1 day old). Requires a "reasoning" string explaining which rule(s) matched - stored in the audit log. Never hard-deletes (an admin can undo from the Automation API activity log), and never touches messages already assigned to an entity. Max ${CI_API_LIMITS.MAX_BATCH_SIZE} message IDs per call. Use list_delete_eligible_messages first to confirm what you're about to delete.`,
        inputSchema: {
          campaignIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
          smsIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
          reasoning: z.string().min(1).describe("Which SOP delete rule(s) this batch matched"),
        },
      },
      async ({ campaignIds, smsIds, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DELETE)
          await assertAutomationEnabled()

          const totalCount = campaignIds.length + smsIds.length
          if (totalCount === 0) {
            throw new CiApiError("At least one campaignId or smsId is required", 400)
          }
          if (totalCount > CI_API_LIMITS.MAX_BATCH_SIZE) {
            throw new CiApiError(`Batch size exceeds the max of ${CI_API_LIMITS.MAX_BATCH_SIZE} messages`, 400)
          }

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "delete_messages")

          const result = await softDeleteMessages(campaignIds, smsIds, `api_claude:${apiKeyId}`)

          await logCiApiAction({
            apiKeyId,
            action: "delete_messages",
            reasoning,
            targetType: campaignIds.length > 0 && smsIds.length > 0 ? undefined : campaignIds.length > 0 ? "campaign" : "sms",
            targetIds: [...campaignIds, ...smsIds],
            afterState: { campaignIds, smsIds },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    deletedEmailCount: result.deletedCampaignCount,
                    deletedSmsCount: result.deletedSmsCount,
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

    // ── Tool 8: categorize_messages ─────────────────────────────────────────
    server.registerTool(
      "categorize_messages",
      {
        title: "Categorize Messages",
        description:
          'Same logic as the "Categorize" button in the admin UI: attempts to auto-assign each message by matching its CTA links against donation-platform identifiers (WinRed/ActBlue/Anedot/PSQ/Revv) or a known CTA root-domain mapping already saved on an entity - for when the sender email domain or phone number alone can\'t identify the entity, but the donation URL on the message can. Conservative by design: only assigns on an exact identifier/domain match already on file, never a guess, and never touches an already-assigned message. No "reasoning" needed since the match is deterministic - each result reports which method matched (auto_winred, auto_actblue, auto_cta_domain, etc.) or why it was skipped. Use list_unassigned_messages first to get IDs, then call this before falling back to assign_messages_to_entity for anything left unmatched.',
        inputSchema: {
          campaignIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
          smsIds: z.array(z.string()).max(CI_API_LIMITS.MAX_BATCH_SIZE).default([]),
        },
      },
      async ({ campaignIds, smsIds }, extra) => {
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

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "categorize_messages")

          const items = [
            ...campaignIds.map((id) => ({ id, type: "email" as const })),
            ...smsIds.map((id) => ({ id, type: "sms" as const })),
          ]
          const results = await categorizeMessages(items)
          const matched = results.filter((r) => r.success)

          if (matched.length > 0) {
            await logCiApiAction({
              apiKeyId,
              action: "categorize_messages",
              reasoning: "Auto-matched via donation platform identifiers / CTA domain (deterministic, no entity guessing)",
              targetType: undefined,
              targetIds: matched.map((m) => m.id),
              afterState: { results: matched },
            })
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { matchedCount: matched.length, totalCount: results.length, results },
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

    // ── Tool 9: list_entity_mappings ─────────────────────────────────────────
    server.registerTool(
      "list_entity_mappings",
      {
        title: "List Entity Mappings",
        description:
          "Lists the sender email/domain/phone and CTA-domain mappings already saved on an entity - the same mappings shown in the admin UI's \"Email & SMS Mappings\" panel. These are what assign_messages_to_entity is really keying off of when a match is obvious, and what categorize_messages matches against for auto-assignment. Use this before add_entity_mapping to confirm a mapping doesn't already exist, or before remove_entity_mapping to get the exact mappingId to remove.",
        inputSchema: {
          entityId: z.string().describe("The CiEntity id to list mappings for"),
        },
      },
      async ({ entityId }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.READ)

          const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
          if (!entity) {
            throw new CiApiError(`Entity ${entityId} not found`, 404)
          }

          const mappings = await getEntityMappings(entityId)
          const results = mappings.map((m) => ({
            id: m.id,
            senderEmail: m.senderEmail,
            senderDomain: m.senderDomain,
            senderPhone: m.senderPhone,
            ctaDomain: m.ctaDomain,
            createdAt: m.createdAt,
          }))

          return {
            content: [
              { type: "text" as const, text: JSON.stringify({ entityId, entityName: entity.name, mappings: results }, null, 2) },
            ],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Tool 10: add_entity_mapping ──────────────────────────────────────────
    server.registerTool(
      "add_entity_mapping",
      {
        title: "Add Entity Mapping",
        description:
          'Adds one sender email, sender domain, SMS short code/phone number, or CTA link/domain to an entity, exactly like the "+" buttons in the admin UI\'s "Email & SMS Mappings" panel. Any future email/SMS from this sender (or with a CTA link on this domain) will then be eligible for auto-assignment to this entity via categorize_messages, or recognized as an obvious match for assign_messages_to_entity. The value is auto-classified: all-digits -> phone/short code, contains "@" -> sender email, contains "://" -> CTA domain (root domain + path extracted from the URL), otherwise -> sender domain. Rejects shared email platforms (e.g. substack.com, mailchimp.com) as a bare domain since that would misassign every other sender on that platform - use the full sender email address instead. Requires a "reasoning" string.',
        inputSchema: {
          entityId: z.string().describe("The CiEntity id to add this mapping to"),
          value: z
            .string()
            .min(1)
            .describe(
              'The email (e.g. "info@example.com"), domain (e.g. "example.com"), phone/short code (e.g. "55404"), or CTA URL (e.g. "https://go.example.com/donate") to map',
            ),
          reasoning: z.string().min(1).describe("Why this sender/domain/phone/CTA link belongs to this entity"),
        },
      },
      async ({ entityId, value, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.MANAGE_MAPPINGS)
          await assertAutomationEnabled()

          const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
          if (!entity) {
            throw new CiApiError(`Entity ${entityId} not found`, 404)
          }

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "add_entity_mapping")

          const result = await addEntityMapping(entityId, value)
          if (!result.success || !result.mapping) {
            throw new CiApiError(result.error || "Failed to add mapping", 400)
          }

          await logCiApiAction({
            apiKeyId,
            action: "add_entity_mapping",
            reasoning,
            targetType: "entity",
            entityId,
            afterState: {
              mappingId: result.mapping.id,
              senderEmail: result.mapping.senderEmail,
              senderDomain: result.mapping.senderDomain,
              senderPhone: result.mapping.senderPhone,
              ctaDomain: result.mapping.ctaDomain,
            },
          })

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    success: true,
                    entityId,
                    entityName: entity.name,
                    mapping: {
                      id: result.mapping.id,
                      senderEmail: result.mapping.senderEmail,
                      senderDomain: result.mapping.senderDomain,
                      senderPhone: result.mapping.senderPhone,
                      ctaDomain: result.mapping.ctaDomain,
                    },
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

    // ── Tool 11: remove_entity_mapping ───────────────────────────────────────
    server.registerTool(
      "remove_entity_mapping",
      {
        title: "Remove Entity Mapping",
        description:
          "Removes one sender email/domain/phone or CTA-domain mapping from an entity, exactly like the trash icon next to a mapping row in the admin UI. Use list_entity_mappings first to get the exact mappingId - this tool refuses to delete a mapping that doesn't belong to the entityId you pass, as a safety check against acting on the wrong entity. Requires a \"reasoning\" string.",
        inputSchema: {
          entityId: z.string().describe("The CiEntity id this mapping is expected to belong to"),
          mappingId: z.string().describe("The mapping id to remove (from list_entity_mappings)"),
          reasoning: z.string().min(1).describe("Why this mapping should be removed (e.g. sender no longer belongs here)"),
        },
      },
      async ({ entityId, mappingId, reasoning }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.MANAGE_MAPPINGS)
          await assertAutomationEnabled()

          const existing = await prisma.ciEntityMapping.findUnique({ where: { id: mappingId } })
          if (!existing) {
            throw new CiApiError(`Mapping ${mappingId} not found`, 404)
          }
          if (existing.entityId !== entityId) {
            throw new CiApiError(
              `Mapping ${mappingId} belongs to entity ${existing.entityId}, not ${entityId}. Refusing to remove - re-check with list_entity_mappings.`,
              400,
            )
          }

          const apiKeyId = extra.authInfo!.extra!.apiKeyId as string
          await enforceCiRateLimit(apiKeyId, "remove_entity_mapping")

          const result = await deleteEntityMapping(mappingId)
          if (!result.success) {
            throw new CiApiError(result.error || "Failed to remove mapping", 500)
          }

          await logCiApiAction({
            apiKeyId,
            action: "remove_entity_mapping",
            reasoning,
            targetType: "entity",
            entityId,
            beforeState: {
              mappingId: existing.id,
              senderEmail: existing.senderEmail,
              senderDomain: existing.senderDomain,
              senderPhone: existing.senderPhone,
              ctaDomain: existing.ctaDomain,
            },
          })

          return {
            content: [{ type: "text" as const, text: JSON.stringify({ success: true, entityId, mappingId }, null, 2) }],
          }
        } catch (error) {
          return toolError(error)
        }
      },
    )

    // ── Digest window helper ────────────────────────────────────────────────
    // Shared by tools 14-18. Defaults to the last 72 hours (covers the
    // longest Mon/Wed/Fri -> Fri/Mon gap) when no explicit window is passed.
    function resolveDigestWindow(fromDate?: string, toDate?: string) {
      const to = toDate ? new Date(toDate) : new Date()
      const from = fromDate ? new Date(fromDate) : new Date(to.getTime() - 72 * 60 * 60 * 1000)
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new CiApiError("fromDate/toDate must be valid ISO date strings", 400)
      }
      return { from, to }
    }

    const digestDateInputs = {
      fromDate: z.string().optional().describe("ISO date/time; window start. Defaults to 72 hours before toDate."),
      toDate: z.string().optional().describe("ISO date/time; window end. Defaults to now."),
    }

    // ── Tool 14: get_digest_inbox_pulse ─────────────────────────────────────
    server.registerTool(
      "get_digest_inbox_pulse",
      {
        title: "Get Digest Inbox Pulse",
        description:
          "Read-only, global (all clients combined) volume and email/SMS mix over a date window, for the Mon/Wed/Fri CI digest's opening \"inbox pulse\" section. Returns total email count, total SMS count, and the email/SMS split as percentages. Defaults to the last 72 hours if no fromDate/toDate given.",
        inputSchema: digestDateInputs,
      },
      async ({ fromDate, toDate }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DIGEST_READ)
          const { from, to } = resolveDigestWindow(fromDate, toDate)

          const [emailCount, smsCount] = await Promise.all([
            prisma.competitiveInsightCampaign.count({
              where: { isDeleted: false, dateReceived: { gte: from, lte: to } },
            }),
            prisma.smsQueue.count({
              where: { isDeleted: false, createdAt: { gte: from, lte: to } },
            }),
          ])

          const total = emailCount + smsCount

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    windowStart: from.toISOString(),
                    windowEnd: to.toISOString(),
                    totalEmails: emailCount,
                    totalSms: smsCount,
                    totalVolume: total,
                    emailPct: total > 0 ? Math.round((emailCount / total) * 1000) / 10 : 0,
                    smsPct: total > 0 ? Math.round((smsCount / total) * 1000) / 10 : 0,
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

    // ── Tool 15: get_digest_loudest_senders ─────────────────────────────────
    server.registerTool(
      "get_digest_loudest_senders",
      {
        title: "Get Digest Loudest Senders",
        description:
          "Read-only, global (all clients combined) leaderboard of the entities that sent the most email + SMS in a date window, for the digest's \"loudest senders\" section. Each result includes a directory link (/directory/<slug>) so the write-up can cite/verify the entity. Defaults to the last 72 hours and top 10 if not specified. Set party to \"republican\" or \"democrat\" to filter (omit for both).",
        inputSchema: {
          ...digestDateInputs,
          limit: z.number().int().min(1).max(50).default(10),
          party: z.enum(["republican", "democrat"]).optional().describe("Filter to one party; omit for all entities"),
        },
      },
      async ({ fromDate, toDate, limit, party }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DIGEST_READ)
          const { from, to } = resolveDigestWindow(fromDate, toDate)

          const [campaignCounts, smsCounts] = await Promise.all([
            prisma.competitiveInsightCampaign.groupBy({
              by: ["entityId"],
              where: { isDeleted: false, dateReceived: { gte: from, lte: to }, entityId: { not: null } },
              _count: { _all: true },
            }),
            prisma.smsQueue.groupBy({
              by: ["entityId"],
              where: { isDeleted: false, createdAt: { gte: from, lte: to }, entityId: { not: null } },
              _count: { _all: true },
            }),
          ])

          const byEntity = new Map<string, { emailCount: number; smsCount: number }>()
          for (const row of campaignCounts) {
            if (!row.entityId) continue
            byEntity.set(row.entityId, { emailCount: row._count._all, smsCount: 0 })
          }
          for (const row of smsCounts) {
            if (!row.entityId) continue
            const existing = byEntity.get(row.entityId) || { emailCount: 0, smsCount: 0 }
            existing.smsCount = row._count._all
            byEntity.set(row.entityId, existing)
          }

          const entityIds = Array.from(byEntity.keys())
          const entities = await prisma.ciEntity.findMany({
            where: { id: { in: entityIds }, ...(party ? { party } : {}) },
            select: { id: true, name: true, type: true, party: true, state: true },
          })

          const results = entities
            .map((e: { id: string; name: string; type: string; party: string | null; state: string | null }) => {
              const counts = byEntity.get(e.id)!
              return {
                entityId: e.id,
                entityName: e.name,
                type: e.type,
                party: e.party,
                state: e.state,
                emailCount: counts.emailCount,
                smsCount: counts.smsCount,
                totalVolume: counts.emailCount + counts.smsCount,
                directoryUrl: `/directory/${nameToSlug(e.name)}`,
              }
            })
            .sort((a: { totalVolume: number }, b: { totalVolume: number }) => b.totalVolume - a.totalVolume)
            .slice(0, limit)

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { windowStart: from.toISOString(), windowEnd: to.toISOString(), senders: results },
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

    // ── Tool 16: get_digest_repeating_content ───────────────────────────────
    server.registerTool(
      "get_digest_repeating_content",
      {
        title: "Get Digest Repeating Content",
        description:
          "Read-only, global (all clients combined) list of the most-repeated email subject lines and SMS copy in a date window, for the digest's \"what's repeating\" section. Subjects are the already-sanitized subject field (merge tags like {{first_name}} are replaced with a placeholder, never raw). Only returns items sent 2+ times. Defaults to the last 72 hours and top 10 each.",
        inputSchema: {
          ...digestDateInputs,
          limit: z.number().int().min(1).max(25).default(10),
        },
      },
      async ({ fromDate, toDate, limit }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DIGEST_READ)
          const { from, to } = resolveDigestWindow(fromDate, toDate)

          const [subjectGroups, smsGroups] = await Promise.all([
            prisma.competitiveInsightCampaign.groupBy({
              by: ["subject"],
              where: { isDeleted: false, dateReceived: { gte: from, lte: to } },
              _count: { _all: true },
            }),
            prisma.smsQueue.groupBy({
              by: ["message"],
              where: { isDeleted: false, createdAt: { gte: from, lte: to }, message: { not: null } },
              _count: { _all: true },
            }),
          ])

          const topSubjects = subjectGroups
            .filter((g: { subject: string; _count: { _all: number } }) => g._count._all >= 2 && g.subject)
            .sort(
              (a: { _count: { _all: number } }, b: { _count: { _all: number } }) => b._count._all - a._count._all,
            )
            .slice(0, limit)
            .map((g: { subject: string; _count: { _all: number } }) => ({ subject: g.subject, count: g._count._all }))

          const topSmsCopy = smsGroups
            .filter((g: { message: string | null; _count: { _all: number } }) => g._count._all >= 2 && g.message)
            .sort(
              (a: { _count: { _all: number } }, b: { _count: { _all: number } }) => b._count._all - a._count._all,
            )
            .slice(0, limit)
            .map((g: { message: string | null; _count: { _all: number } }) => ({
              message: g.message,
              count: g._count._all,
            }))

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { windowStart: from.toISOString(), windowEnd: to.toISOString(), topSubjects, topSmsCopy },
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

    // ── Tool 17: get_digest_patterns_and_types ──────────────────────────────
    server.registerTool(
      "get_digest_patterns_and_types",
      {
        title: "Get Digest Patterns And Types",
        description:
          "Read-only, global (all clients combined) breakdown of subject-line patterns (all-caps, urgency, dollar signs, questions, emoji, etc.) and message types (urgency/deadline, attack, match offer, survey, petition, etc.) in a date window, for the digest's \"patterns and types\" section. Counts come from the same classification already stored on each campaign at ingest. Defaults to the last 72 hours.",
        inputSchema: digestDateInputs,
      },
      async ({ fromDate, toDate }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DIGEST_READ)
          const { from, to } = resolveDigestWindow(fromDate, toDate)

          const campaigns = await prisma.competitiveInsightCampaign.findMany({
            where: { isDeleted: false, dateReceived: { gte: from, lte: to } },
            select: { subjectPatterns: true, messageTypes: true },
          })

          const patternCounts = new Map<string, number>()
          const typeCounts = new Map<string, number>()
          for (const c of campaigns) {
            for (const p of c.subjectPatterns || []) {
              patternCounts.set(p, (patternCounts.get(p) || 0) + 1)
            }
            for (const t of c.messageTypes || []) {
              typeCounts.set(t, (typeCounts.get(t) || 0) + 1)
            }
          }

          const total = campaigns.length
          const toResult = (map: Map<string, number>, labels: Record<string, { label: string } | string>) =>
            Array.from(map.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => ({
                key,
                label: typeof labels[key] === "string" ? (labels[key] as string) : (labels[key] as { label: string } | undefined)?.label || key,
                count,
                pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
              }))

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    windowStart: from.toISOString(),
                    windowEnd: to.toISOString(),
                    totalEmails: total,
                    subjectPatterns: toResult(patternCounts, SUBJECT_PATTERNS),
                    messageTypes: toResult(typeCounts, MESSAGE_TYPE_LABELS),
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

    // ── Tool 18: get_digest_dem_footnote ─────────────────────────────────────
    server.registerTool(
      "get_digest_dem_footnote",
      {
        title: "Get Digest Democrat Footnote",
        description:
          "Read-only, global list of the loudest Democrat-side entities in a date window, for the digest's optional thin \"Dem-watch\" footnote. Same shape as get_digest_loudest_senders but pre-filtered to party=democrat. Defaults to the last 72 hours and top 5.",
        inputSchema: {
          ...digestDateInputs,
          limit: z.number().int().min(1).max(25).default(5),
        },
      },
      async ({ fromDate, toDate, limit }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.DIGEST_READ)
          const { from, to } = resolveDigestWindow(fromDate, toDate)

          const [campaignCounts, smsCounts] = await Promise.all([
            prisma.competitiveInsightCampaign.groupBy({
              by: ["entityId"],
              where: { isDeleted: false, dateReceived: { gte: from, lte: to }, entityId: { not: null } },
              _count: { _all: true },
            }),
            prisma.smsQueue.groupBy({
              by: ["entityId"],
              where: { isDeleted: false, createdAt: { gte: from, lte: to }, entityId: { not: null } },
              _count: { _all: true },
            }),
          ])

          const byEntity = new Map<string, { emailCount: number; smsCount: number }>()
          for (const row of campaignCounts) {
            if (!row.entityId) continue
            byEntity.set(row.entityId, { emailCount: row._count._all, smsCount: 0 })
          }
          for (const row of smsCounts) {
            if (!row.entityId) continue
            const existing = byEntity.get(row.entityId) || { emailCount: 0, smsCount: 0 }
            existing.smsCount = row._count._all
            byEntity.set(row.entityId, existing)
          }

          const entityIds = Array.from(byEntity.keys())
          const entities = await prisma.ciEntity.findMany({
            where: { id: { in: entityIds }, party: "democrat" },
            select: { id: true, name: true, type: true, state: true },
          })

          const results = entities
            .map((e: { id: string; name: string; type: string; state: string | null }) => {
              const counts = byEntity.get(e.id)!
              return {
                entityId: e.id,
                entityName: e.name,
                type: e.type,
                state: e.state,
                emailCount: counts.emailCount,
                smsCount: counts.smsCount,
                totalVolume: counts.emailCount + counts.smsCount,
                directoryUrl: `/directory/${nameToSlug(e.name)}`,
              }
            })
            .sort((a: { totalVolume: number }, b: { totalVolume: number }) => b.totalVolume - a.totalVolume)
            .slice(0, limit)

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  { windowStart: from.toISOString(), windowEnd: to.toISOString(), senders: results },
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

    // ── Tool 22: list_accounts ────────────────────────────────────────────
    server.registerTool(
      "list_accounts",
      {
        title: "List Client Accounts",
        description:
          "Lists rip-tool client accounts with their user contacts and Stripe payment status - name, slug, active flag, subscription plan/status, trial state, every user (name, email, role, lastActive) on the account, and live Stripe billing details (amount, currency, billing interval, current period end, cancel-at-period-end, past-due/latest invoice status) when the client has a Stripe subscription. Gated by its own scope (ci:accounts_read), separate from ci:read, since this exposes contact and billing data across every client rather than just CI workflow data.",
        inputSchema: {
          search: z.string().optional().describe("Case-insensitive substring match on client name or slug"),
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ search, limit }, extra) => {
        try {
          requireCiScope(extra.authInfo?.scopes, CI_SCOPES.ACCOUNTS_READ)

          const clients = await prisma.client.findMany({
            where: search
              ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { slug: { contains: search, mode: "insensitive" } }] }
              : undefined,
            orderBy: { name: "asc" },
            take: limit,
            select: {
              id: true,
              name: true,
              slug: true,
              active: true,
              subscriptionPlan: true,
              subscriptionStatus: true,
              hasCompetitiveInsights: true,
              cancelAtPeriodEnd: true,
              trialExpiresAt: true,
              subscriptionRenewDate: true,
              createdAt: true,
              stripeCustomerId: true,
              stripeSubscriptionId: true,
              users: {
                select: { id: true, firstName: true, lastName: true, email: true, role: true, lastActive: true },
                orderBy: { createdAt: "asc" },
              },
            },
          })

          const { stripe } = await import("@/lib/stripe")

          const results = await Promise.all(
            clients.map(async (c) => {
              let payment: Record<string, unknown> | null = null

              if (c.stripeSubscriptionId) {
                try {
                  const sub = await stripe.subscriptions.retrieve(c.stripeSubscriptionId, {
                    expand: ["items.data.price", "latest_invoice"],
                  })
                  const item = sub.items.data[0]
                  const latestInvoice = sub.latest_invoice
                  payment = {
                    stripeStatus: sub.status, // "active", "past_due", "canceled", "trialing", etc.
                    amountCents: item?.price?.unit_amount ?? null,
                    currency: item?.price?.currency ?? null,
                    billingInterval: item?.price?.recurring?.interval ?? null,
                    currentPeriodEnd: sub.current_period_end
                      ? new Date(sub.current_period_end * 1000).toISOString()
                      : null,
                    cancelAtPeriodEnd: sub.cancel_at_period_end,
                    latestInvoiceStatus:
                      latestInvoice && typeof latestInvoice === "object" ? latestInvoice.status : null,
                  }
                } catch (err) {
                  console.error("[v0] list_accounts: failed to fetch Stripe subscription for", c.id, err)
                  payment = { error: "Failed to fetch Stripe subscription details" }
                }
              } else if (c.stripeCustomerId) {
                payment = { stripeStatus: "no_active_subscription" }
              }

              return {
                id: c.id,
                name: c.name,
                slug: c.slug,
                active: c.active,
                subscriptionPlan: c.subscriptionPlan,
                subscriptionStatus: c.subscriptionStatus,
                hasCompetitiveInsights: c.hasCompetitiveInsights,
                cancelAtPeriodEnd: c.cancelAtPeriodEnd,
                trialExpiresAt: c.trialExpiresAt,
                subscriptionRenewDate: c.subscriptionRenewDate,
                createdAt: c.createdAt,
                stripeCustomerId: c.stripeCustomerId,
                stripeSubscriptionId: c.stripeSubscriptionId,
                payment,
                users: c.users.map((u) => ({
                  id: u.id,
                  name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null,
                  email: u.email,
                  role: u.role,
                  lastActive: u.lastActive,
                })),
              }
            }),
          )

          return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] }
        } catch (error) {
          return toolError(error)
        }
      },
    )
  },
  {
    serverInfo: { name: "rip-tool-ci-assignment", version: "1.0.0" },
  },
  // This route file lives at a single fixed path (app/api/mcp/ci-assignment/route.ts),
  // not a [transport] catch-all, so the handler must match the streamable HTTP
  // endpoint to this exact pathname rather than deriving "<basePath>/mcp" from it.
  { streamableHttpEndpoint: "/api/mcp/ci-assignment", disableSse: true },
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
