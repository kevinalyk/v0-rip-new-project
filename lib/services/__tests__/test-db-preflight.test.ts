/**
 * Isolated unit tests for the assertRealDatabaseOrExit fail-closed guard
 * (test-db-preflight.ts). These tests inject every dependency the guard touches — env
 * snapshot, mock-client check, raw query, exit, log — so this file:
 *
 *   - never imports a real Prisma client or opens a database socket
 *   - never invokes the real `process.exit` (which would kill this test runner)
 *   - runs with no DATABASE_URL, no MOBILE_DB_TESTS_ALLOWED, and no env file at all
 *
 * This is a lightweight tsx-run script (no test framework is configured in this
 * project), matching the pattern in the other lib/services/__tests__/*.test.ts files.
 *
 * Run with: pnpm run test:mobile-db-preflight (no env file, no DATABASE_URL required).
 * The real DB-backed suites (test:mobile-auth, test:mobile-feed, test:mobile-entities)
 * must only be run after these isolated tests pass — that ordering is enforced by
 * test:mobile in package.json.
 */
import { assertRealDatabaseOrExit, type PreflightEnv } from "@/lib/services/__tests__/test-db-preflight"

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
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

const VALID_ENV: PreflightEnv = {
  MOBILE_DB_TESTS_ALLOWED: "true",
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://user:pass@some-real-host:5432/testdb",
}

/** Returns a copy of VALID_ENV with `key` entirely absent (not just set to undefined). */
function withoutKey(key: keyof PreflightEnv): PreflightEnv {
  const copy: PreflightEnv = { ...VALID_ENV }
  delete copy[key]
  return copy
}

/** Records exit calls instead of terminating the process, and short-circuits like the real `process.exit` would. */
class ExitSignal extends Error {
  constructor(public code: number) {
    super(`exit(${code})`)
  }
}

function makeExit() {
  const calls: number[] = []
  const exit = (code: number) => {
    calls.push(code)
    throw new ExitSignal(code)
  }
  return { exit, calls }
}

function makeLog() {
  const messages: string[] = []
  return { log: (message: string) => messages.push(message), messages }
}

async function run(
  env: PreflightEnv,
  opts: { isMockClient?: () => boolean; queryRaw?: () => Promise<unknown> } = {},
) {
  const { exit, calls } = makeExit()
  const { log, messages } = makeLog()
  let threwOtherError: unknown = null
  let completedWithoutExit = false

  try {
    await assertRealDatabaseOrExit({
      env,
      exit,
      log,
      isMockClient: opts.isMockClient ?? (() => false),
      queryRaw: opts.queryRaw ?? (async () => [{ "?column?": 1 }]),
    })
    completedWithoutExit = true
  } catch (error) {
    if (!(error instanceof ExitSignal)) threwOtherError = error
  }

  if (threwOtherError) throw threwOtherError
  return { exitCalls: calls, messages, completedWithoutExit }
}

async function main() {
  await test("rejects when MOBILE_DB_TESTS_ALLOWED is missing", async () => {
    const { exitCalls, messages } = await run(withoutKey("MOBILE_DB_TESTS_ALLOWED"))
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(
      messages.some((m) => m.includes("MOBILE_DB_TESTS_ALLOWED")),
      "error message must mention MOBILE_DB_TESTS_ALLOWED",
    )
  })

  await test('rejects when MOBILE_DB_TESTS_ALLOWED is set but not exactly "true"', async () => {
    for (const value of ["1", "TRUE", "yes", "True ", ""]) {
      const { exitCalls } = await run({ ...VALID_ENV, MOBILE_DB_TESTS_ALLOWED: value })
      assert(exitCalls.length === 1 && exitCalls[0] === 1, `must exit(1) for MOBILE_DB_TESTS_ALLOWED=${JSON.stringify(value)}`)
    }
  })

  await test("rejects when VERCEL_ENV=production, even with the opt-in latch set", async () => {
    const { exitCalls, messages } = await run({ ...VALID_ENV, VERCEL_ENV: "production" })
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("VERCEL_ENV")), "error message must mention VERCEL_ENV")
  })

  await test("rejects when NODE_ENV=production, even with the opt-in latch set", async () => {
    const { exitCalls, messages } = await run({ ...VALID_ENV, NODE_ENV: "production" })
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("NODE_ENV")), "error message must mention NODE_ENV")
  })

  await test("rejects when DATABASE_URL is missing", async () => {
    const { exitCalls, messages } = await run(withoutKey("DATABASE_URL"))
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("DATABASE_URL is not set")), "error message must mention DATABASE_URL")
  })

  await test("rejects when DATABASE_URL is the lib/prisma.ts mock connection string", async () => {
    const { exitCalls, messages } = await run({
      ...VALID_ENV,
      DATABASE_URL: "postgresql://mock:mock@localhost:5432/mock",
    })
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("mock")), "error message must mention the mock connection string")
  })

  await test("rejects when the Prisma client is the MockPrismaClient fallback", async () => {
    const { exitCalls, messages } = await run(VALID_ENV, { isMockClient: () => true })
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("MockPrismaClient")), "error message must mention MockPrismaClient")
  })

  await test("rejects when the database is unreachable", async () => {
    const { exitCalls, messages } = await run(VALID_ENV, {
      queryRaw: async () => {
        throw new Error("ECONNREFUSED")
      },
    })
    assert(exitCalls.length === 1 && exitCalls[0] === 1, "must exit(1) exactly once")
    assert(messages.some((m) => m.includes("could not reach the database")), "error message must mention reachability")
  })

  await test("allows an explicitly-opted-in, non-production, reachable configuration through", async () => {
    const { exitCalls, completedWithoutExit } = await run(VALID_ENV)
    assert(exitCalls.length === 0, "must not call exit at all")
    assert(completedWithoutExit, "must resolve normally without throwing")
  })

  await test("never prints the DATABASE_URL value itself in any rejection message", async () => {
    const secretUrl = "postgresql://svc_user:s3cr3t-token@internal-host.example:5432/proddb"
    const scenarios: PreflightEnv[] = [
      { DATABASE_URL: secretUrl }, // missing MOBILE_DB_TESTS_ALLOWED
      { ...VALID_ENV, DATABASE_URL: secretUrl, VERCEL_ENV: "production" },
      { ...VALID_ENV, DATABASE_URL: secretUrl, NODE_ENV: "production" },
    ]
    for (const env of scenarios) {
      const { messages } = await run(env)
      assert(
        !messages.some((m) => m.includes("s3cr3t-token") || m.includes(secretUrl)),
        "rejection messages must never leak DATABASE_URL contents",
      )
    }
  })

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
