import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { Card, CardContent } from "@/components/ui/card"
import { ExternalLink, Globe, MapPin, UserRound } from "lucide-react"
import prisma from "@/lib/prisma"
import { nameToSlug } from "@/lib/directory"
import { CATEGORY_LABELS, CATEGORY_ORDER, type DomainCategory } from "@/lib/domain-radar"

export const metadata: Metadata = {
  title: "New Political Domains - Inbox.GOP",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

type DomainRow = {
  id: string
  domain: string
  category: string
  state: string | null
  linkedEntityId: string | null
  registeredOn: Date
}
type CategoryCount = { category: string; _count: { _all: number } }
type StateCount = { state: string | null }

const CATEGORY_ACCENTS: Record<string, { dot: string; badge: string }> = {
  congress: { dot: "bg-sky-400", badge: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
  senate: { dot: "bg-violet-400", badge: "border-violet-400/30 bg-violet-400/10 text-violet-300" },
  governor: { dot: "bg-amber-400", badge: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  president: { dot: "bg-rose-400", badge: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  state_legislature: { dot: "bg-emerald-400", badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  local: { dot: "bg-teal-400", badge: "border-teal-400/30 bg-teal-400/10 text-teal-300" },
  candidate_name: { dot: "bg-fuchsia-400", badge: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-300" },
  general: { dot: "bg-zinc-400", badge: "border-border/60 bg-muted text-muted-foreground" },
}

const DAY_OPTIONS = [1, 3, 7, 14, 30]
const DEFAULT_DAYS = 7
const MAX_ROWS = 2000

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })
}

function isCategory(value: string | undefined): value is DomainCategory {
  return !!value && (CATEGORY_ORDER as string[]).includes(value)
}

function categoryRank(value: string): number {
  const index = (CATEGORY_ORDER as string[]).indexOf(value)
  return index === -1 ? CATEGORY_ORDER.length : index
}

function splitDomain(domain: string): { name: string; tld: string } {
  const dot = domain.lastIndexOf(".")
  if (dot <= 0) return { name: domain, tld: "" }
  return { name: domain.slice(0, dot), tld: domain.slice(dot) }
}

export default async function NewDomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; state?: string; days?: string; q?: string }>
}) {
  const params = await searchParams

  const token = (await cookies()).get("auth_token")?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload) redirect("/login")
  // Hidden for now: only super admins can see this page.
  if (payload.role !== "super_admin") notFound()
  const clientSlug = (payload.clientSlug as string) || ""

  const requestedDays = Number(params.days)
  const days = DAY_OPTIONS.includes(requestedDays) ? requestedDays : DEFAULT_DAYS
  const category = isCategory(params.category) ? params.category : undefined
  const state = params.state && /^[A-Za-z]{2}$/.test(params.state) ? params.state.toUpperCase() : undefined
  const search = params.q?.trim().toLowerCase().slice(0, 60) || undefined

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)
  since.setUTCHours(0, 0, 0, 0)

  const windowWhere = { registeredOn: { gte: since } }

  const [rowsRaw, categoryCountsRaw, stateCountsRaw, lastScan] = await Promise.all([
    prisma.newDomainRegistration.findMany({
      where: {
        ...windowWhere,
        ...(category && { category }),
        ...(state && { state }),
        ...(search && { domain: { contains: search } }),
      },
      orderBy: [{ registeredOn: "desc" }, { domain: "asc" }],
      take: MAX_ROWS,
    }),
    prisma.newDomainRegistration.groupBy({ by: ["category"], where: windowWhere, _count: { _all: true } }),
    prisma.newDomainRegistration.groupBy({
      by: ["state"],
      where: { ...windowWhere, state: { not: null } },
      _count: { _all: true },
    }),
    prisma.newDomainRegistration.aggregate({ _max: { firstSeenAt: true } }),
  ])

  // lib/prisma is loosely typed, so give the query results their shapes here.
  const rows = rowsRaw as DomainRow[]
  const categoryCounts = categoryCountsRaw as CategoryCount[]
  const stateCounts = stateCountsRaw as StateCount[]

  const entityIds = Array.from(new Set(rows.map((row) => row.linkedEntityId).filter((id): id is string => !!id)))
  const entities: { id: string; name: string }[] = entityIds.length
    ? await prisma.ciEntity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } })
    : []
  const entityById = new Map(entities.map((entity) => [entity.id, entity.name]))

  const countByCategory = new Map(categoryCounts.map((row) => [row.category, row._count._all]))
  const totalInWindow = categoryCounts.reduce((sum, row) => sum + row._count._all, 0)
  const stateOptions = stateCounts
    .map((row) => row.state)
    .filter((value): value is string => !!value)
    .sort()

  const rowsByDay = new Map<string, DomainRow[]>()
  for (const row of rows) {
    const key = row.registeredOn.toISOString().slice(0, 10)
    const bucket = rowsByDay.get(key)
    if (bucket) bucket.push(row)
    else rowsByDay.set(key, [row])
  }
  for (const bucket of rowsByDay.values()) {
    bucket.sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || a.domain.localeCompare(b.domain))
  }

  const filtersActive = !!(category || state || search)

  function hrefFor(nextCategory?: string): string {
    const query = new URLSearchParams()
    if (nextCategory) query.set("category", nextCategory)
    if (state) query.set("state", state)
    if (search) query.set("q", search)
    if (days !== DEFAULT_DAYS) query.set("days", String(days))
    const qs = query.toString()
    return qs ? `/directory/new-domains?${qs}` : "/directory/new-domains"
  }

  const controlClass =
    "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  const chipBase = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
  const chipIdle = "border-border/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
  const chipActive = "border-[#EB3847]/40 bg-[#EB3847]/10 text-[#EB3847]"

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        <div className="flex flex-col gap-4 px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#EB3847]" />
              New Political Domains
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Newly registered domains that look political, such as office keywords like &quot;for senate&quot; or
              names of candidates we track. Scanned daily from a free sample of new registrations, so it won&apos;t
              catch every domain.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {lastScan._max.firstSeenAt
                ? `Last new match found ${lastScan._max.firstSeenAt.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`
                : "No scan has found a match yet. The first scan runs on the next daily cron."}
            </p>
          </div>

          <nav aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
            <Link href={hrefFor()} className={`${chipBase} ${!category ? chipActive : chipIdle}`}>
              All
              <span className="tabular-nums opacity-80">{totalInWindow}</span>
            </Link>
            {CATEGORY_ORDER.map((value) => {
              const count = countByCategory.get(value) ?? 0
              if (count === 0 && category !== value) return null
              return (
                <Link
                  key={value}
                  href={hrefFor(value)}
                  aria-current={category === value ? "true" : undefined}
                  className={`${chipBase} ${category === value ? chipActive : chipIdle}`}
                >
                  {CATEGORY_LABELS[value]}
                  <span className="tabular-nums opacity-80">{count}</span>
                </Link>
              )
            })}
          </nav>

          <form method="get" className="flex flex-wrap items-center gap-2">
            {category && <input type="hidden" name="category" value={category} />}
            <label className="sr-only" htmlFor="nd-state">State</label>
            <select id="nd-state" name="state" defaultValue={state ?? ""} className={controlClass}>
              <option value="">All states</option>
              {stateOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="nd-days">Time range</label>
            <select id="nd-days" name="days" defaultValue={String(days)} className={controlClass}>
              {DAY_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value === 1 ? "Last day" : `Last ${value} days`}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="nd-q">Search domains</label>
            <input
              id="nd-q"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search domains"
              className={`${controlClass} w-full sm:w-56`}
            />
            <button
              type="submit"
              className="h-9 rounded-md bg-[#EB3847] px-4 text-sm font-medium text-white hover:bg-[#EB3847]/90 transition-colors"
            >
              Apply
            </button>
            {(filtersActive || days !== DEFAULT_DAYS) && (
              <Link href="/directory/new-domains" className="text-sm text-muted-foreground hover:text-foreground">
                Clear
              </Link>
            )}
            <span className="ml-auto text-sm text-muted-foreground">
              {filtersActive ? `${rows.length} of ${totalInWindow}` : totalInWindow}{" "}
              {totalInWindow === 1 ? "domain" : "domains"} in the last {days} {days === 1 ? "day" : "days"}
              {rows.length === MAX_ROWS ? ` (showing the first ${MAX_ROWS})` : ""}
            </span>
          </form>
        </div>

        <div className="flex-1 px-4 md:px-6 py-6 space-y-8">
          {rows.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Card className="max-w-xl w-full border-border/60">
                <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EB3847]/10 border border-[#EB3847]/30">
                    <Globe className="h-6 w-6 text-[#EB3847]" />
                  </div>
                  <h2 className="text-lg font-semibold">
                    {filtersActive ? "No matching domains" : "No domains yet"}
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    {filtersActive
                      ? "Nothing matches these filters in the selected time range. Try clearing them or widening the range."
                      : "Matches appear after the daily scan runs."}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            Array.from(rowsByDay.entries()).map(([dayKey, dayRows]) => (
              <section key={dayKey} aria-labelledby={`day-${dayKey}`} className="space-y-2">
                <h2 id={`day-${dayKey}`} className="flex items-baseline gap-2 text-sm font-semibold">
                  {formatDay(new Date(`${dayKey}T00:00:00.000Z`))}
                  <span className="text-xs font-normal text-muted-foreground">
                    {dayRows.length} {dayRows.length === 1 ? "domain" : "domains"}
                  </span>
                </h2>
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {dayRows.map((row) => {
                    const entityName = row.linkedEntityId ? entityById.get(row.linkedEntityId) : null
                    const { name, tld } = splitDomain(row.domain)
                    const label = (CATEGORY_LABELS as Record<string, string>)[row.category] ?? row.category
                    const accent = CATEGORY_ACCENTS[row.category] ?? CATEGORY_ACCENTS.general
                    return (
                      <li
                        key={row.id}
                        className="group flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-colors hover:border-foreground/25 hover:bg-muted/40"
                      >
                        <a
                          href={`https://${row.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex min-w-0 items-center gap-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        >
                          <span className="min-w-0 truncate">
                            {name}
                            <span className="text-muted-foreground">{tld}</span>
                          </span>
                          <ExternalLink
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                          />
                          <span className="sr-only"> (opens in a new tab)</span>
                        </a>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${accent.badge}`}
                          >
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                            {label}
                          </span>
                          {row.state && (
                            <span className="inline-flex items-center gap-1 rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <MapPin className="h-2.5 w-2.5" />
                              {row.state}
                            </span>
                          )}
                          {entityName && (
                            <Link
                              href={`/directory/${nameToSlug(entityName)}`}
                              className="inline-flex min-w-0 items-center gap-1 rounded border border-[#EB3847]/30 bg-[#EB3847]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#EB3847] hover:bg-[#EB3847]/20 transition-colors"
                            >
                              <UserRound className="h-2.5 w-2.5 shrink-0" />
                              <span className="truncate">{entityName}</span>
                            </Link>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  )
}
