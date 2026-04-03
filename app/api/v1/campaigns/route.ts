/**
 * GET /api/v1/campaigns
 * List all public campaigns (paginated)
 * Query parameters:
 *   - limit: number (default: 20, max: 100)
 *   - offset: number (default: 0)
 *   - entityId: string (optional, filter by entity)
 *   - senderEmail: string (optional, filter by sender email)
 *   - from: ISO date string (optional, filter by date range start)
 *   - to: ISO date string (optional, filter by date range end)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeCampaign, sanitizeCampaignWithEntity } from "@/lib/api-redact";
import { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext
): Promise<Response> {
  try {
    // Check required scope
    if (!hasScope(authContext, "campaigns:read")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "API key does not have campaigns:read scope",
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const entityId = searchParams.get("entityId");
    const senderEmail = searchParams.get("senderEmail");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build where clause
    const where: any = {
      isDeleted: false,
      isHidden: false,
    };

    if (entityId) {
      where.entityId = entityId;
    }

    if (senderEmail) {
      where.senderEmail = {
        contains: senderEmail,
        mode: "insensitive",
      };
    }

    if (from || to) {
      where.dateReceived = {};
      if (from) {
        where.dateReceived.gte = new Date(from);
      }
      if (to) {
        where.dateReceived.lte = new Date(to);
      }
    }

    // If API key is restricted to a specific client, filter by that
    if (authContext.clientId) {
      where.clientId = authContext.clientId;
    }

    // Fetch campaigns with their entities
    const [campaigns, total] = await Promise.all([
      prisma.competitiveInsightCampaign.findMany({
        where,
        include: {
          entity: {
            include: {
              tags: true,
            },
          },
        },
        orderBy: {
          dateReceived: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.competitiveInsightCampaign.count({ where }),
    ]);

    // Sanitize the data
    const sanitizedCampaigns = campaigns.map((campaign) =>
      sanitizeCampaignWithEntity(campaign)
    );

    return NextResponse.json(
      {
        data: sanitizedCampaigns,
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
    console.error("[v0] Error fetching campaigns:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch campaigns",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withApiAuth(request, handler);
}
