"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { X } from "lucide-react"

import { STATES, PARTIES, OFFICES } from "@/lib/campaign-filter-options"

interface Props {
  party?: string
  state?: string
  office?: string
  totalShown: number
  totalBeforeFilter: number
}

export default function NewCampaignsFilters({
  party,
  state,
  office,
  totalShown,
  totalBeforeFilter,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams],
  )

  const clearAll = useCallback(() => {
    router.push(pathname)
  }, [router, pathname])

  const hasFilters = !!(party || state || office)

  return (
    <div className="flex flex-col gap-3 px-4 md:px-6 py-3 border-b border-border bg-background/50">
      <div className="flex flex-wrap items-center gap-2">
        {/* Party */}
        <select
          value={party || ""}
          onChange={(e) => updateParam("party", e.target.value || null)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter by party"
        >
          <option value="">All Parties</option>
          {PARTIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        {/* State */}
        <select
          value={state || ""}
          onChange={(e) => updateParam("state", e.target.value || null)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter by state"
        >
          <option value="">All States</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Office */}
        <select
          value={office || ""}
          onChange={(e) => updateParam("office", e.target.value || null)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Filter by office"
        >
          <option value="">All Offices</option>
          {OFFICES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-background text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-3 w-3" />
            Clear filters
          </button>
        )}

        {/* Result count when filtered */}
        {hasFilters && (
          <span className="text-xs text-muted-foreground ml-1">
            {totalShown} of {totalBeforeFilter} {totalBeforeFilter === 1 ? "campaign" : "campaigns"}
          </span>
        )}
      </div>
    </div>
  )
}


