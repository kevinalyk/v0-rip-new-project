"use client"

import { useEffect, useState, useRef } from "react"
import { Search, ShieldCheck, X, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
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

export function ComplianceReportContent({ clientSlug }: ComplianceReportContentProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Entity[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!query.trim() || selectedEntity) {
      setResults([])
      setDropdownOpen(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(
          `/api/public/ci-entities?search=${encodeURIComponent(query.trim())}&pageSize=10`,
          { credentials: "include" }
        )
        if (res.ok) {
          const data = await res.json()
          setResults(data.entities ?? [])
          setDropdownOpen((data.entities ?? []).length > 0)
        }
      } catch {
        // silently fail
      } finally {
        setSearchLoading(false)
      }
    }, 300)
  }, [query, selectedEntity])

  const handleSelect = (entity: Entity) => {
    setSelectedEntity(entity)
    setQuery(entity.name)
    setDropdownOpen(false)
    setResults([])
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
          Search for any entity to view their email authentication, compliance scores, and inbox placement data.
        </p>
      </div>

      {/* Entity search */}
      <div ref={containerRef} className="relative max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              if (selectedEntity) setSelectedEntity(null)
            }}
            onFocus={() => {
              if (results.length > 0) setDropdownOpen(true)
            }}
            placeholder="Search for a campaign, PAC, or candidate..."
            className="pl-9 pr-9"
          />
          {(query || selectedEntity) && (
            <button
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dropdown */}
        {dropdownOpen && results.length > 0 && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-lg overflow-hidden">
            {searchLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              results.map((entity) => (
                <button
                  key={entity.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(entity)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
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
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Results */}
      {selectedEntity ? (
        selectedEntity.slug ? (
          <DeliverabilityScoreCard
            slug={selectedEntity.slug}
            clientSlug={clientSlug}
            isAuthenticated={true}
            forceUnlocked={true}
          />
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground text-sm">
            No deliverability data available for this entity.
          </div>
        )
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
