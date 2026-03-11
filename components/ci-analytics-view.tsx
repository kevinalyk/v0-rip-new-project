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
  PieChart,
  Pie,
  Cell,
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
  selectedMessageType: string
  dateRange: DateRange
  shouldShowPreview: boolean
}

interface AnalyticsData {
  totalEmails: number
  totalSMS: number
  mostActiveDay: string | null
  mostActiveHour: string | null
  dayOfWeekData: Array<{ day: string; count: number; intensity: number }>
  volumeData: Array<{ date: string; emails: number; sms: number; emailsAvg: number; smsAvg: number }>
  inboxingData: Array<{ name: string; value: number; count: number }>
  hasCampaigns: boolean
}

const INBOX_COLORS = ["#22c55e", "#ef4444"]

export function CiAnalyticsView({
  clientSlug,
  selectedSender,
  selectedPartyFilter,
  selectedMessageType,
  dateRange,
  shouldShowPreview,
}: CiAnalyticsViewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [chartDays, setChartDays] = useState<7 | 30 | 90 | 365>(7)

  useEffect(() => {
    fetchAnalytics()
  }, [selectedSender, selectedPartyFilter, selectedMessageType, dateRange, clientSlug])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientSlug) params.append("clientSlug", clientSlug)
      selectedSender.forEach((s) => params.append("sender", s))
      if (selectedPartyFilter && selectedPartyFilter !== "all") params.append("party", selectedPartyFilter)
      if (selectedMessageType && selectedMessageType !== "all") params.append("messageType", selectedMessageType)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())
      // Pass browser timezone so server can convert UTC → local for day/hour aggregation
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

  if (!data || !data.hasCampaigns) {
    return (
      <Card>
        <CardContent className="py-16">
          <div className="flex flex-col items-center justify-center text-center space-y-2">
            <p className="text-muted-foreground">No campaign data found for the selected filters.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

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
      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard
          label="Most Active Day"
          value={data.mostActiveDay ?? "—"}
          sub={`${data.dayOfWeekData.find((d) => d.day === data.mostActiveDay)?.count ?? 0} emails on this day`}
        />
        <StatCard
          label="Most Active Hour"
          value={data.mostActiveHour ?? "—"}
          sub="Hour of day with the most sends"
        />
      </div>

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
          {/* Volume Over Time */}
          {data.volumeData.length > 0 && (() => {
            const cutoff = new Date()
            cutoff.setDate(cutoff.getDate() - chartDays)
            const filteredVolume = data.volumeData.filter((d) => new Date(d.date) >= cutoff)
            return (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Content Volume Over Time</CardTitle>
                    <CardDescription>Daily email and SMS volume with 7-day moving average</CardDescription>
                  </div>
                  <div className="flex items-center gap-1 text-xs border rounded-md overflow-hidden shrink-0">
                    {([7, 30, 90, 365] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setChartDays(d)}
                        className={`px-3 py-1.5 transition-colors ${chartDays === d ? "bg-foreground text-background font-medium" : "hover:bg-muted text-muted-foreground"}`}
                      >
                        {d === 365 ? "1Y" : `${d}D`}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={filteredVolume} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Day of Week Activity */}
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

            {/* Inboxing Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Inboxing Rate</CardTitle>
                <CardDescription>Seed test inbox vs spam placement across tracked campaigns</CardDescription>
              </CardHeader>
              <CardContent>
                {data.inboxingData.length > 0 ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-[220px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.inboxingData}
                            cx="50%"
                            cy="50%"
                            outerRadius={85}
                            innerRadius={52}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}%`}
                            labelLine={true}
                          >
                            {data.inboxingData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={INBOX_COLORS[index % INBOX_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      {data.inboxingData.map((item, i) => (
                        <div key={item.name} className="flex items-center gap-2">
                          <span
                            className="inline-block w-3 h-3 rounded-full"
                            style={{ backgroundColor: INBOX_COLORS[i] }}
                          />
                          <span className="font-medium">{item.name}</span>
                          <span className="text-muted-foreground">
                            {item.value}% ({item.count.toLocaleString()} seed tests)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    No inboxing data available for these campaigns
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
