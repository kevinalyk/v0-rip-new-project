"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Mail, Inbox, BarChart3, CalendarIcon } from "lucide-react"
import {
  Line,
  LineChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts"
import { ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { PaywallOverlay } from "@/components/paywall-overlay"

interface ReportingContentProps {
  isAdminView?: boolean
  clientSlug?: string
}

interface ReportingMetrics {
  totalCampaigns: number
  averageDeliveryRate: number
  averageInboxRate: number
  totalEmails: number
  totalInboxed: number
  providerBreakdown: Record<string, { total: number; inbox: number; spam: number }>
  trendData: Array<{ date: string; deliveryRate: number; inboxRate: number }>
  recentCampaigns: Array<{
    id: string
    subject: string
    sender: string
    sentDate: string
    deliveryRate: number
    inboxRate: number
  }>
}

export function ReportingContent({ isAdminView, clientSlug }: ReportingContentProps) {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [selectingDate, setSelectingDate] = useState<"start" | "end">("start")
  const [customDateRange, setCustomDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [metrics, setMetrics] = useState<ReportingMetrics | null>(null)
  const [subscriptionPlan, setSubscriptionPlan] = useState<"starter" | "professional" | "enterprise" | null>(null)
  const [loadingSubscription, setLoadingSubscription] = useState(true)

  useEffect(() => {
    fetchSubscriptionInfo()

    if (period === "custom" && (!customDateRange.from || !customDateRange.to)) {
      return
    }
    fetchReportingData()
  }, [period, customDateRange, clientSlug])

  useEffect(() => {
    if (period === "custom") {
      setCustomDateRange({ from: undefined, to: undefined })
      setSelectingDate("start")
    }
  }, [period])

  const fetchReportingData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()

      if (period === "custom" && customDateRange.from && customDateRange.to) {
        params.append("startDate", customDateRange.from.toISOString())
        params.append("endDate", customDateRange.to.toISOString())
      } else if (period !== "custom") {
        params.append("period", period)
      }

      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }

      console.log("[v0] Reporting: Fetching data with params:", params.toString())

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

      const response = await fetch(`/api/reporting?${params}`, {
        credentials: "include",
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Reporting data received:", data)
        setMetrics(data)
      } else {
        console.error("[v0] Reporting: Error fetching reports:", await response.text())
        setMetrics({
          totalCampaigns: 0,
          averageDeliveryRate: 0,
          averageInboxRate: 0,
          totalEmails: 0,
          totalInboxed: 0,
          providerBreakdown: {},
          trendData: [],
          recentCampaigns: [],
        })
      }
    } catch (error) {
      console.error("[v0] Reporting: Error fetching reporting data:", error)
      setMetrics({
        totalCampaigns: 0,
        averageDeliveryRate: 0,
        averageInboxRate: 0,
        totalEmails: 0,
        totalInboxed: 0,
        providerBreakdown: {},
        trendData: [],
        recentCampaigns: [],
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscriptionInfo = async () => {
    try {
      console.log("[v0] Reporting: Fetching subscription info for clientSlug:", clientSlug)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const url = clientSlug ? `/api/billing?clientSlug=${clientSlug}` : "/api/billing"

      const response = await fetch(url, {
        credentials: "include",
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        console.log("[v0] Reporting: Subscription data received:", data)
        const plan = data.client?.subscriptionPlan || (isAdminView ? "professional" : null)
        setSubscriptionPlan(plan)
        console.log("[v0] Reporting: Set subscriptionPlan to:", plan)
      } else {
        console.error("[v0] Reporting: Failed to fetch subscription info:", response.status)
        setSubscriptionPlan(isAdminView ? "professional" : "starter")
      }
    } catch (error) {
      console.error("[v0] Reporting: Error fetching subscription info:", error)
      setSubscriptionPlan(isAdminView ? "professional" : "starter")
    } finally {
      console.log("[v0] Reporting: Setting loadingSubscription to false")
      setLoadingSubscription(false)
    }
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return

    if (selectingDate === "start") {
      setCustomDateRange({ from: date, to: undefined })
      setSelectingDate("end")
    } else {
      setCustomDateRange((prev) => ({ ...prev, to: date }))
      setDatePickerOpen(false)
      setSelectingDate("start")
    }
  }

  const providerData = metrics?.providerBreakdown
    ? Object.entries(metrics.providerBreakdown).map(([provider, data]) => ({
        provider: provider.charAt(0).toUpperCase() + provider.slice(1),
        inboxRate: data.total > 0 ? (data.inbox / data.total) * 100 : 0,
        spamRate: data.total > 0 ? (data.spam / data.total) * 100 : 0,
        inbox: data.inbox,
        spam: data.spam,
        total: data.total,
      }))
    : []

  const getHealthColor = (rate: number) => {
    if (rate > 70) return "#22C55E" // Green
    if (rate >= 40) return "#EAB308" // Yellow
    return "#EF4444" // Red
  }

  const getHealthStatus = (rate: number) => {
    if (rate > 70) return "Healthy"
    if (rate >= 40) return "Warning"
    return "Critical"
  }

  const hasReportingAccess = subscriptionPlan !== "starter"

  console.log("[v0] Reporting: Paywall check - subscriptionPlan:", subscriptionPlan)
  console.log("[v0] Reporting: Paywall check - hasReportingAccess:", hasReportingAccess)
  console.log("[v0] Reporting: loading:", loading, "loadingSubscription:", loadingSubscription)

  if (loading || loadingSubscription) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-rip-red" />
      </div>
    )
  }

  if (!hasReportingAccess) {
    return (
      <div className="relative min-h-[600px]">
        <PaywallOverlay
          title="Unlock Analytics Dashboard"
          description="Get access to comprehensive reporting and analytics to track your email deliverability performance."
          features={[
            "Real-time deliverability metrics and trends",
            "Provider-specific performance insights",
            "Historical data and campaign comparisons",
            "Custom date range reporting",
            "Export reports and data",
          ]}
          currentPlan="starter"
          requiredPlan="professional"
          targetPlan="professional"
        />
        <div className="blur-md pointer-events-none">
          <div className="space-y-6 p-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i}>
                  <CardHeader className="space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Metric {i}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">--</div>
                    <p className="text-xs text-muted-foreground">Data unavailable</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Performance Charts</CardTitle>
              </CardHeader>
              <CardContent className="h-[300px] flex items-center justify-center">
                <p className="text-muted-foreground">Chart data unavailable</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No reporting data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Reporting Dashboard</h2>
          <p className="text-muted-foreground">Track your email deliverability performance over time</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>

          {period === "custom" && (
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[280px] justify-start text-left font-normal",
                    !customDateRange.from && !customDateRange.to && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {customDateRange.from && customDateRange.to ? (
                    <>
                      {format(customDateRange.from, "MMM d, yyyy")} - {format(customDateRange.to, "MMM d, yyyy")}
                    </>
                  ) : customDateRange.from ? (
                    <>{format(customDateRange.from, "MMM d, yyyy")} - Select end date</>
                  ) : (
                    <span>Select date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 space-y-2">
                  <p className="text-sm font-medium">
                    {selectingDate === "start" ? "Select Start Date" : "Select End Date"}
                  </p>
                  <Calendar
                    mode="single"
                    selected={selectingDate === "start" ? customDateRange.from : customDateRange.to}
                    onSelect={handleDateSelect}
                    disabled={(date) => {
                      if (selectingDate === "start") {
                        return date > new Date()
                      } else {
                        return date > new Date() || (customDateRange.from ? date < customDateRange.from : false)
                      }
                    }}
                    initialFocus
                  />
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCampaigns}</div>
            <p className="text-xs text-muted-foreground">Campaigns tested in period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Delivery Rate</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.averageDeliveryRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Average across all campaigns</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Inbox Rate</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.averageInboxRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Emails landing in inbox</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalEmails}</div>
            <p className="text-xs text-muted-foreground">{metrics.totalInboxed} reached inbox</p>
          </CardContent>
        </Card>
      </div>

      {providerData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Health</CardTitle>
            <CardDescription>Real-time health status for each email provider</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {providerData.map((provider) => {
                const healthColor = getHealthColor(provider.inboxRate)
                const healthStatus = getHealthStatus(provider.inboxRate)

                return (
                  <div key={provider.provider} className="flex flex-col items-center space-y-2">
                    <div className="relative w-full h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart
                          cx="50%"
                          cy="70%"
                          innerRadius="60%"
                          outerRadius="100%"
                          barSize={12}
                          data={[{ value: provider.inboxRate, fill: healthColor }]}
                          startAngle={180}
                          endAngle={0}
                        >
                          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                          <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={10} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pt-12">
                        <span className="text-2xl font-bold" style={{ color: healthColor }}>
                          {provider.inboxRate.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-semibold">{provider.provider}</p>
                      <p className="text-xs text-muted-foreground">{provider.total} emails</p>
                      <p className="text-xs font-medium" style={{ color: healthColor }}>
                        {healthStatus}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend Chart */}
      {metrics.trendData && metrics.trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deliverability Trends</CardTitle>
            <CardDescription>Track your delivery and inbox rates over time</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                deliveryRate: {
                  label: "Delivery Rate",
                  color: "#EF4444",
                },
                inboxRate: {
                  label: "Inbox Rate",
                  color: "#64748B",
                },
              }}
              className="h-[300px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    }
                    className="text-muted-foreground"
                  />
                  <YAxis domain={[0, 100]} className="text-muted-foreground" tickFormatter={(value) => `${value}%`} />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid gap-2">
                              <div className="flex flex-col">
                                <span className="text-[0.70rem] uppercase text-muted-foreground">{data.name}</span>
                                <span className="font-bold text-[#EF4444]">
                                  {data.deliveryRate.toFixed(1)}% Delivery
                                </span>
                                <span className="font-bold text-[#64748B]">{data.inboxRate.toFixed(1)}% Inbox</span>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="deliveryRate"
                    stroke="#EF4444"
                    name="Delivery Rate"
                    strokeWidth={3}
                    dot={{ r: 6, strokeWidth: 2, fill: "#EF4444" }}
                    activeDot={{ r: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="inboxRate"
                    stroke="#64748B"
                    name="Inbox Rate"
                    strokeWidth={3}
                    dot={{ r: 6, strokeWidth: 2, fill: "#64748B" }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Provider Performance */}
      {providerData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Performance</CardTitle>
            <CardDescription>Inbox vs spam placement by email provider</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{
                inboxRate: {
                  label: "Inbox",
                  color: "#64748B",
                },
                spamRate: {
                  label: "Spam",
                  color: "#EF4444",
                },
              }}
              className="h-[300px] w-full"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providerData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="provider" className="text-muted-foreground" />
                  <YAxis domain={[0, 100]} className="text-muted-foreground" />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border bg-background p-2 shadow-sm">
                            <div className="grid gap-2">
                              <div className="flex flex-col">
                                <span className="text-[0.70rem] uppercase text-muted-foreground">{data.provider}</span>
                                <span className="font-bold text-[#64748B]">
                                  {data.inboxRate.toFixed(1)}% inbox ({data.inbox} emails)
                                </span>
                                <span className="font-bold text-[#EF4444]">
                                  {data.spamRate.toFixed(1)}% spam ({data.spam} emails)
                                </span>
                                <span className="text-[0.70rem] text-muted-foreground">{data.total} total emails</span>
                              </div>
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="inboxRate"
                    stackId="a"
                    fill="#64748B"
                    name="Inbox"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={80}
                  />
                  <Bar
                    dataKey="spamRate"
                    stackId="a"
                    fill="#EF4444"
                    name="Spam"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={80}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Campaigns Table */}
      {metrics.recentCampaigns && metrics.recentCampaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Campaigns</CardTitle>
            <CardDescription>Your most recent campaign performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {metrics.recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between border-b pb-4 last:border-0">
                  <div className="space-y-1">
                    <p className="font-medium">{campaign.subject}</p>
                    <p className="text-sm text-muted-foreground">
                      {campaign.sender} • {new Date(campaign.sentDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-sm font-medium">{campaign.deliveryRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Delivery</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-600">{campaign.inboxRate.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Inbox</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
