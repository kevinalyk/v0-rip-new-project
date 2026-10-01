"use client"

import useSWR from "swr"
import { ArrowUp, ArrowDown, Flame, Loader2, AlertCircle } from "lucide-react"
import type { TrendingEntity, TrendingEntitiesResult } from "@/lib/trending-entities"

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error("Failed to load")
    return r.json()
  })

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
          {entity.current24h} sends today vs {entity.baselineAvgDaily}/day avg
        </p>
      </div>

      <div className="shrink-0 text-right">
        {entity.isNewSurge ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-semibold text-orange-500">
            <Flame className="h-3 w-3" />
            New surge
          </span>
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
  const { data, error, isLoading } = useSWR<TrendingEntitiesResult>(
    "/api/admin/dashboard/trending-entities",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 },
  )

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Trending Senders</h2>
          <p className="text-xs text-muted-foreground">Last 24h volume vs. trailing 7-day daily average</p>
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
