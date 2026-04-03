/**
 * POST /api/admin/api-keys/[id]/revoke
 * Revoke an API key
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getAuthenticatedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check admin access
    const isAdminUser = await isAdmin(request);
    if (!isAdminUser) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Only admins can revoke API keys",
        },
        { status: 403 }
      );
    }

    const user = await getAuthenticatedUser(request);
    if (!user || !user.id) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          message: "Could not determine user",
        },
        { status: 401 }
      );
    }

    const { id } = await params;

    // Find the API key
    const apiKey = await prisma.apiKey.findUnique({
      where: { id },
    });

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Not found",
          message: "API key not found",
        },
        { status: 404 }
      );
    }

    // Revoke the key
    const revokedKey = await prisma.apiKey.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedBy: user.id,
        isActive: false,
      },
    });

    return NextResponse.json(
      {
        message: "API key revoked successfully",
        data: {
          id: revokedKey.id,
          name: revokedKey.name,
          revokedAt: revokedKey.revokedAt,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error revoking API key:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to revoke API key",
      },
      { status: 500 }
    );
  }
}
