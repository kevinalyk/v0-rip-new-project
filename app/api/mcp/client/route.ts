/**
 * Client-facing, READ-ONLY MCP server for the shared competitive-intelligence
 * feed (seed emails, SMS and entities). Deliberately separate from the internal
 * CI Assignment MCP: it registers exactly four read tools and nothing that can
 * write, so there is nothing to scope away.
 *
 *   1. search_content  keyword search with totals and per-entity counts
 *   2. get_message     one message (short preview only, never the full body)
 *   3. list_entities   browse/filter entities
 *   4. get_entity      one entity with message counts
 *
 * Every call re-checks the client's plan, trial, subscription status and terms
 * acceptance, enforces a per-minute throttle and a rolling monthly result
 * quota, caps result depth, and writes an audit row (see lib/client-mcp.ts).
 */

import { createMcpHandler, withMcpAuth } from "mcp-handler"
import { z } from "zod"
import {
  CLIENT_MCP_LIMITS,
  ClientMcpError,
  assertClientMcpAccess,
  logClientMcpUsage,
  verifyClientMcpToken,
} from "@/lib/client-mcp"
import { CiApiError } from "@/lib/ci-api-auth"
import { getEntityBySlug, getMessage, listEntities, searchContent } from "@/lib/ci-content-search"

export const maxDuration = 60

type ToolExtra = { authInfo?: { extra?: Record<string, unknown> } }

function keyFrom(extra: ToolExtra): { id: string; clientId: string } {
  const info = extra.authInfo?.extra
  const id = info?.apiKeyId as string | undefined
  const clientId = info?.clientId as string | undefined
  if (!id || !clientId) throw new ClientMcpError("Unauthorized", 401)
  return { id, clientId }
}

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] }
}

function errorResult(error: unknown) {
  const known = error instanceof ClientMcpError || error instanceof CiApiError
  if (!known) console.error("[v0] Client MCP tool error:", error)
  const message = known ? (error as Error).message : "An unexpected error occurred"
  return { content: [{ type: "text" as const, text: message }], isError: true }
}

async function guarded<T>(
  extra: ToolExtra,
  tool: string,
  params: unknown,
  run: () => Promise<T>,
  measure: (result: T) => { count: number; ids?: string[] },
) {
  const key = keyFrom(extra)
  try {
    await assertClientMcpAccess(key, tool)
    const result = await run()
    const { count, ids } = measure(result)
    await logClientMcpUsage({ key, tool, params, resultCount: count, messageIds: ids, status: "ok" })
    return textResult(result)
  } catch (error) {
    if (!(error instanceof ClientMcpError)) {
      await logClientMcpUsage({ key, tool, params, status: "error" })
    }
    return errorResult(error)
  }
}

function assertDepth(page: number, limit: number) {
  if (page * limit > CLIENT_MCP_LIMITS.MAX_RESULT_DEPTH) {
    throw new ClientMcpError(
      `Result depth is capped at ${CLIENT_MCP_LIMITS.MAX_RESULT_DEPTH} per query. Narrow the query with dates, party or a more specific keyword instead of paging deeper.`,
      400,
    )
  }
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "search_content",
      {
        title: "Search Content",
        description:
          "Read-only keyword search over the competitive-intelligence feed of political emails and SMS. Returns, per match: message id, sender entity name and slug, party, state, email or SMS, received time, subject or SMS text, from address or short code, and a link. Also returns total counts and counts grouped by entity, so you can rank senders without paging. Page size and depth are capped, so use the grouped counts and narrower date ranges for broad questions. Data is for your own research and projects only - do not bulk-collect or store it.",
        inputSchema: {
          query: z.string().min(1).max(200).describe('Space-separated keywords, e.g. "Musk Elon"'),
          match: z.enum(["any", "all"]).default("any").describe("any = a message may contain any keyword; all = must contain every keyword"),
          startDate: z.string().optional().describe("ISO date/time, inclusive"),
          endDate: z.string().optional().describe("ISO date/time, inclusive"),
          type: z.enum(["email", "sms", "both"]).default("both"),
          party: z.enum(["R", "D"]).optional(),
          limit: z.number().int().min(1).max(CLIENT_MCP_LIMITS.MAX_PAGE_SIZE).default(10),
          page: z.number().int().min(1).max(20).default(1),
          entityLimit: z.number().int().min(1).max(25).default(15).describe("How many entities to include in the grouped counts"),
        },
      },
      async (args, extra) =>
        guarded(
          extra,
          "search_content",
          args,
          async () => {
            assertDepth(args.page, args.limit)
            return searchContent(args)
          },
          (r) => ({
            count: r.results.length + r.byEntity.length,
            ids: r.results.map((m: { id: string }) => m.id),
          }),
        ),
    )

    server.registerTool(
      "get_message",
      {
        title: "Get Message",
        description:
          "Fetches one email or SMS by id (from search_content). Emails return subject, sender, a short text preview and a link to the full message in the app; SMS returns the full text.",
        inputSchema: {
          kind: z.enum(["email", "sms"]),
          id: z.string().min(1).max(100),
        },
      },
      async (args, extra) =>
        guarded(
          extra,
          "get_message",
          args,
          () => getMessage(args.kind, args.id),
          (r) => ({ count: 1, ids: [r.id] }),
        ),
    )

    server.registerTool(
      "list_entities",
      {
        title: "List Entities",
        description: "Lists and filters senders (politicians, PACs, organizations, media outlets, retailers) in the directory. Returns name, slug, type, party, state and office.",
        inputSchema: {
          query: z.string().max(100).optional().describe("Name contains"),
          party: z.enum(["R", "D"]).optional(),
          state: z.string().max(2).optional().describe("Two-letter state code"),
          type: z.enum(["politician", "pac", "organization", "media", "retail"]).optional(),
          limit: z.number().int().min(1).max(CLIENT_MCP_LIMITS.MAX_ENTITY_PAGE_SIZE).default(25),
          page: z.number().int().min(1).max(20).default(1),
        },
      },
      async (args, extra) =>
        guarded(
          extra,
          "list_entities",
          args,
          async () => {
            assertDepth(args.page, args.limit)
            return listEntities(args)
          },
          (r) => ({ count: r.results.length }),
        ),
    )

    server.registerTool(
      "get_entity",
      {
        title: "Get Entity",
        description: "Fetches one entity by slug (from search_content or list_entities) with profile details and email/SMS message counts.",
        inputSchema: {
          slug: z.string().min(1).max(150),
        },
      },
      async (args, extra) =>
        guarded(
          extra,
          "get_entity",
          args,
          () => getEntityBySlug(args.slug),
          () => ({ count: 1 }),
        ),
    )
  },
  { serverInfo: { name: "rip-tool-client", version: "1.0.0" } },
  { streamableHttpEndpoint: "/api/mcp/client", disableSse: true },
)

const authHandler = withMcpAuth(
  handler,
  async (_req, bearerToken) => {
    const verified = await verifyClientMcpToken(bearerToken)
    if (!verified) return undefined
    return {
      token: bearerToken || "",
      clientId: verified.clientId,
      scopes: ["client_mcp:read"],
      extra: { apiKeyId: verified.id, clientId: verified.clientId },
    }
  },
  { required: true },
)

export { authHandler as GET, authHandler as POST, authHandler as DELETE }
