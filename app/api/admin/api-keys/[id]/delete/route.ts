/**
 * DELETE /api/admin/api-keys/[id]
 * Delete an API key
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(
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
          message: "Only admins can delete API keys",
        },
        { status: 403 }
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

    // Delete the key
    await prisma.apiKey.delete({
      where: { id },
    });

    return NextResponse.json(
      {
        message: "API key deleted successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[v0] Error deleting API key:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to delete API key",
      },
      { status: 500 }
    );
  }
}
