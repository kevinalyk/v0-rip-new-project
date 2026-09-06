/**
 * Shared preflight check for the mobile integration test scripts (mobile-auth,
 * mobile-feed, mobile-entities). These scripts assert against real rows created in
 * `DATABASE_URL`, but `lib/prisma.ts` silently falls back to a `MockPrismaClient` —
 * whose CRUD methods are no-ops returning `[]` / `null` / `{ count: 0 }` — whenever
 * `@prisma/client` fails to import OR `DATABASE_URL` is unset (it then defaults to a
 * literal `postgresql://mock:mock@localhost:5432/mock` connection string that nothing
 * is listening on).
 *
 * Without this check, running one of these scripts in an environment where
 * DATABASE_URL isn't wired up (a fresh CI runner, a misconfigured env, etc.) doesn't
 * fail loudly — every `create` silently returns a fake object, every `findMany`
 * returns `[]`, and assertions like "the feed must not include X" trivially pass
 * because nothing was ever queried at all. That's a false green, not a real pass.
 *
 * Call `assertRealDatabaseOrExit()` once, before `cleanup()`, at the top of each
 * script's `main()`. It exits the process with a clear message instead of letting the
 * suite silently report "0 passed, 0 failed" or misleadingly "N passed" against a
 * mock.
 */
import prisma from "@/lib/prisma"

export async function assertRealDatabaseOrExit(): Promise<void> {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.error(
      "\nPreflight check failed: DATABASE_URL is not set.\n" +
        "This test hits a real database and cannot run against the mock Prisma client\n" +
        "that lib/prisma.ts silently falls back to. Run via the package.json script\n" +
        "(e.g. `pnpm run test:mobile-auth`), which passes --env-file=.env.development.local,\n" +
        "or otherwise ensure DATABASE_URL is set before invoking tsx directly.\n",
    )
    process.exit(1)
  }

  if (url.includes("mock:mock@localhost")) {
    console.error(
      "\nPreflight check failed: DATABASE_URL is set to lib/prisma.ts's literal mock\n" +
        "connection string (postgresql://mock:mock@localhost:5432/mock). Something\n" +
        "upstream is passing that value through explicitly — check your env file.\n",
    )
    process.exit(1)
  }

  // Constructor-name check catches the other fallback path: @prisma/client failed to
  // import (e.g. `prisma generate` was never run) and lib/prisma.ts is handing back its
  // in-file `MockPrismaClient`, independent of whether DATABASE_URL itself looks real.
  if (prisma?.constructor?.name === "MockPrismaClient") {
    console.error(
      "\nPreflight check failed: lib/prisma.ts is using its MockPrismaClient fallback\n" +
        "(the real @prisma/client failed to import). Run `npx prisma generate` and retry.\n",
    )
    process.exit(1)
  }

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out after 5s")), 5000)),
    ])
  } catch (error) {
    console.error(
      "\nPreflight check failed: could not reach the database at DATABASE_URL.\n" +
        (error instanceof Error ? error.message : String(error)) +
        "\n",
    )
    process.exit(1)
  }
}
