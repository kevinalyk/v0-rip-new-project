"use client"

import { useState } from "react"
import useSWR from "swr"
import { ArrowUp, ArrowDown, Flame, Loader2, AlertCircle, Info } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { TrendingEntity, TrendingEntitiesResult, TrendingWindowKey } from "@/lib/trending-entities"

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error("Failed to load")
    return r.json()
  })

const WINDOW_TABS: { key: TrendingWindowKey; label: string }[] = [
  { key: "24h_7d", label: "24h vs 7d" },
  { key: "7d_30d", label: "7d vs 30d" },
  { key: "30d_90d", label: "30d vs 90d" },
]

function partyColor(party: string | null) {
  if (party === "republican") return "text-red-500"
  if (party === "democrat") return "text-blue-500"
  return "text-muted-foreground"
}

function EntityRow({ entity, direction }: { entity: TrendingEntity; direction: "up" | "down" }) {
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted overflow-hidden flex items-center justify-center">
        {entity.imageUrl ? (
          <img
            src={entity.imageUrl || "/placeholder.svg"}
            alt={entity.name}
            className="h-full w-full object-cover"
            crossOrigin="anonymous"
          />
        ) : (
          <span className="text-xs font-medium text-muted-foreground">
            {entity.name
              .split(" ")
              .map((p) => p[0])
              .slice(0, 2)
              .join("")}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{entity.name}</p>
        <p className={`text-xs ${partyColor(entity.party)}`}>
          {entity.state ? `${entity.state} · ` : ""}
          {entity.currentCount} sends this window vs {entity.baselineAvgDaily}/day avg
        </p>
      </div>

      <div className="shrink-0 text-right">
        {entity.isNewSurge ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-semibold text-orange-500 cursor-help">
                  <Flame className="h-3 w-3" />
                  New surge
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-60 text-xs">
                Was sending next to nothing (under ~1/day average) and has now sent a meaningful
                volume in this window — a jump from near-zero rather than a plain % increase.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span
            className={`inline-flex items-center gap-1 text-sm font-semibold ${
              direction === "up" ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {direction === "up" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {entity.pctChange !== null ? `${Math.abs(entity.pctChange)}%` : "—"}
          </span>
        )}
      </div>
    </div>
  )
}

function EntityList({ entities, direction, emptyText }: { entities: TrendingEntity[]; direction: "up" | "down"; emptyText: string }) {
  if (entities.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
  }
  return (
    <div className="divide-y divide-border/60">
      {entities.map((entity) => (
        <EntityRow key={entity.entityId} entity={entity} direction={direction} />
      ))}
    </div>
  )
}

export function TrendingEntitiesCard() {
  const [window, setWindow] = useState<TrendingWindowKey>("24h_7d")

  const { data, error, isLoading } = useSWR<TrendingEntitiesResult>(
    `/api/admin/dashboard/trending-entities?window=${window}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  )

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Trending Senders</h2>
          <p className="text-xs text-muted-foreground">{data?.windowLabel ?? "Volume vs. trailing baseline average"}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5">
            {WINDOW_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setWindow(tab.key)}
                className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                  window === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-xs">
                Compares each entity's email+SMS volume in the current window against what their
                own trailing baseline rate would predict for a window that length. A{" "}
                <span className="font-semibold">New surge</span> badge means the entity was
                essentially inactive before (under ~1 send/day on average) and has now sent a
                meaningful volume.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="p-4">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading trends...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-red-500">
            <AlertCircle className="h-4 w-4" />
            Failed to load trending senders.
          </div>
        )}

        {data && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-500">
                <ArrowUp className="h-3.5 w-3.5" />
                Top Risers
              </h3>
              <EntityList entities={data.risers} direction="up" emptyText="No notable spikes right now." />
            </div>

            <div>
              <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-500">
                <ArrowDown className="h-3.5 w-3.5" />
                Going Quiet
              </h3>
              <EntityList entities={data.fallers} direction="down" emptyText="No notable drop-offs right now." />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
