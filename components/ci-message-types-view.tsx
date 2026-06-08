"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, TrendingDown, Minus, ChevronRight, ExternalLink } from "lucide-react"
import { format } from "date-fns"

interface TypeExample {
  id: string
  subject: string
  senderName: string
  senderEmail: string
  dateReceived: string
  inboxRate: number
  shareToken: string | null
  entityName: string | null
  entityParty: string | null
  entityState: string | null
}

interface TypeStat {
  type: string
  label: string
  count: number
  pct: number
  repCount: number
  demCount: number
  inboxCount: number
  spamCount: number
  avgInboxRate: number | null
  examples: TypeExample[]
}

interface MessageTypesData {
  total: number
  classifiedTotal: number
  overallInboxRate: number | null
  types: TypeStat[]
}

interface DateRange {
  from?: Date
  to?: Date
}

interface CiMessageTypesViewProps {
  clientSlug: string
  selectedSenders: string[]
  selectedParty: string
  selectedEntityType: string
  dateRange: DateRange
}

// Distinct color per message type — consistent across chart and table
const TYPE_COLORS: Record<string, string> = {
  fundraising_ask:   "#ef4444",
  urgency_deadline:  "#f97316",
  match_offer:       "#f59e0b",
  survey_poll:       "#84cc16",
  petition:          "#22c55e",
  event_invite:      "#14b8a6",
  news_update:       "#3b82f6",
  personal_story:    "#8b5cf6",
  attack_opposition: "#ec4899",
  thank_you:         "#06b6d4",
  membership_offer:  "#a855f7",
  merchandise:       "#64748b",
}

function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? "#94a3b8"
}

function PartyBar({ repCount, demCount, total }: { repCount: number; demCount: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground text-sm">—</span>
  const repPct = Math.round((repCount / total) * 100)
  const demPct = Math.round((demCount / total) * 100)
  const otherPct = 100 - repPct - demPct
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-24 overflow-hidden rounded-full bg-muted">
        {repPct > 0 && <div style={{ width: `${repPct}%`, backgroundColor: "#ef4444" }} title={`R: ${repPct}%`} />}
        {demPct > 0 && <div style={{ width: `${demPct}%`, backgroundColor: "#3b82f6" }} title={`D: ${demPct}%`} />}
        {otherPct > 0 && <div style={{ width: `${otherPct}%`, backgroundColor: "#94a3b8" }} title={`Other: ${otherPct}%`} />}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">{repPct}R / {demPct}D</span>
    </div>
  )
}

function InboxRateDelta({
  patternRate,
  overallRate,
}: {
  patternRate: number | null
  overallRate: number | null
}) {
  if (patternRate === null || overallRate === null) {
    return <span className="text-muted-foreground text-sm">—</span>
  }
  const delta = Math.round((patternRate - overallRate) * 10) / 10
  if (Math.abs(delta) < 0.5) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm text-muted-foreground">
        <Minus className="w-3 h-3" />
        {patternRate}%
      </span>
    )
  }
  if (delta > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-sm text-green-600 font-medium">
        <TrendingUp className="w-3 h-3" />
        {patternRate}%
        <span className="text-xs font-normal text-muted-foreground ml-1">(+{delta}%)</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-sm text-red-500 font-medium">
      <TrendingDown className="w-3 h-3" />
      {patternRate}%
      <span className="text-xs font-normal text-muted-foreground ml-1">({delta}%)</span>
    </span>
  )
}

export function CiMessageTypesView({
  clientSlug,
  selectedSenders,
  selectedParty,
  selectedEntityType,
  dateRange,
}: CiMessageTypesViewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MessageTypesData | null>(null)
  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)

  const handleView = async (e: React.MouseEvent, id: string, shareToken: string | null) => {
    e.stopPropagation()
    if (shareToken) {
      window.open(`/share/${shareToken}`, "_blank")
      return
    }
    setViewingId(id)
    try {
      const res = await fetch(`/api/ci-campaigns/${id}/share`, { method: "POST", credentials: "include" })
      if (!res.ok) throw new Error()
      const data = await res.json()
      window.open(`/share/${data.shareToken}`, "_blank")
    } catch {
      // silently fail
    } finally {
      setViewingId(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [clientSlug, selectedSenders, selectedParty, selectedEntityType, dateRange])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientSlug) params.append("clientSlug", clientSlug)
      selectedSenders.forEach((s) => params.append("sender", s))
      if (selectedParty && selectedParty !== "all") params.append("party", selectedParty)
      if (selectedEntityType && selectedEntityType !== "all") params.append("entityType", selectedEntityType)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())

      const res = await fetch(`/api/ci/message-types?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error("[CiMessageTypesView] fetch error:", err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.classifiedTotal === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No classified message type data available for the selected filters.
          {data && data.total > 0 && (
            <p className="mt-2 text-xs">
              {data.total.toLocaleString()} campaigns in corpus — classification runs at ingest on new emails.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  const maxCount = Math.max(...data.types.map((t) => t.count), 1)
  const classifiedPct = Math.round((data.classifiedTotal / data.total) * 100)

  return (
    <div className="space-y-6">
      {/* Frequency bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>Message Type Frequency</CardTitle>
          <CardDescription>
            How often each message type appears across {data.classifiedTotal.toLocaleString()} classified campaigns.
            A campaign may have multiple types.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.types.map((t) => {
              const color = getTypeColor(t.type)
              const barPct = (t.count / maxCount) * 100
              const repPct = t.count > 0 ? Math.round((t.repCount / t.count) * 100) : 0
              const demPct = t.count > 0 ? Math.round((t.demCount / t.count) * 100) : 0
              return (
                <div key={t.type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="font-medium">{t.label}</span>
                      <span className="text-xs text-muted-foreground hidden md:inline">
                        {repPct}R / {demPct}D
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      {t.count.toLocaleString()} ({t.pct}%)
                    </span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    {/* Stacked R/D bar */}
                    {t.count > 0 && (
                      <>
                        <div
                          style={{
                            width: `${(t.repCount / maxCount) * 100}%`,
                            backgroundColor: "#ef4444",
                            opacity: 0.85,
                            transition: "width 0.4s ease",
                          }}
                        />
                        <div
                          style={{
                            width: `${(t.demCount / maxCount) * 100}%`,
                            backgroundColor: "#3b82f6",
                            opacity: 0.85,
                            transition: "width 0.4s ease",
                          }}
                        />
                        {t.count - t.repCount - t.demCount > 0 && (
                          <div
                            style={{
                              width: `${((t.count - t.repCount - t.demCount) / maxCount) * 100}%`,
                              backgroundColor: "#94a3b8",
                              opacity: 0.6,
                              transition: "width 0.4s ease",
                            }}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 opacity-85" />
              Republican
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-500 opacity-85" />
              Democrat
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-400 opacity-60" />
              Other
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inbox rate correlation table */}
      <Card>
        <CardHeader>
          <CardTitle>Inbox Rate by Message Type</CardTitle>
          <CardDescription>
            How each message type correlates with inbox placement. Click a row to see examples.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Type</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Count</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">% of Classified</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Party Split</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Inbox Rate</th>
                  <th className="px-2 py-2.5 hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {data.types.map((t) => {
                  const isExpanded = expandedType === t.type
                  const color = getTypeColor(t.type)
                  return (
                    <>
                      <tr
                        key={t.type}
                        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setExpandedType(isExpanded ? null : t.type)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="font-medium">{t.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {t.pct}%
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <PartyBar repCount={t.repCount} demCount={t.demCount} total={t.count} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <InboxRateDelta patternRate={t.avgInboxRate} overallRate={data.overallInboxRate} />
                        </td>
                        <td className="px-2 py-3 hidden sm:table-cell">
                          <ChevronRight
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </td>
                      </tr>
                      {isExpanded && t.examples.length > 0 && (
                        <tr key={`${t.type}-examples`} className="bg-muted/10">
                          <td colSpan={6} className="px-4 pb-4 pt-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                              Recent examples ({t.examples.length})
                            </div>
                            <div className="space-y-2">
                              {t.examples.map((ex) => (
                                <div
                                  key={ex.id}
                                  className="flex items-start justify-between gap-3 rounded-lg border bg-background px-3 py-2.5"
                                >
                                  <div className="min-w-0">
                                    <div className="font-medium text-sm leading-snug truncate">{ex.subject}</div>
                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                      {ex.entityName && (
                                        <span className="text-xs text-muted-foreground">{ex.entityName}</span>
                                      )}
                                      {ex.entityParty && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 py-0"
                                          style={{
                                            borderColor:
                                              ex.entityParty.toLowerCase() === "republican"
                                                ? "#ef4444"
                                                : ex.entityParty.toLowerCase() === "democrat"
                                                  ? "#3b82f6"
                                                  : undefined,
                                            color:
                                              ex.entityParty.toLowerCase() === "republican"
                                                ? "#ef4444"
                                                : ex.entityParty.toLowerCase() === "democrat"
                                                  ? "#3b82f6"
                                                  : undefined,
                                          }}
                                        >
                                          {ex.entityParty.toLowerCase() === "republican"
                                            ? "R"
                                            : ex.entityParty.toLowerCase() === "democrat"
                                              ? "D"
                                              : ex.entityParty.charAt(0).toUpperCase()}
                                        </Badge>
                                      )}
                                      {ex.entityState && (
                                        <span className="text-xs text-muted-foreground">{ex.entityState}</span>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(ex.dateReceived), "MMM d, yyyy")}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                      onClick={(e) => handleView(e, ex.id, ex.shareToken)}
                                      disabled={viewingId === ex.id}
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-wait"
                                    >
                                      {viewingId === ex.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <ExternalLink className="w-3 h-3" />
                                      )}
                                      View
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
          {data.overallInboxRate !== null && (
            <div className="px-4 py-3 border-t text-xs text-muted-foreground">
              Baseline inbox rate across {data.classifiedTotal.toLocaleString()} classified emails:{" "}
              <strong>{data.overallInboxRate}%</strong>. Arrows show inbox rate delta vs. baseline.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
