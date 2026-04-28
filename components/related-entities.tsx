"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { buildDirectoryUrl } from "@/lib/directory-routing"

interface RelatedEntitiesProps {
  entityId: string
  entityName: string
  party: string | null
  state: string | null
  /** If true, render as inline badges/pills for display next to stats. If false, render as cards. */
  inline?: boolean
}

interface RelatedCounts {
  partyCount: number
  stateCount: number
  statePartyCount: number
}

export function RelatedEntities({ entityId, entityName, party, state, inline = false }: RelatedEntitiesProps) {
  const [counts, setCounts] = useState<RelatedCounts | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await fetch(`/api/related-entities-count?entityId=${entityId}&party=${party || ""}&state=${state || ""}`)
        if (response.ok) {
          const data = await response.json()
          setCounts(data)
        }
      } catch (error) {
        console.error("[v0] Failed to fetch related entities counts:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchCounts()
  }, [entityId, party, state])

  if (loading || !counts) {
    return null
  }

  // Build links only for entities that have a count > 0
  const links: Array<{
    label: string
    url: string
    count: number
  }> = []

  // Party link (always available if party exists)
  if (party && counts.partyCount > 0) {
    links.push({
      label: `See more ${party.toLowerCase()}s`,
      url: buildDirectoryUrl({ party }),
      count: counts.partyCount,
    })
  }

  // State link (only if state exists and there are results)
  if (state && counts.stateCount > 0) {
    links.push({
      label: `See more ${state} politicians`,
      url: buildDirectoryUrl({ state }),
      count: counts.stateCount,
    })
  }

  // State + Party combo link (only if both exist and there are results)
  if (state && party && counts.statePartyCount > 0) {
    links.push({
      label: `See more ${state} ${party.toLowerCase()}s`,
      url: buildDirectoryUrl({ state, party }),
      count: counts.statePartyCount,
    })
  }

  // If no links were generated (edge case), don't render anything
  if (links.length === 0) {
    return null
  }

  if (inline) {
    // Render as small inline links without wrapping (nowrap), no counts
    return (
      <div className="flex gap-3 items-center flex-nowrap overflow-x-auto">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.url}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border/50 hover:border-foreground/30 hover:bg-accent/30 transition-all text-sm whitespace-nowrap flex-shrink-0"
          >
            <span className="text-foreground group-hover:text-foreground transition-colors">
              {link.label}
            </span>
            <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-foreground flex-shrink-0 transition-colors" />
          </Link>
        ))}
      </div>
    )
  }

  return null
}
