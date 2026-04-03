/**
 * POST /api/admin/api-keys
 * Create a new API key
 * Body: { name: string, scopes?: string[], rateLimit?: number, clientId?: string, expiresAt?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdmin, getAuthenticatedUser } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateApiKey } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  try {
    // Check admin access
    const isAdminUser = await isAdmin(request);
    if (!isAdminUser) {
      return NextResponse.json(
        {
          error: "Forbidden",
          message: "Only admins can manage API keys",
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

    const body = await request.json();
    const {
      name,
      scopes = ["campaigns:read", "sms:read", "entities:read"],
      rateLimit = 100,
      clientId,
      expiresAt,
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        {
          error: "Bad request",
          message: "name is required and must be a string",
        },
        { status: 400 }
      );
    }

    // Generate API key
    const { key, keyHash, keyPrefix } = generateApiKey();

    // Create in database
    const apiKey = await prisma.apiKey.create({
      data: {
        name,
        keyHash,
        keyPrefix,
        scopes,
        rateLimit,
        clientId: clientId || null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: user.id,
        isActive: true,
      },
    });

    // Return the raw key (only shown once)
    return NextResponse.json(
      {
        message: "API key created successfully",
        key, // Show the raw key only once
        keyPrefix: apiKey.keyPrefix,
        id: apiKey.id,
        name: apiKey.name,
        scopes: apiKey.scopes,
        rateLimit: apiKey.rateLimit,
        expiresAt: apiKey.expiresAt,
        warning:
          "Save this key securely. You will not be able to see it again.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[v0] Error creating API key:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "Failed to create API key",
      },
      { status: 500 }
    );
  }
}
