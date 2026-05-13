import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production"
const secretKey = new TextEncoder().encode(JWT_SECRET)

export const LOOKUP_COOKIE = "lookup_auth_token"

// ─── Token helpers ────────────────────────────────────────────────────────────

export async function createLookupToken(
  payload: { userId: string; email: string },
  expiresIn = "30d"
) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey)
}

export async function verifyLookupToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    })
    return payload as { userId: string; email: string }
  } catch {
    return null
  }
}

// ─── Server-side helpers (Server Components / Route Handlers) ─────────────────

/** Returns the decoded lookup session from the cookie, or null. */
export async function getLookupSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(LOOKUP_COOKIE)?.value
  if (!token) return null
  return verifyLookupToken(token)
}

// ─── Request-level helper (for API route handlers) ────────────────────────────

function parseCookieHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  header.split(";").forEach((part) => {
    const [k, v] = part.trim().split("=")
    if (k) out[k] = decodeURIComponent(v ?? "")
  })
  return out
}

/** Returns the decoded lookup session from a Request object's cookie header. */
export async function getLookupSessionFromRequest(
  request: Request
): Promise<{ userId: string; email: string } | null> {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const parsed = parseCookieHeader(cookieHeader)
  const token = parsed[LOOKUP_COOKIE]
  if (!token) return null
  return verifyLookupToken(token)
}
