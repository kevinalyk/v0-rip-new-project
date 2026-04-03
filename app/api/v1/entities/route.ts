/**
 * GET /api/v1/entities
 * List all public entities (paginated)
 * Query parameters:
 *   - limit: number (default: 20, max: 100)
 *   - offset: number (default: 0)
 *   - type: string (optional, filter by entity type: "politician", "pac", "organization")
 *   - party: string (optional, filter by party: "republican", "democrat", "independent")
 *   - state: string (optional, filter by state abbreviation)
 *   - search: string (optional, search by name)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeEntity } from "@/lib/api-redact";
import type { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext
): Promise<Response> {
  try {
    // Check required scope
    if (!hasScope(authContext, "entities:read")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "API key does not have entities:read scope",
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const type = searchParams.get("type");
    const party = searchParams.get("party");
    const state = searchParams.get("state");
    const search = searchParams.get("search");

    // Build where clause
    const where: any = {};

    if (type) {
      where.type = type;
    }

    if (party) {
      where.party = party;
    }

    if (state) {
      where.state = state;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: "insensitive",
      };
    }

    // Fetch entities with their tags
    const [entities, total] = await Promise.all([
      prisma.ciEntity.findMany({
        where,
        include: {
          tags: true,
          _count: {
            select: {
              campaigns: {
                where: {
                  isDeleted: false,
                  isHidden: false,
                },
              },
              smsMessages: {
                where: {
                  isDeleted: false,
                  isHidden: false,
                },
              },
            },
          },
        },
        orderBy: {
          name: "asc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.ciEntity.count({ where }),
    ]);

    // Sanitize the data and add counts
    const sanitizedEntities = entities.map((entity) => ({
      ...sanitizeEntity(entity),
      _count: {
        campaigns: entity._count.campaigns,
        smsMessages: entity._count.smsMessages,
      },
    }));

    return NextResponse.json(
      {
        data: sanitizedEntities,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + limit < total,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error fetching entities:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch entities",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withApiAuth(request, handler);
}
