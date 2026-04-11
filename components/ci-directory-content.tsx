"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search } from "lucide-react"
import { toast } from "sonner"
import { CiEntitySubscribeButton } from "@/components/ci-entity-subscribe-button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

interface CiDirectoryContentProps {
  clientSlug: string
  isPublic?: boolean
}

interface Entity {
  id: string
  name: string
  type: string
  description: string | null
  party: string | null
  state: string | null
  _count: {
    campaigns: number
    smsMessages: number
    totalCommunications: number
    mappings: number
  }
}

export function CiDirectoryContent({ clientSlug, isPublic = false }: CiDirectoryContentProps) {
  const apiBase = isPublic ? "/api/public/ci-entities" : "/api/ci-entities"
  const router = useRouter()
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterParty, setFilterParty] = useState<string>("all")
  const [filterState, setFilterState] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [staticTotalCount, setStaticTotalCount] = useState(0)
  const [totalCampaignCount, setTotalCampaignCount] = useState(0)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
  })

  const US_STATES = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
  ]

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => setIsAuthenticated(r.ok))
      .catch(() => setIsAuthenticated(false))
  }, [])

  useEffect(() => {
    const fetchStaticTotals = async () => {
      try {
        const [entitiesResponse, campaignsResponse] = await Promise.all([
        fetch(`${apiBase}?page=1&pageSize=1`),
        fetch(`${apiBase}?action=totalCampaigns`),
        ])

        if (entitiesResponse.ok) {
          const data = await entitiesResponse.json()
          setStaticTotalCount(data.pagination.totalCount)
        }

        if (campaignsResponse.ok) {
          const data = await campaignsResponse.json()
          setTotalCampaignCount(data.totalCampaigns)
          console.log("[v0] Loaded total campaigns:", data.totalCampaigns)
        }
      } catch (error) {
        console.error("Error fetching static totals:", error)
      }
    }
    fetchStaticTotals()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({
          page: pagination.page.toString(),
          pageSize: pagination.pageSize.toString(),
        })

        if (filterParty !== "all") params.append("party", filterParty)
        if (filterState !== "all") params.append("state", filterState)
        if (filterType !== "all") params.append("type", filterType)
        if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim())

        console.log("[v0] Fetching entities with params:", params.toString())

        const response = await fetch(`${apiBase}?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
          console.log("[v0] Received entities:", data.entities.length, "Total count:", data.pagination.totalCount)
          setEntities(data.entities || [])
          setPagination(data.pagination)
        } else {
          toast.error("Failed to load entities")
        }
      } catch (error) {
        console.error("Error fetching entities:", error)
        toast.error("An error occurred while loading entities")
      } finally {
        setLoading(false)
      }
    }

    fetchEntities()
  }, [pagination.page, filterParty, filterState, filterType, debouncedSearch])

  const handleFilterChange = (type: "party" | "state" | "type", value: string) => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    if (type === "party") setFilterParty(value)
    if (type === "state") setFilterState(value)
    if (type === "type") setFilterType(value)
  }

  const getPartyBadgeClassName = (party: string | null) => {
    if (!party) return "capitalize bg-gray-600 text-white"
    switch (party.toLowerCase()) {
      case "republican":
        return "capitalize bg-red-600 text-white hover:bg-red-700"
      case "democrat":
        return "capitalize bg-blue-600 text-white hover:bg-blue-700"
      case "independent":
        return "capitalize bg-gray-600 text-white hover:bg-gray-700"
      default:
        return "capitalize bg-gray-600 text-white"
    }
  }

  const ABBREVIATIONS = new Set(["pac", "jfc", "rnc", "dnc", "nrcc", "dccc", "nrsc", "dscc", "fec"])

  const formatType = (type: string) => {
    return type
      .split("_")
      .map((word) => (ABBREVIATIONS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
      .join(" ")
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "candidate":
      case "politician":
        return "bg-slate-600 text-white hover:bg-slate-700"
      case "pac":
        return "bg-amber-700 text-white hover:bg-amber-800"
      case "organization":
        return "bg-emerald-700 text-white hover:bg-emerald-800"
      case "nonprofit":
        return "bg-cyan-700 text-white hover:bg-cyan-800"
      case "data_broker":
        return "bg-teal-700 text-white hover:bg-teal-800"
      default:
        return "bg-gray-600 text-white hover:bg-gray-700"
    }
  }

  const statistics = useMemo(() => {
    return {
      total: staticTotalCount,
      totalCampaigns: totalCampaignCount,
    }
  }, [staticTotalCount, totalCampaignCount])

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Entity Directory</h1>
        <p className="text-muted-foreground mt-2">Browse all entities currently tracked in the system.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Entities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statistics.totalCampaigns}</div>
            <p className="text-xs text-muted-foreground mt-1">Email & SMS combined</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>Find specific entities by name, party, state, or type</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by entity name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium mb-2 block">Party</label>
              <Select value={filterParty} onValueChange={(value) => handleFilterChange("party", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Parties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Parties</SelectItem>
                  <SelectItem value="republican">Republican</SelectItem>
                  <SelectItem value="democrat">Democrat</SelectItem>
                  <SelectItem value="independent">Independent</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">State</label>
              <Select value={filterState} onValueChange={(value) => handleFilterChange("state", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All States" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {US_STATES.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={filterType} onValueChange={(value) => handleFilterChange("type", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="candidate">Candidate</SelectItem>
                  <SelectItem value="pac">PAC</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="nonprofit">Nonprofit</SelectItem>
                  <SelectItem value="data_broker">Data Broker</SelectItem>
                  <SelectItem value="jfc">JFC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entities ({pagination.totalCount})</CardTitle>
          <CardDescription>
            {pagination.totalCount === 0 ? (
              "No entities match your filters"
            ) : (
              <>
                Showing {(pagination.page - 1) * pagination.pageSize + 1}-
                {Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading entities...</div>
          ) : entities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No entities found. Try adjusting your filters.</div>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              {/* Header row */}
              <div className="grid grid-cols-[2fr_1fr_1fr_80px_120px] items-center px-6 py-2.5 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Type</span>
                <span>Party</span>
                <span>State</span>
                <span className="text-right">{isAuthenticated ? "Follow" : ""}</span>
              </div>
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className="grid grid-cols-[2fr_1fr_1fr_80px_120px] items-center px-6 py-3 border-b last:border-b-0 hover:bg-accent/40 transition-colors cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-subscribe-button]")) return
                    router.push(`/directory/${nameToSlug(entity.name)}`)
                  }}
                >
                  <span className="font-medium text-sm">{entity.name}</span>
                  <span>
                    <Badge className={`${getTypeBadgeColor(entity.type)} text-xs`}>{formatType(entity.type)}</Badge>
                  </span>
                  <span>
                    {entity.party
                      ? <Badge className={`${getPartyBadgeClassName(entity.party)} text-xs capitalize`}>{entity.party}</Badge>
                      : <span className="text-muted-foreground text-xs">—</span>
                    }
                  </span>
                  <span className="text-sm text-muted-foreground">{entity.state ?? "—"}</span>
                  <span className="flex justify-end">
                    {isAuthenticated && (
                      <div data-subscribe-button>
                        <CiEntitySubscribeButton entityId={entity.id} entityName={entity.name} />
                      </div>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}

          {pagination.totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                      className={pagination.page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    const pageNum = i + 1
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPagination((prev) => ({ ...prev, page: pageNum }))}
                          isActive={pagination.page === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))
                      }
                      className={
                        pagination.page === pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
