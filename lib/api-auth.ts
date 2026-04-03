/**
 * API Authentication Middleware
 * Handles Bearer token validation and rate limiting for public API endpoints
 */

import { createHash } from "crypto";
import prisma from "@/lib/prisma";

interface ApiAuthContext {
  apiKeyId: string;
  keyName: string;
  scopes: string[];
  clientId?: string;
  rateLimit: number;
}

interface RateLimitStore {
  [keyHash: string]: {
    count: number;
    resetAt: number;
  };
}

// In-memory rate limit store (replace with Redis in production)
const rateLimitStore: RateLimitStore = {};

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Validate API key and return auth context
 */
export async function validateApiKey(
  authHeader?: string
): Promise<ApiAuthContext | null> {
  try {
    const token = extractBearerToken(authHeader);
    if (!token) return null;

    const keyHash = hashApiKey(token);

    // Find the API key in database
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!apiKey) {
      console.log("[v0] Invalid API key attempt");
      return null;
    }

    // Check if key is active
    if (!apiKey.isActive) {
      console.log("[v0] API key is inactive");
      return null;
    }

    // Check if key has expired
    if (apiKey.expiresAt && apiKey.expiresAt < new Date()) {
      console.log("[v0] API key has expired");
      return null;
    }

    // Check if key has been revoked
    if (apiKey.revokedAt) {
      console.log("[v0] API key has been revoked");
      return null;
    }

    // Parse scopes
    const scopes = Array.isArray(apiKey.scopes)
      ? apiKey.scopes
      : (JSON.parse(String(apiKey.scopes)) as string[]);

    // Update last used time
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: {
        lastUsedAt: new Date(),
        requestCount: { increment: 1 },
      },
    });

    return {
      apiKeyId: apiKey.id,
      keyName: apiKey.name,
      scopes,
      clientId: apiKey.clientId || undefined,
      rateLimit: apiKey.rateLimit,
    };
  } catch (error) {
    console.error("[v0] Error validating API key:", error);
    return null;
  }
}

/**
 * Check rate limit for an API key
 * Returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(keyHash: string, rateLimit: number): boolean {
  const now = Date.now();
  const windowStart = now - 60 * 1000; // 1 minute window

  if (!rateLimitStore[keyHash]) {
    rateLimitStore[keyHash] = {
      count: 1,
      resetAt: now + 60 * 1000,
    };
    return true;
  }

  const bucket = rateLimitStore[keyHash];

  // Check if window has passed
  if (now > bucket.resetAt) {
    bucket.count = 1;
    bucket.resetAt = now + 60 * 1000;
    return true;
  }

  // Check if under rate limit
  if (bucket.count < rateLimit) {
    bucket.count++;
    return true;
  }

  return false;
}

/**
 * Middleware for protecting API routes
 * Validates API key and checks rate limits
 */
export async function withApiAuth(
  request: Request,
  handler: (
    req: Request,
    context: ApiAuthContext
  ) => Promise<Response>
): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const authContext = await validateApiKey(authHeader);

    if (!authContext) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Missing or invalid API key",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Check rate limiting
    const keyHash = hashApiKey(authHeader?.split(" ")[1] || "");
    if (!checkRateLimit(keyHash, authContext.rateLimit)) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: `Maximum ${authContext.rateLimit} requests per minute`,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "60",
          },
        }
      );
    }

    // Call the handler with auth context
    return await handler(request, authContext);
  } catch (error) {
    console.error("[v0] API auth error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

/**
 * Check if API key has required scope
 */
export function hasScope(authContext: ApiAuthContext, scope: string): boolean {
  return authContext.scopes.includes(scope) ||
    authContext.scopes.includes("*")
    ? true
    : false;
}

/**
 * Generate a new API key
 * Returns the raw key (only shown once to user)
 */
export function generateApiKey(prefix: string = "rip_pk"): {
  key: string;
  keyHash: string;
  keyPrefix: string;
} {
  const randomPart = Math.random().toString(36).substring(2, 18);
  const key = `${prefix}_${randomPart}`;
  const keyHash = hashApiKey(key);
  const keyPrefix = key.substring(0, 8);

  return {
    key,
    keyHash,
    keyPrefix,
  };
}
