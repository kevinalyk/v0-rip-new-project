/**
 * GET /api/admin/api-keys
 * List all API keys (admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // Check admin access
    const isAdminUser = await isAdmin(request);
    if (!isAdminUser) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Only admins can list API keys",
        },
        { status: 403 }
      );
    }

    // Fetch all API keys
    const apiKeys = await prisma.apiKey.findMany({
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        scopes: true,
        rateLimit: true,
        clientId: true,
        isActive: true,
        expiresAt: true,
        lastUsedAt: true,
        requestCount: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      {
        data: apiKeys,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error fetching API keys:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to fetch API keys",
      },
      { status: 500 }
    );
  }
}
