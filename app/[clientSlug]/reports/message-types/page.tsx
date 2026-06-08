"use client"

import { useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, CalendarIcon, X, ChevronRight } from "lucide-react"
import { CiMessageTypesView } from "@/components/ci-message-types-view"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Star } from "lucide-react"
import { format } from "date-fns"

interface DateRange {
  from?: Date
  to?: Date
}

export default function MessageTypesPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedParty, setSelectedParty] = useState("all")
  const [selectedEntityType, setSelectedEntityType] = useState("all")
  const [selectedSenders, setSelectedSenders] = useState<string[]>([])
  const [senderSearch, setSenderSearch] = useState("")
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isFromCalendarOpen, setIsFromCalendarOpen] = useState(false)
  const [isToCalendarOpen, setIsToCalendarOpen] = useState(false)
  const [entityFilterOpen, setEntityFilterOpen] = useState(false)
  const [entityList, setEntityList] = useState<{ id: string; name: string }[]>([])
  const [subscribedEntityIds, setSubscribedEntityIds] = useState<string[]>([])

  const isEntityFollowed = (name: string) =>
    subscribedEntityIds.includes(entityList.find((e) => e.name === name)?.id ?? "")

  const filteredSenders = entityList
    .map((e) => e.name)
    .filter((s) => s.toLowerCase().includes(senderSearch.toLowerCase()))
    .sort((a, b) => {
      const aF = isEntityFollowed(a)
      const bF = isEntityFollowed(b)
      if (aF && !bF) return -1
      if (!aF && bF) return 1
      return a.localeCompare(b)
    })

  const isFiltersActive =
    selectedParty !== "all" || selectedEntityType !== "all" || selectedSenders.length > 0 || !!dateRange.from || !!dateRange.to

  const resetFilters = () => {
    setSelectedParty("all")
    setSelectedEntityType("all")
    setSelectedSenders([])
    setSenderSearch("")
    setDateRange({ from: undefined, to: undefined })
  }

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setUserRole(data.role ?? null)
        }
      } catch {
        setUserRole(null)
      } finally {
        setLoading(false)
      }
    }
    fetchSession()
  }, [])

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const [sendersRes, subsRes] = await Promise.all([
          fetch(`/api/competitive-insights/senders`, { credentials: "include" }),
          fetch(`/api/ci/subscriptions/check-all?clientSlug=${clientSlug}`, { credentials: "include" }),
        ])
        if (sendersRes.ok) {
          const data = await sendersRes.json()
          setEntityList(data.entities ?? [])
        }
        if (subsRes.ok) {
          const data = await subsRes.json()
          setSubscribedEntityIds(data.entityIds ?? [])
        }
      } catch {
        // silently fail
      }
    }
    fetchEntities()
  }, [clientSlug])

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  // Gate to super_admin only
  if (userRole !== "super_admin") {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground text-sm">You do not have access to this report.</p>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Message Types</h1>
          <p className="text-muted-foreground text-sm mt-1">
            AI-classified message intent across all campaigns — fundraising asks, urgency, match offers, surveys, and more.
          </p>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">

            {/* Party filter */}
            <Select value={selectedParty} onValueChange={setSelectedParty}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Party" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                <SelectItem value="Republican">Republican</SelectItem>
                <SelectItem value="Democrat">Democrat</SelectItem>
              </SelectContent>
            </Select>

            {/* Entity type filter */}
            <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="Entity type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="politician">Politicians</SelectItem>
                <SelectItem value="pac">PACs</SelectItem>
                <SelectItem value="organization">Organizations</SelectItem>
              </SelectContent>
            </Select>

            {/* Entity filter */}
            <Popover open={entityFilterOpen} onOpenChange={setEntityFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-between">
                  {selectedSenders.length === 0
                    ? "Filter by entity"
                    : `${selectedSenders.length} selected`}
                  <ChevronRight className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <div className="sticky top-0 z-50 bg-background p-2 border-b">
                  <Input
                    placeholder="Search entities..."
                    value={senderSearch}
                    onChange={(e) => setSenderSearch(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-[240px] overflow-y-auto p-2">
                  {selectedSenders.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full mb-2 text-xs"
                      onClick={() => setSelectedSenders([])}
                    >
                      Clear all ({selectedSenders.length})
                    </Button>
                  )}
                  {filteredSenders.filter((s) => s.trim() !== "").map((sender) => (
                    <div
                      key={sender}
                      className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                      onClick={() =>
                        setSelectedSenders((prev) =>
                          prev.includes(sender)
                            ? prev.filter((s) => s !== sender)
                            : [...prev, sender]
                        )
                      }
                    >
                      <Checkbox checked={selectedSenders.includes(sender)} onCheckedChange={() => {}} />
                      <span className="flex-1 truncate text-sm">{sender}</span>
                      {isEntityFollowed(sender) && (
                        <Badge
                          variant="outline"
                          className="text-xs bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
                        >
                          <Star className="h-3 w-3" />
                        </Badge>
                      )}
                    </div>
                  ))}
                  {filteredSenders.length === 0 && (
                    <div className="p-4 text-center text-sm text-muted-foreground">No entities found</div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Popover open={isFromCalendarOpen} onOpenChange={setIsFromCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from
                      ? format(dateRange.from, "MMM d, yyyy")
                      : <span className="text-muted-foreground">From</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.from}
                    onSelect={(date) => {
                      setDateRange((prev) => ({ ...prev, from: date }))
                      setIsFromCalendarOpen(false)
                    }}
                    numberOfMonths={1}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <span className="text-muted-foreground">-</span>

              <Popover open={isToCalendarOpen} onOpenChange={setIsToCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[140px] justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to
                      ? format(dateRange.to, "MMM d, yyyy")
                      : <span className="text-muted-foreground">To</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange.to}
                    onSelect={(date) => {
                      setDateRange((prev) => ({ ...prev, to: date }))
                      setIsToCalendarOpen(false)
                    }}
                    disabled={(date) => (dateRange.from ? date < dateRange.from : false)}
                    numberOfMonths={1}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {(dateRange.from || dateRange.to) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setDateRange({ from: undefined, to: undefined })}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {isFiltersActive && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-muted-foreground">
                Reset filters
              </Button>
            )}
          </div>
        </div>

        <CiMessageTypesView
          clientSlug={clientSlug}
          selectedSenders={selectedSenders}
          selectedParty={selectedParty}
          selectedEntityType={selectedEntityType}
          dateRange={dateRange}
        />
      </div>
    </AppLayout>
  )
}
