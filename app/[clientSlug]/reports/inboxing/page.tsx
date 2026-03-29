"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { CalendarIcon, Loader2, RefreshCw, RotateCcw, X } from "lucide-react"
import { format } from "date-fns"
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend,
} from "recharts"

const INBOX_COLORS = ["#22c55e", "#ef4444"]

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface InboxingData {
  name: string
  value: number
}

interface InboxingTimeDataPoint {
  date: string
  inboxRate: number | null
  spamRate: number | null
  inboxAvg: number | null
  spamAvg: number | null
}

export default function InboxingPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  const [inboxingData, setInboxingData] = useState<InboxingData[]>([])
  const [inboxingTimeData, setInboxingTimeData] = useState<InboxingTimeDataPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [chartDays, setChartDays] = useState<7 | 30 | 90 | 365>(30)
  const [selectedState, setSelectedState] = useState("all")
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isFromCalendarOpen, setIsFromCalendarOpen] = useState(false)
  const [isToCalendarOpen, setIsToCalendarOpen] = useState(false)

  const isFiltersActive =
    selectedState !== "all" || !!dateRange.from || !!dateRange.to

  const handleChartDaysChange = (d: 7 | 30 | 90 | 365) => {
    setChartDays(d)
    // Clear custom date range when a preset period is selected
    setDateRange({ from: undefined, to: undefined })
  }

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      const qp = new URLSearchParams()
      qp.append("clientSlug", clientSlug)
      // Use custom date range if set, otherwise use the preset period
      if (dateRange.from || dateRange.to) {
        if (dateRange.from) qp.append("fromDate", dateRange.from.toISOString())
        if (dateRange.to) qp.append("toDate", dateRange.to.toISOString())
      } else {
        qp.append("chartDays", String(chartDays))
      }
      if (selectedState !== "all") qp.append("state", selectedState)

      const res = await fetch(`/api/ci/analytics?${qp}`, { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setInboxingData(data.inboxingData?.length ? data.inboxingData : [])
        setInboxingTimeData(data.inboxingTimeData?.length ? data.inboxingTimeData : [])
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug, chartDays, selectedState, dateRange])

  const resetFilters = () => {
    setSelectedState("all")
    setDateRange({ from: undefined, to: undefined })
    setChartDays(30)
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Inboxing Report</h1>
            <p className="text-muted-foreground">Email placement and deliverability analysis</p>
          </div>
          <div className="flex items-center gap-1 text-xs border rounded-md overflow-hidden shrink-0">
            {([7, 30, 90, 365] as const).map((d) => (
              <button
                key={d}
                onClick={() => handleChartDaysChange(d)}
                className={`px-3 py-1.5 transition-colors ${chartDays === d && !dateRange.from && !dateRange.to ? "bg-foreground text-background font-medium" : "hover:bg-muted text-muted-foreground"}`}
              >
                {d === 365 ? "1Y" : `${d}D`}
              </button>
            ))}
          </div>
        </div>

        {/* Filter bar */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* State filter */}
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Filter by state" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                <SelectItem value="all">All States</SelectItem>
                {US_STATES.map((state) => (
                  <SelectItem key={state} value={state}>
                    {state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Popover open={isFromCalendarOpen} onOpenChange={setIsFromCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-[140px] justify-start text-left font-normal bg-transparent"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      format(dateRange.from, "MMM d, yyyy")
                    ) : (
                      <span className="text-muted-foreground">From</span>
                    )}
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
                  <Button
                    variant="outline"
                    className="w-[140px] justify-start text-left font-normal bg-transparent"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.to ? (
                      format(dateRange.to, "MMM d, yyyy")
                    ) : (
                      <span className="text-muted-foreground">To</span>
                    )}
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
                    disabled={(date) => {
                      if (dateRange.from) return date < dateRange.from
                      return false
                    }}
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

            {/* Refresh */}
            <Button
              variant="outline"
              onClick={() => fetchData(true)}
              className="w-full md:w-auto bg-transparent"
              disabled={refreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>

            {/* Reset */}
            <Button
              variant="outline"
              onClick={resetFilters}
              className="w-full md:w-auto bg-transparent"
              disabled={!isFiltersActive}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Filters
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Overall Deliverability</CardTitle>
            <CardDescription>
              {dateRange.from || dateRange.to
                ? `Inbox vs spam rate${dateRange.from ? ` from ${format(dateRange.from, "MMM d, yyyy")}` : ""}${dateRange.to ? ` to ${format(dateRange.to, "MMM d, yyyy")}` : ""}`
                : `Inbox vs spam rate across all tracked emails (last ${chartDays === 365 ? "year" : `${chartDays} days`})`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[280px] flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : inboxingData.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
                      <Pie
                        data={inboxingData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={48}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}%`}
                        labelLine={true}
                      >
                        {inboxingData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={INBOX_COLORS[index % INBOX_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [`${value}%`]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  {inboxingData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ backgroundColor: INBOX_COLORS[i] }}
                      />
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
          No placement data available
          </div>
          )}
          </CardContent>
          </Card>

          {/* Inbox Rate Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Inbox Rate Over Time</CardTitle>
              <CardDescription>
                Daily inbox vs spam rate with 7-day moving average
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[320px] flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : inboxingTimeData.filter((d) => d.inboxRate !== null).length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={inboxingTimeData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => {
                        const d = new Date(v + "T00:00:00")
                        return `${d.getMonth() + 1}/${d.getDate()}`
                      }}
                      interval="preserveStartEnd"
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tickFormatter={(v: number) => `${v}%`}
                      domain={[0, 100]}
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        value != null ? `${value}%` : "—",
                        name,
                      ]}
                      labelFormatter={(label: string) => {
                        const d = new Date(label + "T00:00:00")
                        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                      }}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                    <Line
                      type="monotone"
                      dataKey="inboxRate"
                      name="Inbox"
                      stroke="#22c55e"
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="spamRate"
                      name="Spam"
                      stroke="#ef4444"
                      dot={{ r: 2 }}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="inboxAvg"
                      name="Inbox (7d avg)"
                      stroke="#22c55e"
                      strokeDasharray="5 4"
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="spamAvg"
                      name="Spam (7d avg)"
                      stroke="#ef4444"
                      strokeDasharray="5 4"
                      dot={false}
                      strokeWidth={1.5}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-muted-foreground text-sm">
                  No placement data available for this period
                </div>
              )}
            </CardContent>
          </Card>
          </div>
          </AppLayout>
  )
}
