/**
 * GET /api/v1/sms/[id]
 * Get a single SMS message by ID
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withApiAuth, hasScope } from "@/lib/api-auth";
import { sanitizeSmsWithEntity } from "@/lib/api-redact";
import type { ApiAuthContext } from "@/lib/api-auth";

async function handler(
  request: NextRequest,
  authContext: ApiAuthContext,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;

    // Fetch SMS message
    const sms = await prisma.smsQueue.findUnique({
      where: { id },
      include: {
        entity: {
          include: {
            tags: true,
          },
        },
      },
    });

    if (!sms) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "SMS message not found",
        },
        { status: 404 }
      );
    }

    // Check if message is hidden or deleted
    if (sms.isDeleted || sms.isHidden) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "SMS message not found",
        },
        { status: 404 }
      );
    }

    // Sanitize and return
    const sanitized = sanitizeSmsWithEntity(sms);

    return NextResponse.json(
      {
        data: sanitized,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error fetching SMS message:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch SMS message",
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
