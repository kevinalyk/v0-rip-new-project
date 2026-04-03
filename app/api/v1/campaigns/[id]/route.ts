/**
 * GET /api/v1/campaigns/[id]
 * Get a single campaign by ID
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeCampaignWithEntity } from "@/lib/api-redact";
import type { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // Fetch campaign
    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id },
      include: {
        entity: {
          include: {
            tags: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "Campaign not found",
        },
        { status: 404 }
      );
    }

    // Check if campaign is hidden or deleted
    if (campaign.isDeleted || campaign.isHidden) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "Campaign not found",
        },
        { status: 404 }
      );
    }

    // Check client access
    if (authContext.clientId && campaign.clientId !== authContext.clientId) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "You do not have access to this campaign",
        },
        { status: 403 }
      );
    }

    // Sanitize and return
    const sanitized = sanitizeCampaignWithEntity(campaign);

    return NextResponse.json(
      {
        data: sanitized,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error fetching campaign:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch campaign",
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withApiAuth(request, (req, ctx) => handler(req, ctx, { params }));
}
