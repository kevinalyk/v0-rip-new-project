"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react"
import { SUBJECT_PATTERNS, type SubjectPattern } from "@/lib/subject-line-classifier"
import { nameToSlug } from "@/lib/directory-utils"
import { format } from "date-fns"

interface PatternExample {
  id: string
  subject: string
  senderName: string
  senderEmail: string
  dateReceived: string
  inboxRate: number
  shareToken: string | null
  entityName: string | null
  entityParty: string | null
}

interface PatternStat {
  pattern: SubjectPattern
  label: string
  description: string
  count: number
  pct: number
  repCount: number
  demCount: number
  inboxCount: number
  spamCount: number
  avgInboxRate: number | null
  examples: PatternExample[]
}

interface SubjectPatternsData {
  total: number
  overallInboxRate: number | null
  patterns: PatternStat[]
}

interface DateRange {
  from?: Date
  to?: Date
}

interface CiSubjectPatternsViewProps {
  clientSlug: string
  selectedSender: string[]
  selectedPartyFilter: string
  selectedStateFilter: string
  dateRange: DateRange
}

// Pattern color palette — consistent across breakdown bar and table
const PATTERN_COLORS: Record<string, string> = {
  all_caps: "#ef4444",
  caps_word: "#f97316",
  question: "#eab308",
  exclamation: "#84cc16",
  short: "#22c55e",
  long: "#14b8a6",
  emoji: "#3b82f6",
  personalization: "#8b5cf6",
  number_dollar: "#ec4899",
  urgency: "#f43f5e",
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

function PartyBar({ repCount, demCount, total }: { repCount: number; demCount: number; total: number }) {
  if (total === 0) return <span className="text-muted-foreground text-sm">—</span>
  const repPct = Math.round((repCount / total) * 100)
  const demPct = Math.round((demCount / total) * 100)
  const otherPct = 100 - repPct - demPct
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-24 overflow-hidden rounded-full bg-muted">
        {repPct > 0 && (
          <div style={{ width: `${repPct}%`, backgroundColor: "#ef4444" }} title={`R: ${repPct}%`} />
        )}
        {demPct > 0 && (
          <div style={{ width: `${demPct}%`, backgroundColor: "#3b82f6" }} title={`D: ${demPct}%`} />
        )}
        {otherPct > 0 && (
          <div style={{ width: `${otherPct}%`, backgroundColor: "#94a3b8" }} title={`Other: ${otherPct}%`} />
        )}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {repPct}R / {demPct}D
      </span>
    </div>
  )
}

export function CiSubjectPatternsView({
  clientSlug,
  selectedSender,
  selectedPartyFilter,
  selectedStateFilter,
  dateRange,
}: CiSubjectPatternsViewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SubjectPatternsData | null>(null)
  const [expandedPattern, setExpandedPattern] = useState<SubjectPattern | null>(null)

  useEffect(() => {
    fetchData()
  }, [clientSlug, selectedSender, selectedPartyFilter, selectedStateFilter, dateRange])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientSlug) params.append("clientSlug", clientSlug)
      selectedSender.forEach((s) => params.append("sender", s))
      if (selectedPartyFilter && selectedPartyFilter !== "all") params.append("party", selectedPartyFilter)
      if (selectedStateFilter && selectedStateFilter !== "all") params.append("state", selectedStateFilter)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())

      const res = await fetch(`/api/ci/subject-patterns?${params.toString()}`, { credentials: "include" })
      if (res.ok) {
        setData(await res.json())
      }
    } catch (err) {
      console.error("[CiSubjectPatternsView] fetch error:", err)
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

  if (!data || data.total === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No subject line data available for the selected filters.
        </CardContent>
      </Card>
    )
  }

  const activePatterns = data.patterns.filter((p) => p.count > 0)
  const maxCount = Math.max(...activePatterns.map((p) => p.count), 1)

  return (
    <div className="space-y-6">
      {/* Breakdown Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Subject Line Pattern Breakdown</CardTitle>
          <CardDescription>
            Pattern frequency across {data.total.toLocaleString()} subject lines
            {data.overallInboxRate !== null && (
              <span className="ml-1">· Overall inbox rate: <strong>{data.overallInboxRate}%</strong></span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {activePatterns.map((p) => {
              const color = PATTERN_COLORS[p.pattern] ?? "#94a3b8"
              const barPct = (p.count / maxCount) * 100
              return (
                <div key={p.pattern} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{p.label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {p.count.toLocaleString()} ({p.pct}%)
                    </span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      style={{ width: `${barPct}%`, backgroundColor: color, transition: "width 0.4s ease" }}
                      className="rounded-full"
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Correlation Table */}
      <Card>
        <CardHeader>
          <CardTitle>Inbox Rate by Pattern</CardTitle>
          <CardDescription>
            How each subject line pattern correlates with inbox vs. spam placement. Click a row to see examples.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5">Pattern</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Count</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5 hidden sm:table-cell">% of All</th>
                  <th className="text-left font-medium text-muted-foreground px-4 py-2.5 hidden md:table-cell">Party Split</th>
                  <th className="text-right font-medium text-muted-foreground px-4 py-2.5">Inbox Rate</th>
                  <th className="px-2 py-2.5 hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {activePatterns.map((p) => {
                  const isExpanded = expandedPattern === p.pattern
                  const color = PATTERN_COLORS[p.pattern] ?? "#94a3b8"
                  return (
                    <>
                      <tr
                        key={p.pattern}
                        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => setExpandedPattern(isExpanded ? null : p.pattern)}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <div>
                              <div className="font-medium">{p.label}</div>
                              <div className="text-xs text-muted-foreground hidden sm:block">{p.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.count.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                          {p.pct}%
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <PartyBar repCount={p.repCount} demCount={p.demCount} total={p.count} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <InboxRateDelta patternRate={p.avgInboxRate} overallRate={data.overallInboxRate} />
                        </td>
                        <td className="px-2 py-3 hidden sm:table-cell">
                          <ChevronRight
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          />
                        </td>
                      </tr>
                      {isExpanded && p.examples.length > 0 && (
                        <tr key={`${p.pattern}-examples`} className="bg-muted/10">
                          <td colSpan={6} className="px-4 pb-4 pt-2">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                              Recent examples ({p.examples.length})
                            </div>
                            <div className="space-y-2">
                              {p.examples.map((ex) => (
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
                                          {ex.entityParty.charAt(0).toUpperCase() + ex.entityParty.slice(1, 1).toUpperCase()}
                                          {ex.entityParty.toLowerCase() === "republican" ? "R" : ex.entityParty.toLowerCase() === "democrat" ? "D" : ex.entityParty.charAt(0).toUpperCase()}
                                        </Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(ex.dateReceived), "MMM d, yyyy")}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    {ex.inboxRate > 0 && (
                                      <span className="text-xs tabular-nums text-muted-foreground">
                                        {Math.round(ex.inboxRate * 10) / 10}% inbox
                                      </span>
                                    )}
                                    {ex.shareToken && (
                                      <a
                                        href={`/rip/${ex.shareToken}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-primary hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        View
                                      </a>
                                    )}
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
              Baseline inbox rate across all {data.total.toLocaleString()} emails: <strong>{data.overallInboxRate}%</strong>.
              Arrows indicate inbox rate delta vs. baseline.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
