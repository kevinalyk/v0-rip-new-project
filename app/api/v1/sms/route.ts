/**
 * GET /api/v1/sms
 * List all public SMS messages (paginated)
 * Query parameters:
 *   - limit: number (default: 20, max: 100)
 *   - offset: number (default: 0)
 *   - entityId: string (optional, filter by entity)
 *   - phoneNumber: string (optional, filter by sender phone number)
 *   - from: ISO date string (optional, filter by date range start)
 *   - to: ISO date string (optional, filter by date range end)
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeSmsWithEntity } from "@/lib/api-redact";
import type { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext
): Promise<Response> {
  try {
    // Check required scope
    if (!hasScope(authContext, "sms:read")) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "API key does not have sms:read scope",
        },
        { status: 403 }
      );
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const offset = parseInt(searchParams.get("offset") || "0");
    const entityId = searchParams.get("entityId");
    const phoneNumber = searchParams.get("phoneNumber");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    // Build where clause
    const where: any = {
      isDeleted: false,
      isHidden: false,
      processed: true,
    };

    if (entityId) {
      where.entityId = entityId;
    }

    if (phoneNumber) {
      where.phoneNumber = phoneNumber;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) {
        where.createdAt.gte = new Date(from);
      }
      if (to) {
        where.createdAt.lte = new Date(to);
      }
    }

    // Fetch SMS messages with their entities
    const [messages, total] = await Promise.all([
      prisma.smsQueue.findMany({
        where,
        include: {
          entity: {
            include: {
              tags: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: limit,
        skip: offset,
      }),
      prisma.smsQueue.count({ where }),
    ]);

    // Sanitize the data
    const sanitizedMessages = messages.map((sms) =>
      sanitizeSmsWithEntity(sms)
    );

    return NextResponse.json(
      {
        data: sanitizedMessages,
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
    console.error("[v0] Error fetching SMS messages:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch SMS messages",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return withApiAuth(request, handler);
}
