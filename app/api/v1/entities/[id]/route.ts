/**
 * GET /api/v1/entities/[id]
 * Get a single entity by ID with campaign and SMS counts
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeEntity } from "@/lib/api-redact";
import type { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // Fetch entity with counts
    const entity = await prisma.ciEntity.findUnique({
      where: { id },
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
    });

    if (!entity) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "Entity not found",
        },
        { status: 404 }
      );
    }

    // Sanitize and return with counts
    const sanitized = {
      ...sanitizeEntity(entity),
      _count: {
        campaigns: entity._count.campaigns,
        smsMessages: entity._count.smsMessages,
      },
    };

    return NextResponse.json(
      {
        data: sanitized,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error fetching entity:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch entity",
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
