/**
 * Integration tests for lib/services/entity-service.ts's follow/unfollow — specifically
 * the concurrency-safety and idempotency fixes from the revision pass: two concurrent
 * follows of the same entity must not error and must not double-insert, and concurrent
 * follows racing against a plan's follow limit must never let the count exceed that
 * limit.
 *
 * IMPORTANT: hits whatever database DATABASE_URL points to; creates and tears down its
 * own Client/CiEntity/CiEntitySubscription fixtures, id-prefixed with
 * MOBILE_ENTITY_TEST_. Do not point DATABASE_URL at production.
 *
 * Run with: pnpm run test:mobile-entities (which passes
 * --env-file=.env.development.local to tsx) or
 * `npx tsx --env-file=.env.development.local lib/services/__tests__/mobile-entities.test.ts`
 * directly. The `--env-file` flag is required, not optional: under ESM, every static
 * `import` below is hoisted above any top-level statement in this file, so a
 * `dotenv.config()` call placed here in source order would run too late — `lib/prisma.ts`
 * (imported below) would already have read `process.env.DATABASE_URL` at its own
 * module-evaluation time and silently fallen back to its localhost mock default.
 */
import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"
import { followEntity, unfollowEntity } from "@/lib/services/entity-service"
import { assertRealDatabaseOrExit } from "@/lib/services/__tests__/test-db-preflight"

const PREFIX = "MOBILE_ENTITY_TEST_"
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

async function cleanup() {
  await prisma.ciEntitySubscription.deleteMany({ where: { clientId: { startsWith: PREFIX } } })
  await prisma.ciEntity.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.client.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main() {
  await assertRealDatabaseOrExit()
  await cleanup()
  
  // "paid" plan → ciFollowLimit: 3 (see lib/subscription-utils.ts).
  const client = await prisma.client.create({
    data: {
      id: `${PREFIX}client`,
      name: `${PREFIX}Client`,
      slug: `${PREFIX.toLowerCase()}client`,
      active: true,
      subscriptionPlan: "paid",
    },
  })

  const entities = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      prisma.ciEntity.create({ data: { name: `${PREFIX}Entity ${i}`, type: "politician" } }),
    ),
  )

  try {
    await test("concurrent follows of the SAME entity are idempotent — no error, one row", async () => {
      const results = await Promise.allSettled([
        followEntity(client.id, "paid", entities[0].id),
        followEntity(client.id, "paid", entities[0].id),
        followEntity(client.id, "paid", entities[0].id),
      ])
      const rejected = results.filter((r) => r.status === "rejected")
      assert(rejected.length === 0, `expected no rejections from concurrent identical follows, got ${rejected.length}`)

      const count = await prisma.ciEntitySubscription.count({ where: { clientId: client.id, entityId: entities[0].id } })
      assert(count === 1, `expected exactly 1 subscription row, got ${count}`)

      await unfollowEntity(client.id, entities[0].id)
    })

    await test("follow limit is never exceeded under concurrent follows of DIFFERENT entities", async () => {
      // Limit is 3 on the "paid" plan; fire 6 concurrent follows of 6 different entities.
      const results = await Promise.allSettled(entities.map((e) => followEntity(client.id, "paid", e.id)))

      const fulfilled = results.filter((r) => r.status === "fulfilled")
      const rejectedWithLimit = results.filter(
        (r) => r.status === "rejected" && r.reason instanceof MobileAuthError && r.reason.code === "FOLLOW_LIMIT_REACHED",
      )

      assert(fulfilled.length === 3, `expected exactly 3 successful follows (the plan limit), got ${fulfilled.length}`)
      assert(rejectedWithLimit.length === 3, `expected exactly 3 FOLLOW_LIMIT_REACHED rejections, got ${rejectedWithLimit.length}`)

      const finalCount = await prisma.ciEntitySubscription.count({ where: { clientId: client.id } })
      assert(finalCount === 3, `follow count must never exceed the plan limit of 3, got ${finalCount}`)

      await prisma.ciEntitySubscription.deleteMany({ where: { clientId: client.id } })
    })

    await test("unlimited-follow plans skip the limit check entirely", async () => {
      const results = await Promise.allSettled(entities.map((e) => followEntity(client.id, "all", e.id)))
      const rejected = results.filter((r) => r.status === "rejected")
      assert(rejected.length === 0, `plan with no follow limit should never reject, got ${rejected.length} rejections`)

      const finalCount = await prisma.ciEntitySubscription.count({ where: { clientId: client.id } })
      assert(finalCount === entities.length, `expected all ${entities.length} follows to succeed, got ${finalCount}`)
    })
  } finally {
    await cleanup()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error("Test run crashed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
  })
