"use client"

import { useEffect, useState, useRef } from "react"
import { Search, ShieldCheck, X, Loader2, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DeliverabilityScoreCard } from "@/components/deliverability-score-card"

interface Entity {
  id: string
  name: string
  slug: string | null
  type: string | null
  party: string | null
  state: string | null
}

interface ComplianceReportContentProps {
  clientSlug: string
}

function EntityRow({
  entity,
  onSelect,
  partyColor,
}: {
  entity: Entity
  onSelect: (e: Entity) => void
  partyColor: (party: string | null) => string
}) {
  return (
    <div
      onClick={() => onSelect(entity)}
      className="flex items-center gap-3 px-2 py-2 hover:bg-muted rounded-md cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entity.name}</p>
        {(entity.type || entity.state) && (
          <p className="text-xs text-muted-foreground">
            {[entity.type, entity.state].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {entity.party && (
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${partyColor(entity.party)}`}>
          {entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}
        </span>
      )}
    </div>
  )
}

export function ComplianceReportContent({ clientSlug }: ComplianceReportContentProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Entity[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [followedEntities, setFollowedEntities] = useState<Entity[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch followed entities on mount
  useEffect(() => {
    const fetchFollowed = async () => {
      try {
        const res = await fetch(`/api/ci/subscriptions/check-all?clientSlug=${clientSlug}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = data.entityIds ?? []
        if (ids.length === 0) return

        // Fetch entity details for each followed ID
        const detailsRes = await fetch(
          `/api/public/ci-entities?ids=${ids.join(",")}&pageSize=50`,
          { credentials: "include" }
        )
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json()
          setFollowedEntities(detailsData.entities ?? [])
        }
      } catch {
        // silently fail
      }
    }
    fetchFollowed()
  }, [clientSlug])

  // Focus search input when popover opens
  useEffect(() => {
    if (popoverOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    } else {
      setQuery("")
      setResults([])
    }
  }, [popoverOpen])

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(
          `/api/public/ci-entities?search=${encodeURIComponent(query.trim())}&pageSize=20`,
          { credentials: "include" }
        )
        if (res.ok) {
          const data = await res.json()
          // Surface followed entities first, then the rest
          const followedIds = new Set(followedEntities.map((e) => e.id))
          const all: Entity[] = data.entities ?? []
          const followed = all.filter((e) => followedIds.has(e.id))
          const others = all.filter((e) => !followedIds.has(e.id))
          setResults([...followed, ...others])
        }
      } catch {
        // silently fail
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [query, followedEntities])

  const handleSelect = (entity: Entity) => {
    setSelectedEntity(entity)
    setPopoverOpen(false)
  }

  const handleClear = () => {
    setSelectedEntity(null)
    setQuery("")
    setResults([])
  }

  const partyColor = (party: string | null) => {
    if (party === "republican") return "bg-red-500/10 text-red-400 border-red-500/20"
    if (party === "democrat") return "bg-blue-500/10 text-blue-400 border-blue-500/20"
    return "bg-muted text-muted-foreground border-border"
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-[#dc2a28]" />
          Deliverability Score
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Select any entity to view their email authentication, compliance scores, and inbox placement data.
        </p>
      </div>

      {/* Entity selector — Popover matching the CI filter style */}
      <div className="flex items-center gap-2">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full max-w-sm justify-between">
              <span className={selectedEntity ? "text-foreground" : "text-muted-foreground"}>
                {selectedEntity ? selectedEntity.name : "Select an entity..."}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[380px] p-0" align="start">
            {/* Sticky search input */}
            <div className="sticky top-0 z-50 bg-background p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchInputRef}
                  placeholder="Search entities..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-8 pl-8"
                />
              </div>
            </div>

            {/* Results list */}
            <div className="max-h-[280px] overflow-y-auto p-2">
              {searchLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : query.trim() && results.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">No entities found</div>
              ) : !query.trim() ? (
                followedEntities.length > 0 ? (
                  <>
                    <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Following</p>
                    {followedEntities.map((entity) => (
                      <EntityRow key={entity.id} entity={entity} onSelect={handleSelect} partyColor={partyColor} />
                    ))}
                    <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">Type to search all entities...</p>
                  </>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">Start typing to search...</div>
                )
              ) : (
                <>
                  {/* In search results, label followed entities */}
                  {results.some((e) => followedEntities.some((f) => f.id === e.id)) && (
                    <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Following</p>
                  )}
                  {results.map((entity, i) => {
                    const isFollowed = followedEntities.some((f) => f.id === entity.id)
                    const prevIsFollowed = i > 0 && followedEntities.some((f) => f.id === results[i - 1].id)
                    const showOthersLabel = !isFollowed && (i === 0 || prevIsFollowed)
                    return (
                      <div key={entity.id}>
                        {showOthersLabel && results.some((e) => followedEntities.some((f) => f.id === e.id)) && (
                          <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Results</p>
                        )}
                        <EntityRow entity={entity} onSelect={handleSelect} partyColor={partyColor} />
                      </div>
                    )
                  })}
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Clear selection */}
        {selectedEntity && (
          <Button variant="ghost" size="icon" onClick={handleClear} className="shrink-0">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Results */}
      {selectedEntity ? (
        <DeliverabilityScoreCard
          slug={selectedEntity.slug ?? "_"}
          entityId={selectedEntity.id}
          clientSlug={clientSlug}
          isAuthenticated={true}
          forceUnlocked={true}
        />
      ) : (
        /* Empty state */
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="font-medium">Select an entity to view their score</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Search for any campaign, PAC, or candidate above to view their authentication checks, inbox placement rate, and compliance score.
          </p>
        </div>
      )}
    </div>
  )
}
