"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { PaywallOverlay } from "@/components/paywall-overlay"

interface DateRange {
  from?: Date
  to?: Date
}

interface CiAnalyticsViewProps {
  clientSlug: string
  selectedSender: string[]
  selectedPartyFilter: string
  selectedStateFilter: string
  selectedMessageType: string
  selectedDonationPlatform: string
  dateRange: DateRange
  shouldShowPreview: boolean
  showThirdParty: boolean
  showHouseFileOnly: boolean
  externalChartDays?: 7 | 30 | 90 | 365 // When provided (reporting view), buttons are in the parent header
}


export function CiAnalyticsView({
  clientSlug,
  selectedSender,
  selectedPartyFilter,
  selectedStateFilter,
  selectedMessageType,
  selectedDonationPlatform,
  dateRange,
  shouldShowPreview,
  showThirdParty,
  showHouseFileOnly,
  externalChartDays,
}: CiAnalyticsViewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [localChartDays, setLocalChartDays] = useState<7 | 30 | 90 | 365>(7)
  // Use external value when provided (reporting view), otherwise use local state (CI feed)
  const chartDays = externalChartDays ?? localChartDays
  const setChartDays = externalChartDays !== undefined ? () => {} : setLocalChartDays

  useEffect(() => {
    fetchAnalytics()
  }, [selectedSender, selectedPartyFilter, selectedStateFilter, selectedMessageType, selectedDonationPlatform, dateRange, clientSlug, chartDays, showThirdParty, showHouseFileOnly])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientSlug) params.append("clientSlug", clientSlug)
      selectedSender.forEach((s) => params.append("sender", s))
      if (selectedPartyFilter && selectedPartyFilter !== "all") params.append("party", selectedPartyFilter)
      if (selectedStateFilter && selectedStateFilter !== "all") params.append("state", selectedStateFilter)
      // showThirdParty / showHouseFileOnly take precedence over the generic messageType
      if (showThirdParty) {
        params.append("messageType", "third_party")
      } else if (showHouseFileOnly) {
        params.append("messageType", "house_file_only")
      } else if (selectedMessageType && selectedMessageType !== "all") {
        params.append("messageType", selectedMessageType)
      }
      if (selectedDonationPlatform && selectedDonationPlatform !== "all") params.append("platform", selectedDonationPlatform)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())
      params.append("chartDays", String(chartDays))
      params.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)

      const res = await fetch(`/api/ci/analytics?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error("[CiAnalyticsView] fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasEntity = selectedSender.length > 0

  const StatCard = ({ label, value, sub }: { label: string; value: string | number; sub: string }) => (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* Stat cards — always visible when data exists */}
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            label="Most Active Day"
            value={data.mostActiveDay ?? "—"}
            sub={`${data.dayOfWeekData.find((d) => d.day === data.mostActiveDay)?.count ?? 0} sends on this day`}
          />
          <StatCard
            label="Most Active Hour"
            value={data.mostActiveHour ?? "—"}
            sub="Hour of day with the most sends"
          />
        </div>
      )}

      {/* Paywall overlay for non-enterprise/CI users */}
      {shouldShowPreview ? (
        <div className="relative">
          <div className="blur-sm pointer-events-none space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Content Volume Over Time</CardTitle>
                <CardDescription>Daily email and SMS volume with 7-day moving average</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80 bg-muted/20 rounded" />
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Day of Week Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-40 bg-muted/20 rounded" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Inboxing Rate</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-40 bg-muted/20 rounded" />
                </CardContent>
              </Card>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <PaywallOverlay
              title="Unlock Full Analytics"
              description="Upgrade to Enterprise or add Competitive Insights to access detailed reporting."
              features={[
                "Content volume trends with moving average",
                "Day of week activity heatmap",
                "Inbox vs spam rate breakdown",
                "Hour-of-day send patterns",
              ]}
              clientSlug={clientSlug}
              variant="blur"
            />
          </div>
        </div>
      ) : (
        <>
          {/* Volume Over Time — always visible */}
          {(data?.volumeData?.length ?? 0) > 0 && (() => {
            return (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Content Volume Over Time</CardTitle>
                    <CardDescription>Daily email and SMS volume with 7-day moving average</CardDescription>
                  </div>
                  {externalChartDays === undefined && (
                    <div className="flex items-center gap-1 text-xs border rounded-md overflow-hidden shrink-0">
                      {([7, 30, 90, 365] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setLocalChartDays(d)}
                          className={`px-3 py-1.5 transition-colors ${chartDays === d ? "bg-foreground text-background font-medium" : "hover:bg-muted text-muted-foreground"}`}
                        >
                          {d === 365 ? "1Y" : `${d}D`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.volumeData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(v) => {
                          const d = new Date(v)
                          return `${d.getMonth() + 1}/${d.getDate()}`
                        }}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                        }}
                        labelFormatter={(v) => new Date(v as string).toLocaleDateString()}
                      />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="emails"
                        stroke="#ef4444"
                        strokeWidth={2}
                        name="Emails"
                        dot={{ fill: "#ef4444", r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="sms"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        name="SMS"
                        dot={{ fill: "#3b82f6", r: 3 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="emailsAvg"
                        stroke="#fca5a5"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="Emails (7d avg)"
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="smsAvg"
                        stroke="#93c5fd"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        name="SMS (7d avg)"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            )
          })()}

          {data?.dayOfWeekData?.some((d) => d.count > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Day of Week Activity</CardTitle>
                <CardDescription>Email and SMS volume by day of the week</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-7 gap-2">
                  {data.dayOfWeekData.map((dayData) => {
                    const bgOpacity = Math.max(0.08, dayData.intensity)
                    const backgroundColor = `rgba(239, 68, 68, ${bgOpacity})`
                    return (
                      <div
                        key={dayData.day}
                        className="flex flex-col items-center justify-center p-3 rounded-lg border transition-all hover:scale-105"
                        style={{ backgroundColor }}
                      >
                        <div className="text-xs font-medium text-foreground mb-1">{dayData.day.slice(0, 3)}</div>
                        <div className="text-xl font-bold text-foreground">{dayData.count}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">sends</div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {data?.hourOfDayData?.some((h) => h.count > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Content by Hour of Day</CardTitle>
                <CardDescription>
                  Send volume by hour — darker cells indicate busier hours
                  <span className="ml-2 text-xs text-muted-foreground">(EST)</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Bar chart — fixed pixel height container with absolute-positioned bars */}
                <div className="relative w-full mb-4" style={{ height: 112 }}>
                  <div className="absolute inset-0 flex items-end gap-px">
                    {data.hourOfDayData.map((h) => {
                      const heightPx = Math.max(4, Math.round(h.intensity * 112))
                      const bgOpacity = Math.max(0.18, h.intensity)
                      return (
                        <div key={h.hour} className="flex-1 relative group" style={{ height: heightPx }}>
                          <div
                            className="w-full h-full rounded-t transition-all"
                            style={{ backgroundColor: `rgba(239, 68, 68, ${bgOpacity})` }}
                          />
                          {/* Tooltip */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                            <div className="bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap shadow-md">
                              <span className="font-medium">{h.label}</span>
                              <span className="text-muted-foreground ml-1">— {h.count} sends</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Heat map row — 24 cells with count on hover */}
                <div className="grid gap-px mb-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                  {data.hourOfDayData.map((h) => {
                    const bgOpacity = Math.max(0.1, h.intensity)
                    return (
                      <div
                        key={h.hour}
                        className="relative flex flex-col items-center justify-center rounded-sm transition-all group cursor-default"
                        style={{ height: 40, backgroundColor: `rgba(239, 68, 68, ${bgOpacity})` }}
                      >
                        <span className="text-xs font-bold text-white leading-none">{h.count > 0 ? h.count : ""}</span>
                        {/* Tooltip */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                          <div className="bg-popover border rounded px-2 py-1 text-xs whitespace-nowrap shadow-md">
                            <span className="font-medium">{h.label}</span>
                            <span className="text-muted-foreground ml-1">{h.count} sends</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Hour labels — show every 6 hours */}
                <div className="grid text-xs text-muted-foreground" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                  {data.hourOfDayData.map((h) => (
                    <div key={h.hour} className="text-center">
                      {h.hour % 6 === 0
                        ? h.hour === 0
                          ? "12a"
                          : h.hour === 12
                            ? "12p"
                            : h.hour < 12
                              ? `${h.hour}a`
                              : `${h.hour - 12}p`
                        : ""}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
