"use client"

import { useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, CalendarIcon, X, ChevronRight } from "lucide-react"
import { CiComparisonsView } from "@/components/ci-comparisons-view"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"

interface DateRange {
  from?: Date
  to?: Date
}

// US state options (abbreviated)
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","Nationwide",
]

export default function ComparisonsPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  // Filters
  const [selectedParty, setSelectedParty] = useState("all")
  const [selectedState, setSelectedState] = useState("all")
  const [selectedEntityType, setSelectedEntityType] = useState("all")
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isFromCalendarOpen, setIsFromCalendarOpen] = useState(false)
  const [isToCalendarOpen, setIsToCalendarOpen] = useState(false)

  const isFiltersActive =
    selectedParty !== "all" ||
    selectedState !== "all" ||
    selectedEntityType !== "all" ||
    !!dateRange.from ||
    !!dateRange.to

  const resetFilters = () => {
    setSelectedParty("all")
    setSelectedState("all")
    setSelectedEntityType("all")
    setDateRange({ from: undefined, to: undefined })
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Sender Comparisons</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Compare top senders across volume, inbox rate, cadence, donation platform, subject patterns, and message types.
          </p>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">

            {/* Party */}
            <Select value={selectedParty} onValueChange={setSelectedParty}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="All Parties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Parties</SelectItem>
                <SelectItem value="republican">Republican</SelectItem>
                <SelectItem value="democrat">Democrat</SelectItem>
                <SelectItem value="independent">Independent</SelectItem>
              </SelectContent>
            </Select>

            {/* Entity type */}
            <Select value={selectedEntityType} onValueChange={setSelectedEntityType}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="politician">Politicians</SelectItem>
                <SelectItem value="pac">PACs</SelectItem>
                <SelectItem value="organization">Organizations</SelectItem>
              </SelectContent>
            </Select>

            {/* State */}
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent className="max-h-[260px]">
                <SelectItem value="all">All States</SelectItem>
                {US_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
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

        <CiComparisonsView
          clientSlug={clientSlug}
          selectedParty={selectedParty}
          selectedState={selectedState}
          selectedEntityType={selectedEntityType}
          dateRange={dateRange}
        />
      </div>
    </AppLayout>
  )
}
