"use client"

import { useMemo, useState } from "react"
import { Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export interface SlackPickerEntity {
  id: string
  name: string
  party?: string | null
  state?: string | null
}

interface SlackEntityPickerProps {
  entities: SlackPickerEntity[]
  selectedIds: Set<string>
  onToggle: (entityId: string) => void
  onClearAll: () => void
  /** Entities the org already follows on the CI Feed - shown with a star badge, same as the CI filter. */
  followedEntityIds?: Set<string>
  loading?: boolean
  className?: string
}

// Same search + checkbox-list pattern as the "Filter by entity" dropdown on the CI Feed
// (components/competitive-insights.tsx), reused here so Slack setup and the CI Feed feel
// like the same product. Selected entities are pinned to the top so a long list doesn't
// bury what's already chosen.
export function SlackEntityPicker({
  entities,
  selectedIds,
  onToggle,
  onClearAll,
  followedEntityIds,
  loading,
  className,
}: SlackEntityPickerProps) {
  const [searchTerm, setSearchTerm] = useState("")

  // Freeze the "selected first" ordering to how things looked when this picker was opened
  // (this component remounts each time the panel opens/closes). Toggling an entity mid-session
  // must NOT reshuffle the list - it only re-sorts the next time the picker is reopened.
  const [orderSnapshot] = useState(() => new Set(selectedIds))

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    const list = term ? entities.filter((e) => e.name.toLowerCase().includes(term)) : entities

    // Selected-at-open first (alphabetical within group), then everyone else (alphabetical).
    return [...list].sort((a, b) => {
      const aSelected = orderSnapshot.has(a.id)
      const bSelected = orderSnapshot.has(b.id)
      if (aSelected !== bSelected) return aSelected ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [entities, searchTerm, orderSnapshot])

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <Input
          placeholder="Search entities..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-9"
        />
        {selectedIds.size > 0 && (
          <Button variant="ghost" size="sm" className="shrink-0 text-xs" onClick={onClearAll}>
            Clear all ({selectedIds.size})
          </Button>
        )}
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-md border p-2">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading entities...</div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No entities found</div>
        ) : (
          filtered.map((entity) => (
            <div
              key={entity.id}
              className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
              onClick={() => onToggle(entity.id)}
            >
              <Checkbox
                checked={selectedIds.has(entity.id)}
                // The row's onClick already toggles selection. Without stopping propagation
                // here, clicking directly on the box fires both this and the row handler,
                // which cancel each other out - net effect: no change, so the box appears unclickable.
                onClick={(e) => {
                  e.stopPropagation()
                  onToggle(entity.id)
                }}
                onCheckedChange={() => {}}
              />
              <span className="flex-1 truncate text-sm">{entity.name}</span>
              {followedEntityIds?.has(entity.id) && (
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
                >
                  <Star className="h-3 w-3" />
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
