import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Globe, MapPin } from "lucide-react"
import prisma from "@/lib/prisma"
import { nameToSlug } from "@/lib/directory"
import { CATEGORY_LABELS, CATEGORY_ORDER, type DomainCategory } from "@/lib/domain-radar"

export const metadata: Metadata = {
  title: "New Political Domains - Inbox.GOP",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

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

  const [rows, categoryCounts, stateCounts, lastScan] = await Promise.all([
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

  const entityIds = Array.from(new Set(rows.map((row) => row.linkedEntityId).filter((id): id is string => !!id)))
  const entities = entityIds.length
    ? await prisma.ciEntity.findMany({ where: { id: { in: entityIds } }, select: { id: true, name: true } })
    : []
  const entityById = new Map(entities.map((entity) => [entity.id, entity.name]))

  const countByCategory = new Map(categoryCounts.map((row) => [row.category, row._count._all]))
  const totalInWindow = categoryCounts.reduce((sum, row) => sum + row._count._all, 0)
  const stateOptions = stateCounts
    .map((row) => row.state)
    .filter((value): value is string => !!value)
    .sort()

  const rowsByDay = new Map<string, typeof rows>()
  for (const row of rows) {
    const key = row.registeredOn.toISOString().slice(0, 10)
    const bucket = rowsByDay.get(key)
    if (bucket) bucket.push(row)
    else rowsByDay.set(key, [row])
  }

  const filtersActive = !!(category || state || search)
  const selectClass =
    "h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        <div className="flex flex-col gap-3 px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-border">
          <Link
            href="/directory"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Directory
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Globe className="h-5 w-5 text-[#EB3847]" />
              New Political Domains
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Super admin only
              </span>
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-3xl">
              Newly registered domains that look political: office keywords like &quot;for senate&quot;, plus
              names of candidates we already track. Scanned daily from a free list of new registrations.
              The free list is a sample of each day&apos;s registrations, so it won&apos;t catch every domain.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {lastScan._max.firstSeenAt
                ? `Last new match found ${lastScan._max.firstSeenAt.toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" })} UTC`
                : "No scan has found a match yet. The first scan runs on the next daily cron."}
            </p>
          </div>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="nd-category">Category</label>
            <select id="nd-category" name="category" defaultValue={category ?? ""} className={selectClass}>
              <option value="">All categories</option>
              {CATEGORY_ORDER.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="nd-state">State</label>
            <select id="nd-state" name="state" defaultValue={state ?? ""} className={selectClass}>
              <option value="">All states</option>
              {stateOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="nd-days">Time range</label>
            <select id="nd-days" name="days" defaultValue={String(days)} className={selectClass}>
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
              className="h-9 w-48 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
          </form>

          <p className="text-sm text-muted-foreground">
            {totalInWindow} {totalInWindow === 1 ? "domain" : "domains"} in the last {days} {days === 1 ? "day" : "days"}
            {filtersActive ? `, ${rows.length} shown` : ""}
            {rows.length === MAX_ROWS ? ` (showing the first ${MAX_ROWS})` : ""}
          </p>
        </div>

        <div className="flex-1 px-4 md:px-6 py-6 space-y-8">
          {rows.length === 0 ? (
            <Card className="max-w-xl border-border/60">
              <CardContent className="py-10 px-6 text-center space-y-2">
                <h2 className="text-lg font-semibold">
                  {filtersActive ? "No matching domains" : "No domains yet"}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {filtersActive
                    ? "Nothing matches these filters in the selected time range. Try clearing them or widening the range."
                    : "Matches appear after the daily scan runs."}
                </p>
              </CardContent>
            </Card>
          ) : (
            Array.from(rowsByDay.entries()).map(([dayKey, dayRows]) => (
              <section key={dayKey} aria-labelledby={`day-${dayKey}`} className="space-y-3">
                <h2 id={`day-${dayKey}`} className="text-base font-semibold">
                  {formatDay(new Date(`${dayKey}T00:00:00.000Z`))}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">{dayRows.length}</span>
                </h2>
                <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {CATEGORY_ORDER.map((value) => {
                    const inCategory = dayRows.filter((row) => row.category === value)
                    if (inCategory.length === 0) return null
                    return (
                      <Card key={value} className="border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center justify-between">
                            {CATEGORY_LABELS[value]}
                            <span className="text-xs text-muted-foreground">{inCategory.length}</span>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <ul className="space-y-1.5">
                            {inCategory.map((row) => {
                              const entityName = row.linkedEntityId ? entityById.get(row.linkedEntityId) : null
                              return (
                                <li key={row.id} className="text-xs leading-snug">
                                  <span className="font-mono break-all">{row.domain}</span>
                                  <span className="ml-1.5 inline-flex flex-wrap items-center gap-1 align-middle">
                                    {row.state && (
                                      <span className="inline-flex items-center gap-0.5 rounded border border-border/60 bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                                        <MapPin className="h-2.5 w-2.5" />
                                        {row.state}
                                      </span>
                                    )}
                                    {entityName && (
                                      <Link
                                        href={`/directory/${nameToSlug(entityName)}`}
                                        className="rounded border border-[#EB3847]/30 bg-[#EB3847]/10 px-1 py-0.5 text-[10px] text-[#EB3847] hover:bg-[#EB3847]/20"
                                      >
                                        {entityName}
                                      </Link>
                                    )}
                                  </span>
                                </li>
                              )
                            })}
                          </ul>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  )
}
