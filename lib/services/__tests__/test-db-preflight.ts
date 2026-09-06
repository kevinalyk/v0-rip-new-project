/**
 * Fail-closed preflight guard for the mobile integration test scripts (mobile-auth,
 * mobile-feed, mobile-entities). These scripts assert against real rows created in
 * `DATABASE_URL`, and this guard exists to make it structurally impossible for them to
 * silently do something other than that.
 *
 * Two independent failure modes are guarded against:
 *
 * 1. False-green mock fallback: `lib/prisma.ts` silently falls back to a
 *    `MockPrismaClient` — whose CRUD methods are no-ops returning `[]` / `null` /
 *    `{ count: 0 }` — whenever `@prisma/client` fails to import OR `DATABASE_URL` is
 *    unset (it then defaults to a literal `postgresql://mock:mock@localhost:5432/mock`
 *    connection string that nothing is listening on). Without a check, a suite run in
 *    an environment where DATABASE_URL isn't wired up doesn't fail loudly — every
 *    `create` silently returns a fake object, every `findMany` returns `[]`, and
 *    assertions like "the feed must not include X" trivially pass because nothing was
 *    ever queried at all.
 *
 * 2. Running destructively against the wrong database: these scripts call `cleanup()`
 *    (bulk `deleteMany` by prefix) and create/mutate fixtures. That must never be
 *    possible against production, and must never happen by accident in any
 *    environment — hence the explicit, single-purpose `MOBILE_DB_TESTS_ALLOWED=true`
 *    opt-in latch below, which is required on every single invocation. It is a
 *    deliberate per-run safety switch, not a setting to leave on: do not set it in any
 *    production environment or persist it in a shared/committed env file.
 *
 * All environment/production/opt-in checks below run and can reject *before* any
 * database is touched at all (no `$queryRaw`, no `cleanup()`, no fixture creation).
 * The `$queryRaw('SELECT 1')` reachability check is deliberately last, since it's the
 * only step in this guard that actually talks to the database.
 *
 * Call `assertRealDatabaseOrExit()` once, before `cleanup()`, at the top of each
 * script's `main()`. It exits the process (via the injected `exit`, `process.exit` by
 * default) with a clear message instead of letting the suite silently report
 * "0 passed, 0 failed" or misleadingly "N passed" against a mock, or run destructively
 * against a database nobody explicitly allowed it to touch.
 *
 * Every dependency this guard touches — the environment snapshot, the mock-client
 * check, the raw query, the exit call, and the logger — is injectable via
 * `PreflightOverrides` specifically so `test-db-preflight.test.ts` can exercise every
 * branch below without ever importing a real Prisma client, opening a socket, or
 * calling the real `process.exit` (which would kill the test runner itself).
 */
import prisma from "@/lib/prisma"

export interface PreflightEnv {
  MOBILE_DB_TESTS_ALLOWED?: string
  VERCEL_ENV?: string
  NODE_ENV?: string
  DATABASE_URL?: string
}

export interface PreflightOverrides {
  /** Defaults to `process.env`. */
  env?: PreflightEnv
  /** Defaults to checking `prisma`'s constructor name for the real `lib/prisma.ts` MockPrismaClient. */
  isMockClient?: () => boolean
  /** Defaults to `prisma.$queryRaw` SELECT 1. Never invoked unless every prior check passes. */
  queryRaw?: () => Promise<unknown>
  /** Defaults to `process.exit`. Called with `1` on any failed check. Must not return control on the real path — a test double may return/throw instead of terminating the process. */
  exit?: (code: number) => void
  /** Defaults to `console.error`. */
  log?: (message: string) => void
}

const REACHABILITY_TIMEOUT_MS = 5000

export async function assertRealDatabaseOrExit(overrides: PreflightOverrides = {}): Promise<void> {
  const env = overrides.env ?? (process.env as PreflightEnv)
  const exit = overrides.exit ?? ((code: number) => process.exit(code))
  const log = overrides.log ?? ((message: string) => console.error(message))
  const isMockClient = overrides.isMockClient ?? (() => prisma?.constructor?.name === "MockPrismaClient")
  const queryRaw = overrides.queryRaw ?? (() => prisma.$queryRaw`SELECT 1`)

  // --- Environment safety checks first. None of these touch the database. ---

  // 1. Explicit, per-run opt-in latch. Required on every invocation, in every
  // environment, before anything else — including in a correctly configured
  // non-production dev/test setup. Must be exactly the string "true"; anything else
  // (unset, "1", "TRUE", "yes", ...) is treated as not opted in.
  if (env.MOBILE_DB_TESTS_ALLOWED !== "true") {
    log(
      "\nPreflight check failed: MOBILE_DB_TESTS_ALLOWED is not set to \"true\".\n" +
        "This suite creates and deletes real rows in whatever database DATABASE_URL points\n" +
        "to. It is intentionally opt-in on every run — set MOBILE_DB_TESTS_ALLOWED=true only\n" +
        "for the single invocation you intend to run against a development/test database.\n" +
        "Never set it in a production environment or persist it in a shared/committed env file.\n",
    )
    exit(1)
    return
  }

  // 2. Reject production outright, even with the opt-in latch set. The opt-in is a
  // safety switch for a human running a deliberate local/CI test pass, not an override
  // for environment identity — these two checks cannot be bypassed by MOBILE_DB_TESTS_ALLOWED.
  if (env.VERCEL_ENV === "production") {
    log(
      "\nPreflight check failed: VERCEL_ENV=production. This suite must never run against\n" +
        "a production environment, regardless of MOBILE_DB_TESTS_ALLOWED.\n",
    )
    exit(1)
    return
  }
  if (env.NODE_ENV === "production") {
    log(
      "\nPreflight check failed: NODE_ENV=production. This suite must never run against\n" +
        "a production environment, regardless of MOBILE_DB_TESTS_ALLOWED.\n",
    )
    exit(1)
    return
  }

  // 3. DATABASE_URL must be present and must not be the mock fallback's literal value.
  const url = env.DATABASE_URL
  if (!url) {
    log(
      "\nPreflight check failed: DATABASE_URL is not set.\n" +
        "This test hits a real database and cannot run against the mock Prisma client\n" +
        "that lib/prisma.ts silently falls back to. Run via the package.json script\n" +
        "(e.g. `pnpm run test:mobile-auth`), which loads .env.development.local if present,\n" +
        "or otherwise ensure DATABASE_URL is set before invoking tsx directly.\n",
    )
    exit(1)
    return
  }
  if (url.includes("mock:mock@localhost")) {
    log(
      "\nPreflight check failed: DATABASE_URL is set to lib/prisma.ts's literal mock\n" +
        "connection string (postgresql://mock:mock@localhost:5432/mock). Something\n" +
        "upstream is passing that value through explicitly — check your env file.\n",
    )
    exit(1)
    return
  }

  // 4. Constructor-name check catches the other fallback path: @prisma/client failed to
  // import (e.g. `prisma generate` was never run) and lib/prisma.ts is handing back its
  // in-file `MockPrismaClient`, independent of whether DATABASE_URL itself looks real.
  if (isMockClient()) {
    log(
      "\nPreflight check failed: lib/prisma.ts is using its MockPrismaClient fallback\n" +
        "(the real @prisma/client failed to import). Run `npx prisma generate` and retry.\n",
    )
    exit(1)
    return
  }

  // 5. Reachability. The only check that actually queries the database, and only
  // reached once every check above has passed.
  //
  // The failure branch below deliberately never logs the raw error object or its
  // `.message`. A database driver error can and does embed the connection string it
  // was trying to reach — including embedded credentials — directly in its message
  // (e.g. node-postgres includes the full connection string in some connect-time
  // errors). Logging that would defeat every other safeguard in this file, which all
  // exist specifically to keep DATABASE_URL out of process output. Only a short,
  // safely allow-listed error `code` (e.g. "ECONNREFUSED", "ETIMEDOUT") is surfaced,
  // and only if it matches a strict allow-list pattern that cannot itself contain a
  // credential or connection string.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      queryRaw(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out after 5s")), REACHABILITY_TIMEOUT_MS)
      }),
    ])
  } catch (error) {
    const code = extractSafeErrorCode(error)
    log(
      "\nPreflight check failed: could not reach the database at DATABASE_URL.\n" +
        (code ? `Error code: ${code}\n` : "") +
        "Check that the database is running and DATABASE_URL is correct.\n",
    )
    exit(1)
    return
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Extracts a short, safe-to-log error code from an unknown thrown value, or undefined
 * if none is present or it doesn't match the allow-list pattern. Deliberately never
 * returns `.message` or the error itself — only a `.code`-like property, and only if
 * it is short, uppercase/underscore/digit-only (e.g. "ECONNREFUSED", "ETIMEDOUT",
 * "28P01"), which structurally cannot contain a URL, hostname, or credential.
 */
function extractSafeErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined
  const code = (error as { code?: unknown }).code
  if (typeof code !== "string") return undefined
  if (code.length > 32) return undefined
  if (!/^[A-Z0-9_]+$/.test(code)) return undefined
  return code
}
