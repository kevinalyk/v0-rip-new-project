"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import useSWR from "swr"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Search, ArrowRight, MapPin, X, Mail, MessageSquare, Activity, Clock } from "lucide-react"
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
import type { StateActivity } from "@/components/us-interactive-map"

// Dynamically import map to avoid SSR issues
const USInteractiveMap = dynamic(
  () => import("@/components/us-interactive-map").then((m) => m.USInteractiveMap),
  { ssr: false }
)

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const ABBREV_TO_FULL: Record<string, string> = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", FL:"Florida", GA:"Georgia",
  HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa", KS:"Kansas",
  KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland", MA:"Massachusetts",
  MI:"Michigan", MN:"Minnesota", MS:"Mississippi", MO:"Missouri", MT:"Montana",
  NE:"Nebraska", NV:"Nevada", NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico",
  NY:"New York", NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont",
  VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
  DC:"District of Columbia",
}

const FULL_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(ABBREV_TO_FULL).map(([k, v]) => [v, k])
)

interface StateEmail {
  id: string
  subject: string
  senderName: string | null
  senderEmail: string
  createdAt: string
  entity: { id: string; name: string; imageUrl: string | null; type: string } | null
}

interface StateSms {
  id: string
  message: string | null
  phoneNumber: string | null
  createdAt: string
  entity: { id: string; name: string; imageUrl: string | null; type: string } | null
}

interface StateItemsData {
  emails: StateEmail[]
  smsMessages: StateSms[]
  state: string
  since: string
}

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
  // Commented out for future use
  // const [staticTotalCount, setStaticTotalCount] = useState(0)
  // const [totalCampaignCount, setTotalCampaignCount] = useState(0)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
  })

  // Map state — drives both the map highlight and the entity filter
  const [selectedMapState, setSelectedMapState] = useState<string | null>(null)

  const US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY",
  ]

  // Map activity data
  const { data: mapData, isLoading: mapLoading } = useSWR<{ activity: StateActivity[]; since: string }>(
    "/api/ci/map-activity",
    fetcher,
    { refreshInterval: 60_000 }
  )
  const activity: StateActivity[] = mapData?.activity ?? []
  const totalActive = activity.length
  const totalEmails = activity.reduce((s, a) => s + a.emailCount, 0)
  const totalSms = activity.reduce((s, a) => s + a.smsCount, 0)

  // Selected state abbrev for the side panel & entity filter
  const selectedStateAbbrev = selectedMapState ? FULL_TO_ABBREV[selectedMapState] : null
  const selectedActivity = selectedMapState
    ? activity.find((a) => ABBREV_TO_FULL[a.state] === selectedMapState)
    : null

  // State items (emails + SMS) for the right panel
  const { data: stateItemsData, isLoading: stateItemsLoading } = useSWR<StateItemsData>(
    selectedStateAbbrev ? `/api/ci/map-state-items?state=${selectedStateAbbrev}` : null,
    fetcher,
    { revalidateOnFocus: false }
  )

  // When map state changes, sync the entity state filter
  useEffect(() => {
    if (selectedMapState) {
      const abbrev = FULL_TO_ABBREV[selectedMapState]
      setFilterState(abbrev ?? "all")
    } else {
      setFilterState("all")
    }
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [selectedMapState])

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => setIsAuthenticated(r.ok))
      .catch(() => setIsAuthenticated(false))
  }, [])

  // Commented out — total stat cards hidden for now, will be brought back
  // useEffect(() => {
  //   const fetchStaticTotals = async () => {
  //     try {
  //       const [entitiesResponse, campaignsResponse] = await Promise.all([
  //         fetch(`${apiBase}?page=1&pageSize=1`),
  //         fetch(`${apiBase}?action=totalCampaigns`),
  //       ])
  //       if (entitiesResponse.ok) {
  //         const data = await entitiesResponse.json()
  //         setStaticTotalCount(data.pagination.totalCount)
  //       }
  //       if (campaignsResponse.ok) {
  //         const data = await campaignsResponse.json()
  //         setTotalCampaignCount(data.totalCampaigns)
  //       }
  //     } catch (error) {
  //       console.error("Error fetching static totals:", error)
  //     }
  //   }
  //   fetchStaticTotals()
  // }, [])

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

        const response = await fetch(`${apiBase}?${params.toString()}`)
        if (response.ok) {
          const data = await response.json()
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
    if (type === "state") {
      setFilterState(value)
      // Sync the map highlight — convert abbrev back to full name
      if (value === "all") {
        setSelectedMapState(null)
      } else {
        const fullName = ABBREV_TO_FULL[value] ?? value
        setSelectedMapState(fullName)
      }
    }
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
      .map((word) =>
        ABBREVIATIONS.has(word.toLowerCase())
          ? word.toUpperCase()
          : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
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

  // Commented out — will be re-enabled when stat cards come back
  // const statistics = useMemo(() => ({
  //   total: staticTotalCount,
  //   totalCampaigns: totalCampaignCount,
  // }), [staticTotalCount, totalCampaignCount])

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Entity Directory</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Browse all entities currently tracked in the system.</p>
        </div>
        <div className="flex items-center gap-2">
          {!mapLoading && totalActive > 0 && (
            <>
              <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                <Activity className="h-3 w-3 text-[#EB3847]" />
                {totalActive} active state{totalActive !== 1 ? "s" : ""}
              </Badge>
              {totalEmails > 0 && (
                <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                  <Mail className="h-3 w-3" />
                  {totalEmails} email{totalEmails !== 1 ? "s" : ""}
                </Badge>
              )}
              {totalSms > 0 && (
                <Badge variant="outline" className="flex items-center gap-1.5 text-xs">
                  <MessageSquare className="h-3 w-3" />
                  {totalSms} SMS
                </Badge>
              )}
            </>
          )}
          {selectedMapState && (
            <div className="flex items-center gap-1.5 ml-2">
              <Badge variant="secondary" className="flex items-center gap-1.5 px-3 py-1 text-sm">
                <MapPin className="h-3 w-3 text-[#EB3847]" />
                {selectedMapState}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedMapState(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── MAP + RIGHT PANEL ── */}
      {/* ── MAP + RIGHT PANEL ── */}
      <div className="flex gap-4 px-6 pt-4 pb-2" style={{ height: "calc(100vh - 260px)" }}>
        {/* Map */}
        <div className="flex-1 min-w-0 h-full">
          <Card className="h-full">
            <CardContent className="p-3 h-full">
              <USInteractiveMap
                selectedState={selectedMapState}
                onStateSelect={setSelectedMapState}
                activityData={activity}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right panel */}
        <div className="w-64 shrink-0 flex flex-col gap-3 overflow-y-auto h-full">
          {selectedMapState ? (
            /* State detail: emails + SMS */
            <Card className="flex flex-col h-full">
              <CardHeader className="pb-2 pt-3 px-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 text-[#EB3847] shrink-0" />
                    <CardTitle className="text-sm font-semibold truncate">{selectedMapState}</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setSelectedMapState(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {selectedActivity && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {selectedActivity.emailCount} email{selectedActivity.emailCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> {selectedActivity.smsCount} SMS
                    </Badge>
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0 flex-1 overflow-y-auto">
                {stateItemsLoading ? (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">Loading...</div>
                ) : (
                  <div className="divide-y divide-border">
                    {/* Emails */}
                    <div className="px-4 py-3">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        <Mail className="h-3 w-3" /> Emails ({stateItemsData?.emails.length ?? 0})
                      </h3>
                      {!stateItemsData?.emails.length ? (
                        <p className="text-xs text-muted-foreground">No emails in the last 3h.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {stateItemsData.emails.map((email) => (
                            <div key={email.id} className="rounded-md border border-border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                              <div className="flex items-start gap-2">
                                {email.entity?.imageUrl ? (
                                  <img src={email.entity.imageUrl} alt={email.entity.name} className="h-6 w-6 rounded-full object-cover shrink-0 mt-0.5" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-[#EB3847]/15 flex items-center justify-center shrink-0 mt-0.5">
                                    <Mail className="h-3 w-3 text-[#EB3847]" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate leading-snug">{email.subject || "(No subject)"}</p>
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {email.entity?.name ?? email.senderName ?? email.senderEmail}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {new Date(email.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    {" · "}
                                    {new Date(email.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* SMS */}
                    <div className="px-4 py-3">
                      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        <MessageSquare className="h-3 w-3" /> SMS ({stateItemsData?.smsMessages.length ?? 0})
                      </h3>
                      {!stateItemsData?.smsMessages.length ? (
                        <p className="text-xs text-muted-foreground">No SMS in the last 3h.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {stateItemsData.smsMessages.map((sms) => (
                            <div key={sms.id} className="rounded-md border border-border bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors">
                              <div className="flex items-start gap-2">
                                {sms.entity?.imageUrl ? (
                                  <img src={sms.entity.imageUrl} alt={sms.entity.name} className="h-6 w-6 rounded-full object-cover shrink-0 mt-0.5" />
                                ) : (
                                  <div className="h-6 w-6 rounded-full bg-[#EB3847]/15 flex items-center justify-center shrink-0 mt-0.5">
                                    <MessageSquare className="h-3 w-3 text-[#EB3847]" />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate">{sms.entity?.name ?? sms.phoneNumber ?? "Unknown sender"}</p>
                                  {sms.message && (
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{sms.message}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5 shrink-0" />
                                    {new Date(sms.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    {" · "}
                                    {new Date(sms.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Default: top states + legend */
            <>
              {activity.length > 0 && (
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Top States (3h)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1.5">
                    {[...activity]
                      .sort((a, b) => b.total - a.total)
                      .slice(0, 5)
                      .map((item) => (
                        <div key={item.state} className="flex items-center justify-between text-sm">
                          <button
                            className="text-left hover:text-[#EB3847] transition-colors font-medium text-xs"
                            onClick={() => setSelectedMapState(ABBREV_TO_FULL[item.state] ?? item.state)}
                          >
                            {ABBREV_TO_FULL[item.state] ?? item.state}
                          </button>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {item.emailCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <Mail className="h-3 w-3" />{item.emailCount}
                              </span>
                            )}
                            {item.smsCount > 0 && (
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="h-3 w-3" />{item.smsCount}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-1 pt-3 px-3">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Legend
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-3 pb-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#EB3847] animate-pulse shrink-0" />
                    Pulsing = activity in last 3h
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded bg-[#EB3847] shrink-0" />
                    Red fill = selected state
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Click a state to filter below.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ── COMMENTED OUT: Total stat cards — will be re-enabled ──
      <div className="grid gap-4 md:grid-cols-2 px-6 mb-6">
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
      */}

      {/* ── COMMENTED OUT: Search & Filter card — will be re-enabled ──
      <Card className="mx-6 mb-6">
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
                <SelectTrigger><SelectValue placeholder="All Parties" /></SelectTrigger>
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
                <SelectTrigger><SelectValue placeholder="All States" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {US_STATES.map((state) => (
                    <SelectItem key={state} value={state}>{state}</SelectItem>
                  ))}
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Type</label>
              <Select value={filterType} onValueChange={(value) => handleFilterChange("type", value)}>
                <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
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
      */}

      {/* ── ENTITY TABLE ── */}
      <div className="px-6 pb-6 pt-4">
        {/* Search + filters bar — spread evenly across full width */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-full"
            />
          </div>

          <Select value={filterParty} onValueChange={(value) => handleFilterChange("party", value)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
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

          <Select value={filterState} onValueChange={(value) => handleFilterChange("state", value)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {US_STATES.map((state) => (
                <SelectItem key={state} value={state}>{state}</SelectItem>
              ))}
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterType} onValueChange={(value) => handleFilterChange("type", value)}>
            <SelectTrigger className="flex-1 h-9 text-sm">
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

          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {pagination.totalCount === 0
              ? "No entities match"
              : <>Showing {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount}</>
            }
          </span>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading entities...</div>
            ) : entities.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No entities found. Try adjusting your filters.</div>
            ) : (
              <div className="rounded-lg overflow-hidden">
                {/* Header row */}
                <div className="grid grid-cols-[2fr_1fr_1fr_80px_120px_80px] items-center px-6 py-2.5 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Party</span>
                  <span>State</span>
                  <span className="text-right">{isAuthenticated ? "Follow" : ""}</span>
                  <span></span>
                </div>
                {entities.map((entity) => (
                  <div
                    key={entity.id}
                    className="grid grid-cols-[2fr_1fr_1fr_80px_120px_80px] items-center px-6 py-3 border-b last:border-b-0 hover:bg-accent/40 transition-colors cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("[data-subscribe-button]")) return
                      if ((e.target as HTMLElement).closest("[data-view-button]")) return
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
                    <span className="flex justify-end" data-view-button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/directory/${nameToSlug(entity.name)}`)
                        }}
                      >
                        View <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

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
      </div>
    </div>
  )
}
