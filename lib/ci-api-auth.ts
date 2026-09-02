/**
 * Auth, rate limiting, and the global kill switch for the Claude-facing CI
 * Assignment MCP server (app/api/mcp/ci-assignment/route.ts).
 *
 * Deliberately separate from lib/api-auth.ts (the public read-only v1 API):
 * this surface performs WRITES (assign messages, create entities, update
 * donation identifiers) on behalf of an autonomous agent, so every call gets
 * an extra layer of checks beyond plain key validation - a global kill
 * switch, scope enforcement, and DB-backed rate limits tied to the audit log
 * itself (so limits survive cold starts / multiple server instances).
 *
 * Reuses the existing ApiKey table/model (see prisma/schema.prisma, and key
 * creation/hash helpers in lib/api-auth.ts) rather than a second credential
 * system. CI-assignment keys are distinguished purely by scope strings:
 *   - "ci:read"           list_unassigned_messages, list_entities, list_delete_eligible_messages
 *   - "ci:assign"         assign_messages_to_entity
 *   - "ci:create_entity"  create_entity
 *   - "ci:update_entity"  update_entity_donation_identifiers
 *   - "ci:delete"         delete_messages
 */

import { createHash, randomBytes } from "crypto"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

/**
 * Gate for every /api/admin/ci-automation/* route below. Deliberately
 * requires super_admin specifically (not the broader isAdmin/isSystemAdmin
 * check used elsewhere) since this surface manages credentials that can
 * autonomously write to donor/contact data - only the highest privilege
 * tier should be able to mint keys, flip the kill switch, or undo actions.
 */
export async function requireSuperAdmin(request: Request): Promise<{ id: string; role: string } | null> {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") return null
  return { id: user.id, role: user.role }
}

const CI_API_KEY_PREFIX = "rip_ci_"

/**
 * Generates a new raw CI-assignment API key (shown once), its hash for
 * storage, and its prefix for UI display. Separate from
 * lib/api-auth.ts's generateApiKey only in the "rip_ci_" prefix, so keys
 * for this surface are visually distinguishable from the public v1 API keys
 * in the shared ApiKey table.
 */
export function generateCiApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `${CI_API_KEY_PREFIX}${randomBytes(24).toString("hex")}`
  const keyHash = createHash("sha256").update(key).digest("hex")
  const keyPrefix = key.slice(0, 12)
  return { key, keyHash, keyPrefix }
}

export const CI_SCOPES = {
  READ: "ci:read",
  ASSIGN: "ci:assign",
  CREATE_ENTITY: "ci:create_entity",
  UPDATE_ENTITY: "ci:update_entity",
  DELETE: "ci:delete",
} as const

export type CiScope = (typeof CI_SCOPES)[keyof typeof CI_SCOPES]

export const CI_ASSIGNMENT_ALL_SCOPES: CiScope[] = [
  CI_SCOPES.READ,
  CI_SCOPES.ASSIGN,
  CI_SCOPES.CREATE_ENTITY,
  CI_SCOPES.UPDATE_ENTITY,
  CI_SCOPES.DELETE,
]

// Guardrail caps - deliberately conservative. Raise only with a clear reason;
// these exist specifically to bound the damage from a bad prompt, a leaked
// key, or a Claude mistake before a human ever looks at the audit log.
export const CI_API_LIMITS = {
  MAX_BATCH_SIZE: 100, // max message IDs per assign_messages_to_entity call
  MAX_ASSIGNMENTS_PER_HOUR: 500,
  MAX_NEW_ENTITIES_PER_DAY: 20,
  MAX_ENTITY_UPDATES_PER_DAY: 50,
  MAX_DELETES_PER_HOUR: 300, // max message IDs soft-deleted per hour via delete_messages
}

export class CiApiError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

interface VerifiedCiApiKey {
  id: string
  name: string
  scopes: string[]
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}

/**
 * Verifies the bearer token against the ApiKey table and checks it hasn't
 * been revoked/deactivated/expired. Updates lastUsedAt/requestCount on
 * success. This is the `verifyToken` callback passed to `withMcpAuth` in the
 * route handler - it runs once per HTTP request, before any specific tool is
 * known, so it deliberately does NOT check scope (that varies per tool - see
 * `requireCiScope` below) or the kill switch (write-only - see
 * `assertAutomationEnabled` below). Returns null on any failure so
 * `withMcpAuth` can translate it into a 401.
 */
export async function verifyBearerToken(authHeader: string | null): Promise<VerifiedCiApiKey | null> {
  const token = extractBearerToken(authHeader)
  if (!token) return null

  const keyHash = hashApiKey(token)
  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash } })

  if (!apiKey) return null
  if (apiKey.revokedAt) return null
  if (!apiKey.isActive) return null
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null

  const scopes = Array.isArray(apiKey.scopes) ? (apiKey.scopes as string[]) : []

  // Best-effort - never block the request over a bookkeeping update.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date(), requestCount: { increment: 1 } } })
    .catch((err: unknown) => console.error("[v0] Failed to update ApiKey lastUsedAt/requestCount:", err))

  return { id: apiKey.id, name: apiKey.name, scopes }
}

/**
 * Confirms the authenticated key carries the specific scope a tool
 * requires. Call this as the first line of every tool handler, using the
 * scopes from `extra.authInfo` supplied by `withMcpAuth`.
 */
export function requireCiScope(scopes: string[] | undefined, requiredScope: CiScope): void {
  if (!scopes || (!scopes.includes(requiredScope) && !scopes.includes("*"))) {
    throw new CiApiError(`This API key does not have the required scope: ${requiredScope}`, 403)
  }
}

/**
 * Global kill switch - checked only by WRITE tools (assign / create_entity /
 * update_entity_donation_identifiers), never by the read-only list tools, so
 * flipping automation off stops Claude from making changes without also
 * cutting off its ability to browse current state. Toggled from the admin
 * UI; takes effect immediately since it is read fresh on every write call.
 */
export async function assertAutomationEnabled(): Promise<void> {
  const settings = await prisma.automationSetting.findFirst()
  if (settings && settings.ciAssignmentEnabled === false) {
    throw new CiApiError(
      "The CI assignment automation is currently disabled by an administrator (kill switch is off).",
      503,
    )
  }
}

/**
 * DB-backed rate limiting: counts recent CiApiActionLog rows for this key
 * rather than an in-memory counter, so limits hold even across serverless
 * cold starts / multiple instances. Throws CiApiError(429) when over budget.
 */
export async function enforceCiRateLimit(
  apiKeyId: string,
  action: "assign_messages" | "create_entity" | "update_entity_identifiers" | "delete_messages",
): Promise<void> {
  const now = Date.now()

  if (action === "assign_messages") {
    const windowStart = new Date(now - 60 * 60 * 1000)
    const count = await prisma.ciApiActionLog.count({
      where: { apiKeyId, action: "assign_messages", createdAt: { gte: windowStart } },
    })
    if (count >= CI_API_LIMITS.MAX_ASSIGNMENTS_PER_HOUR) {
      throw new CiApiError(
        `Rate limit exceeded: max ${CI_API_LIMITS.MAX_ASSIGNMENTS_PER_HOUR} assignment actions per hour`,
        429,
      )
    }
  }

  if (action === "create_entity") {
    const windowStart = new Date(now - 24 * 60 * 60 * 1000)
    const count = await prisma.ciApiActionLog.count({
      where: { apiKeyId, action: "create_entity", createdAt: { gte: windowStart } },
    })
    if (count >= CI_API_LIMITS.MAX_NEW_ENTITIES_PER_DAY) {
      throw new CiApiError(
        `Rate limit exceeded: max ${CI_API_LIMITS.MAX_NEW_ENTITIES_PER_DAY} new entities per day`,
        429,
      )
    }
  }

  if (action === "update_entity_identifiers") {
    const windowStart = new Date(now - 24 * 60 * 60 * 1000)
    const count = await prisma.ciApiActionLog.count({
      where: { apiKeyId, action: "update_entity_identifiers", createdAt: { gte: windowStart } },
    })
    if (count >= CI_API_LIMITS.MAX_ENTITY_UPDATES_PER_DAY) {
      throw new CiApiError(
        `Rate limit exceeded: max ${CI_API_LIMITS.MAX_ENTITY_UPDATES_PER_DAY} entity identifier updates per day`,
        429,
      )
    }
  }

  if (action === "delete_messages") {
    const windowStart = new Date(now - 60 * 60 * 1000)
    const rows = await prisma.ciApiActionLog.findMany({
      where: { apiKeyId, action: "delete_messages", createdAt: { gte: windowStart } },
      select: { targetIds: true },
    })
    const deletedCount = rows.reduce(
      (sum: number, row: { targetIds: unknown }) => sum + (Array.isArray(row.targetIds) ? row.targetIds.length : 0),
      0,
    )
    if (deletedCount >= CI_API_LIMITS.MAX_DELETES_PER_HOUR) {
      throw new CiApiError(`Rate limit exceeded: max ${CI_API_LIMITS.MAX_DELETES_PER_HOUR} message deletions per hour`, 429)
    }
  }
}

/**
 * Writes one row to CiApiActionLog. Call this after every successful write
 * tool call (assign / create / update). Never throws - a logging failure
 * must not be surfaced as if the underlying action failed, but it is logged
 * loudly to the server console since losing audit rows is serious.
 */
export async function logCiApiAction(params: {
  apiKeyId: string
  action: "assign_messages" | "create_entity" | "update_entity_identifiers" | "delete_messages"
  reasoning?: string
  targetType?: "sms" | "campaign" | "entity"
  targetIds?: string[]
  entityId?: string
  beforeState?: unknown
  afterState?: unknown
  requestIp?: string | null
}): Promise<void> {
  try {
    await prisma.ciApiActionLog.create({
      data: {
        apiKeyId: params.apiKeyId,
        action: params.action,
        reasoning: params.reasoning,
        targetType: params.targetType,
        targetIds: params.targetIds ?? undefined,
        entityId: params.entityId,
        beforeState: params.beforeState as never,
        afterState: params.afterState as never,
        requestIp: params.requestIp ?? undefined,
      },
    })
  } catch (err) {
    console.error("[v0] CRITICAL: failed to write CiApiActionLog row for action", params.action, err)
  }
}
