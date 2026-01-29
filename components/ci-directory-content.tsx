"use client"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, User, Users, Building2, Database, Mail } from "lucide-react"
import { toast } from "sonner"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"

interface CiDirectoryContentProps {
  clientSlug: string
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

export function CiDirectoryContent({ clientSlug }: CiDirectoryContentProps) {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterParty, setFilterParty] = useState<string>("all")
  const [filterState, setFilterState] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [staticTotalCount, setStaticTotalCount] = useState(0)
  const [totalCampaignCount, setTotalCampaignCount] = useState(0)
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
    const fetchStaticTotals = async () => {
      try {
        const [entitiesResponse, campaignsResponse] = await Promise.all([
          fetch(`/api/ci-entities?page=1&pageSize=1`),
          fetch(`/api/ci-entities?action=totalCampaigns`),
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

        const response = await fetch(`/api/ci-entities?${params.toString()}`)
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

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "politician":
        return <User className="h-5 w-5" />
      case "pac":
        return <Users className="h-5 w-5" />
      case "organization":
        return <Building2 className="h-5 w-5" />
      case "data_broker":
        return <Database className="h-5 w-5" />
      default:
        return <Mail className="h-5 w-5" />
    }
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

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "politician":
        return "bg-violet-700 text-white hover:bg-violet-800"
      case "pac":
        return "bg-amber-700 text-white hover:bg-amber-800"
      case "organization":
        return "bg-emerald-700 text-white hover:bg-emerald-800"
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
                  <SelectItem value="politician">Politician</SelectItem>
                  <SelectItem value="pac">PAC</SelectItem>
                  <SelectItem value="organization">Organization</SelectItem>
                  <SelectItem value="data_broker">Data Broker</SelectItem>
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
            <div className="space-y-3">
              {entities.map((entity) => (
                <div
                  key={entity.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex-shrink-0">{getEntityIcon(entity.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-lg">{entity.name}</div>
                      {entity.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{entity.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge className={getTypeBadgeColor(entity.type)}>{entity.type}</Badge>
                    {entity.party && <Badge className={getPartyBadgeClassName(entity.party)}>{entity.party}</Badge>}
                    {entity.state && <Badge variant="outline">{entity.state}</Badge>}
                    <Badge variant="secondary">{entity._count.totalCommunications} communications</Badge>
                  </div>
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
