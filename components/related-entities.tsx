"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowRight, Loader2 } from "lucide-react"
import { buildDirectoryUrl } from "@/lib/directory-routing"

interface RelatedEntitiesProps {
  entityId: string
  entityName: string
  party: string | null
  state: string | null
}

interface RelatedCounts {
  partyCount: number
  stateCount: number
  statePartyCount: number
}

export function RelatedEntities({ entityId, entityName, party, state }: RelatedEntitiesProps) {
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

  return (
    <div className="mb-8">
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.label}
            href={link.url}
            className="group"
          >
            <Card className="h-full hover:border-foreground/50 hover:bg-accent/50 transition-all cursor-pointer">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium text-foreground group-hover:text-foreground transition-colors line-clamp-2">
                    {link.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground flex-shrink-0 mt-0.5 transition-colors" />
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {link.count.toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
