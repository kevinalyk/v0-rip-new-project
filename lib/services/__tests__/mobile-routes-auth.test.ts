/**
 * Static-analysis test (not a DB integration test — no Prisma calls here) proving
 * every non-public /api/mobile/v1 route file uses withMobileAuth for every exported
 * HTTP method handler. This is the automated backstop for middleware.ts's
 * default-deny behavior: middleware.ts requires a syntactically valid bearer header
 * for anything under /api/mobile/v1/* other than auth/login and auth/refresh, but a
 * route handler that forgot to wrap itself in withMobileAuth would still be the real
 * authorization boundary that matters — this test makes that omission fail CI
 * instead of shipping silently.
 *
 * Run with: npx tsx lib/services/__tests__/mobile-routes-auth.test.ts
 */
import { readdirSync, readFileSync, statSync } from "fs"
import { join } from "path"

const MOBILE_API_ROOT = join(process.cwd(), "app/api/mobile/v1")

// The only two /api/mobile/v1 routes middleware.ts allow-lists without a bearer
// header (see middleware.ts + docs/mobile-api.md) — everything else must use
// withMobileAuth.
const PUBLIC_ROUTES = new Set(["auth/login/route.ts", "auth/refresh/route.ts"])

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    passed++
    console.log(`  ok  - ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  - ${name}`)
    console.error(error instanceof Error ? `        ${error.message}` : error)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

function findRouteFiles(dir: string, root = dir): string[] {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...findRouteFiles(fullPath, root))
    } else if (entry === "route.ts") {
      files.push(fullPath.slice(root.length + 1).replace(/\\/g, "/"))
    }
  }
  return files
}

function main() {
  const routeFiles = findRouteFiles(MOBILE_API_ROOT)
  assert(routeFiles.length >= 11, `expected at least 11 mobile route files, found ${routeFiles.length}`)

  const protectedRoutes = routeFiles.filter((f) => !PUBLIC_ROUTES.has(f))
  assert(protectedRoutes.length > 0, "expected at least one protected mobile route")

  for (const relativePath of protectedRoutes) {
    const source = readFileSync(join(MOBILE_API_ROOT, relativePath), "utf-8")

    test(`${relativePath} exports at least one HTTP method handler`, () => {
      const exportedMethods = HTTP_METHODS.filter((m) => new RegExp(`export const ${m}\\b`).test(source))
      assert(exportedMethods.length > 0, "no exported GET/POST/PUT/PATCH/DELETE const found")
    })

    test(`${relativePath} wraps every exported handler in withMobileAuth`, () => {
      const exportedMethods = HTTP_METHODS.filter((m) => new RegExp(`export const ${m}\\b`).test(source))
      for (const method of exportedMethods) {
        // Matches `export const GET = withMobileAuth(` or `withMobileAuth<...>(` —
        // i.e. the handler is bound directly to the wrapper's return value.
        const wrapped = new RegExp(`export const ${method}\\s*=\\s*withMobileAuth(<[^>]*>)?\\s*\\(`).test(source)
        assert(wrapped, `${method} is exported but is not assigned withMobileAuth(...)`)
      }
    })

    test(`${relativePath} does not export a raw (unwrapped) function handler`, () => {
      for (const method of HTTP_METHODS) {
        const rawExport = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\b`).test(source)
        assert(!rawExport, `${method} is exported as a raw function, bypassing withMobileAuth`)
      }
    })
  }

  // And the inverse: the two public routes must NOT be wrapped in withMobileAuth
  // (they have no access token to verify yet), confirming the allow-list in
  // middleware.ts and this test agree on which routes are actually public.
  for (const relativePath of PUBLIC_ROUTES) {
    const source = readFileSync(join(MOBILE_API_ROOT, relativePath), "utf-8")
    test(`${relativePath} is a public route (raw exported POST, no withMobileAuth)`, () => {
      assert(/export\s+async\s+function\s+POST\b/.test(source), "expected a raw exported POST handler")
      assert(!/withMobileAuth/.test(source), "public route should not use withMobileAuth")
    })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()
