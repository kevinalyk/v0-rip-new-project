"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Mail,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  X,
  BarChart2,
  Users,
} from "lucide-react"
import { format } from "date-fns"
import Image from "next/image"
import type { EntityProfile, SortField } from "@/app/api/ci/comparisons/route"

// ─── Label maps ──────────────────────────────────────────────────────────────

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  fundraising_ask:   "Fundraising Ask",
  urgency_deadline:  "Urgency / Deadline",
  match_offer:       "Match Offer",
  survey_poll:       "Survey / Poll",
  petition:          "Petition",
  event_invite:      "Event Invite",
  news_update:       "News Update",
  personal_story:    "Personal Story",
  attack_opposition: "Attack / Opposition",
  thank_you:         "Thank You",
  membership_offer:  "Membership Offer",
  merchandise:       "Merchandise",
}

const SUBJECT_PATTERN_LABELS: Record<string, string> = {
  personalization:  "Personalization",
  question:         "Question",
  urgency:          "Urgency",
  emoji:            "Emoji",
  number:           "Number",
  all_caps:         "All Caps",
  brackets:         "Brackets",
  forward_reply:    "Fwd / Re:",
  cliffhanger:      "Cliffhanger",
}

const PLATFORM_LABELS: Record<string, string> = {
  winred:   "WinRed",
  actblue:  "ActBlue",
  anedot:   "Anedot",
  psq:      "PSQ",
}

const CHIP_COLORS: Record<string, string> = {
  "Match-Heavy":         "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Urgency-Driven":      "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "Fundraising-Focused": "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Survey-Heavy":        "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  "Attack-Oriented":     "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
  "News-Driven":         "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "High Personalization":"bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Emoji-Heavy":         "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  "Question-Led":        "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  "High Frequency":      "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  "Low Frequency":       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  "Strong Inbox":        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Spam Prone":          "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  "SMS Only":            "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "SMS-First":           "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  "Email Only":          "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function partyColor(party: string | null) {
  const p = (party ?? "").toLowerCase()
  if (p === "republican") return "text-red-500 border-red-400"
  if (p === "democrat") return "text-blue-500 border-blue-400"
  return "text-muted-foreground border-border"
}

function partyInitial(party: string | null) {
  const p = (party ?? "").toLowerCase()
  if (p === "republican") return "R"
  if (p === "democrat") return "D"
  return "I"
}

function inboxRateColor(rate: number | null) {
  if (rate === null) return "text-muted-foreground"
  if (rate >= 80) return "text-green-500"
  if (rate >= 55) return "text-yellow-500"
  return "text-red-500"
}

function InboxDelta({ rate, baseline }: { rate: number | null; baseline: number | null }) {
  if (rate === null) return <span className="text-muted-foreground">—</span>
  if (baseline === null) return <span className={inboxRateColor(rate)}>{rate}%</span>
  const delta = Math.round((rate - baseline) * 10) / 10
  const Icon = Math.abs(delta) < 0.5 ? Minus : delta > 0 ? TrendingUp : TrendingDown
  const color = Math.abs(delta) < 0.5 ? "text-muted-foreground" : delta > 0 ? "text-green-500" : "text-red-500"
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${inboxRateColor(rate)}`}>
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      {rate}%
      {Math.abs(delta) >= 0.5 && (
        <span className={`text-xs font-normal ${color}`}>
          ({delta > 0 ? "+" : ""}{delta}%)
        </span>
      )}
    </span>
  )
}

function EntityAvatar({ entity }: { entity: EntityProfile }) {
  const [imgFailed, setImgFailed] = useState(false)
  if (entity.entityImageUrl && !imgFailed) {
    return (
      <div className="relative w-10 h-10 rounded-full overflow-hidden border border-border flex-shrink-0">
        <Image
          src={entity.entityImageUrl}
          alt={entity.entityName}
          fill
          className="object-cover"
          onError={() => setImgFailed(true)}
        />
      </div>
    )
  }
  return (
    <div
      className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 ${partyColor(entity.entityParty)}`}
    >
      {partyInitial(entity.entityParty)}
    </div>
  )
}

// ─── Side-by-side detail panel ───────────────────────────────────────────────

function ComparisonPanel({
  left,
  right,
  baseline,
  onClose,
}: {
  left: EntityProfile
  right: EntityProfile
  baseline: number | null
  onClose: () => void
}) {
  const rows: Array<{
    label: string
    leftVal: React.ReactNode
    rightVal: React.ReactNode
  }> = [
    {
      label: "Total Volume",
      leftVal: left.totalVolume.toLocaleString(),
      rightVal: right.totalVolume.toLocaleString(),
    },
    {
      label: "Emails",
      leftVal: (
        <span className="inline-flex items-center gap-1">
          <Mail className="w-3.5 h-3.5" /> {left.emailCount.toLocaleString()}
        </span>
      ),
      rightVal: (
        <span className="inline-flex items-center gap-1">
          <Mail className="w-3.5 h-3.5" /> {right.emailCount.toLocaleString()}
        </span>
      ),
    },
    {
      label: "SMS",
      leftVal: (
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" /> {left.smsCount.toLocaleString()}
        </span>
      ),
      rightVal: (
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="w-3.5 h-3.5" /> {right.smsCount.toLocaleString()}
        </span>
      ),
    },
    {
      label: "Avg Inbox Rate",
      leftVal: <InboxDelta rate={left.avgInboxRate} baseline={baseline} />,
      rightVal: <InboxDelta rate={right.avgInboxRate} baseline={baseline} />,
    },
    {
      label: "Avg Send Cadence",
      leftVal: left.avgCadenceDays !== null ? `${left.avgCadenceDays}d` : "—",
      rightVal: right.avgCadenceDays !== null ? `${right.avgCadenceDays}d` : "—",
    },
    {
      label: "Top Donation Platform",
      leftVal: left.topDonationPlatform ? (PLATFORM_LABELS[left.topDonationPlatform] ?? left.topDonationPlatform) : "—",
      rightVal: right.topDonationPlatform ? (PLATFORM_LABELS[right.topDonationPlatform] ?? right.topDonationPlatform) : "—",
    },
  ]

  return (
    <Card className="mt-4 border-2 border-primary/30">
      <CardHeader className="pb-3 flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Side-by-Side Comparison</CardTitle>
          <CardDescription>
            {left.entityName} vs. {right.entityName}
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header row */}
        <div className="grid grid-cols-3 border-b bg-muted/30">
          <div className="px-4 py-2.5" />
          <div className="px-4 py-2.5 border-l">
            <div className="flex items-center gap-2">
              <EntityAvatar entity={left} />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{left.entityName}</p>
                <p className="text-xs text-muted-foreground">{left.entityState}</p>
              </div>
            </div>
          </div>
          <div className="px-4 py-2.5 border-l">
            <div className="flex items-center gap-2">
              <EntityAvatar entity={right} />
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">{right.entityName}</p>
                <p className="text-xs text-muted-foreground">{right.entityState}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Data rows */}
        {rows.map((row, i) => (
          <div key={row.label} className={`grid grid-cols-3 ${i < rows.length - 1 ? "border-b" : ""}`}>
            <div className="px-4 py-3 text-sm text-muted-foreground font-medium">{row.label}</div>
            <div className="px-4 py-3 border-l text-sm">{row.leftVal}</div>
            <div className="px-4 py-3 border-l text-sm">{row.rightVal}</div>
          </div>
        ))}

        {/* Strategy chips */}
        <div className="grid grid-cols-3 border-t">
          <div className="px-4 py-3 text-sm text-muted-foreground font-medium">Strategy Profile</div>
          {[left, right].map((e) => (
            <div key={e.entityId} className="px-4 py-3 border-l">
              <div className="flex flex-wrap gap-1">
                {e.strategyChips.length > 0 ? (
                  e.strategyChips.map((chip) => (
                    <span
                      key={chip}
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${CHIP_COLORS[chip] ?? "bg-muted text-foreground"}`}
                    >
                      {chip}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Top message types */}
        <div className="grid grid-cols-3 border-t">
          <div className="px-4 py-3 text-sm text-muted-foreground font-medium">Top Message Types</div>
          {[left, right].map((e) => (
            <div key={e.entityId} className="px-4 py-3 border-l space-y-1">
              {e.topMessageTypes.length > 0 ? (
                e.topMessageTypes.map((t) => (
                  <div key={t.type} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{MESSAGE_TYPE_LABELS[t.type] ?? t.type}</span>
                    <span className="text-muted-foreground tabular-nums">{t.pct}%</span>
                  </div>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          ))}
        </div>

        {/* Recent subjects */}
        <div className="grid grid-cols-3 border-t">
          <div className="px-4 py-3 text-sm text-muted-foreground font-medium">Recent Subjects</div>
          {[left, right].map((e) => (
            <div key={e.entityId} className="px-4 py-3 border-l space-y-1.5">
              {e.recentSubjects.length > 0 ? (
                e.recentSubjects.slice(0, 4).map((s, i) => (
                  <p key={i} className="text-xs leading-snug text-foreground/80 truncate">{s}</p>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">—</span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Leaderboard row ─────────────────────────────────────────────────────────

function LeaderboardRow({
  entity,
  rank,
  baseline,
  isSelected,
  compareCount,
  onSelect,
  onExpand,
  isExpanded,
}: {
  entity: EntityProfile
  rank: number
  baseline: number | null
  isSelected: boolean
  compareCount: number
  onSelect: () => void
  onExpand: () => void
  isExpanded: boolean
}) {
  const canSelect = isSelected || compareCount < 2

  return (
    <div className={`border-b last:border-0 transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Rank */}
        <div className="w-7 text-center text-sm font-mono text-muted-foreground flex-shrink-0">
          {rank}
        </div>

        {/* Avatar */}
        <EntityAvatar entity={entity} />

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{entity.entityName}</span>
            {entity.entityState && (
              <span className="text-xs text-muted-foreground">{entity.entityState}</span>
            )}
            <span className="text-xs text-muted-foreground capitalize">{entity.entityType}</span>
          </div>
          {/* Strategy chips */}
          <div className="flex flex-wrap gap-1 mt-1">
            {entity.strategyChips.map((chip) => (
              <span
                key={chip}
                className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${CHIP_COLORS[chip] ?? "bg-muted text-foreground"}`}
              >
                {chip}
              </span>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Volume</p>
            <p className="text-sm font-semibold tabular-nums">{entity.totalVolume.toLocaleString()}</p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5">
              <Mail className="w-3 h-3" />{entity.emailCount}
              <MessageSquare className="w-3 h-3 ml-1" />{entity.smsCount}
            </div>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Inbox Rate</p>
            <InboxDelta rate={entity.avgInboxRate} baseline={baseline} />
          </div>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Cadence</p>
            <p className="text-sm font-semibold tabular-nums">
              {entity.avgCadenceDays !== null ? `${entity.avgCadenceDays}d` : "—"}
            </p>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Platform</p>
            <p className="text-sm font-semibold">
              {entity.topDonationPlatform
                ? (PLATFORM_LABELS[entity.topDonationPlatform] ?? entity.topDonationPlatform)
                : "—"}
            </p>
          </div>

          <div className="w-28">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Top Types</p>
            <div className="space-y-0.5">
              {entity.topMessageTypes.slice(0, 2).map((t) => (
                <div key={t.type} className="flex items-center justify-between text-xs">
                  <span className="truncate text-foreground/70">{MESSAGE_TYPE_LABELS[t.type] ?? t.type}</span>
                  <span className="text-muted-foreground ml-1 tabular-nums">{t.pct}%</span>
                </div>
              ))}
              {entity.topMessageTypes.length === 0 && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant={isSelected ? "default" : "outline"}
            size="sm"
            className="text-xs h-7 px-2.5"
            onClick={(e) => { e.stopPropagation(); onSelect() }}
            disabled={!canSelect}
            title={isSelected ? "Remove from comparison" : compareCount >= 2 ? "Already comparing 2 senders" : "Add to comparison"}
          >
            {isSelected ? "Selected" : "Compare"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onExpand() }}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t bg-muted/10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Top Subject Patterns</p>
              <div className="space-y-1">
                {entity.topSubjectPatterns.length > 0 ? (
                  entity.topSubjectPatterns.map((p) => (
                    <div key={p.pattern} className="flex items-center justify-between text-xs">
                      <span>{SUBJECT_PATTERN_LABELS[p.pattern] ?? p.pattern}</span>
                      <span className="text-muted-foreground tabular-nums">{p.pct}%</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No pattern data</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Message Type Breakdown</p>
              <div className="space-y-1">
                {entity.topMessageTypes.length > 0 ? (
                  entity.topMessageTypes.map((t) => (
                    <div key={t.type} className="flex items-center justify-between text-xs">
                      <span>{MESSAGE_TYPE_LABELS[t.type] ?? t.type}</span>
                      <span className="text-muted-foreground tabular-nums">{t.pct}%</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">No type data</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent Subjects</p>
              <div className="space-y-1.5">
                {entity.recentSubjects.slice(0, 4).map((s, i) => (
                  <p key={i} className="text-xs leading-snug text-foreground/80 truncate">{s}</p>
                ))}
                {entity.recentSubjects.length === 0 && (
                  <span className="text-xs text-muted-foreground">No recent emails</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DateRange { from?: Date; to?: Date }

interface CiComparisonsViewProps {
  clientSlug: string
  selectedParty: string
  selectedState: string
  selectedEntityType: string
  dateRange: DateRange
}

export function CiComparisonsView({
  clientSlug,
  selectedParty,
  selectedState,
  selectedEntityType,
  dateRange,
}: CiComparisonsViewProps) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<{ total: number; sortedBy: SortField; entities: EntityProfile[] } | null>(null)
  const [sortBy, setSortBy] = useState<SortField>("volume")
  const [limit, setLimit] = useState(50)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const baseline: number | null = data
    ? (() => {
        const rates = data.entities.map((e) => e.avgInboxRate).filter((r): r is number => r !== null)
        return rates.length > 0
          ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 10) / 10
          : null
      })()
    : null

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (clientSlug) params.append("clientSlug", clientSlug)
      if (selectedParty && selectedParty !== "all") params.append("party", selectedParty)
      if (selectedState && selectedState !== "all") params.append("state", selectedState)
      if (selectedEntityType && selectedEntityType !== "all") params.append("entityType", selectedEntityType)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())
      params.append("sortBy", sortBy)
      params.append("limit", String(limit))

      const res = await fetch(`/api/ci/comparisons?${params.toString()}`, { credentials: "include" })
      if (res.ok) setData(await res.json())
    } catch (err) {
      console.error("[CiComparisonsView] fetch error:", err)
    } finally {
      setLoading(false)
    }
  }, [clientSlug, selectedParty, selectedState, selectedEntityType, dateRange, sortBy, limit])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
    )
  }

  const comparedEntities = data?.entities.filter((e) => selectedIds.includes(e.entityId)) ?? []

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!data || data.entities.length === 0) {
    return (
      <Card>
        <CardContent className="py-14 text-center text-muted-foreground text-sm">
          No entities found for the selected filters.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Entities Shown</p>
            <p className="text-2xl font-bold">{data.total.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Avg Inbox Rate</p>
            <p className={`text-2xl font-bold ${inboxRateColor(baseline)}`}>
              {baseline !== null ? `${baseline}%` : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Total Email Volume</p>
            <p className="text-2xl font-bold">
              {data.entities.reduce((s, e) => s + e.emailCount, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Total SMS Volume</p>
            <p className="text-2xl font-bold">
              {data.entities.reduce((s, e) => s + e.smsCount, 0).toLocaleString()}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Compare panel */}
      {selectedIds.length === 2 && comparedEntities.length === 2 && (
        <ComparisonPanel
          left={comparedEntities[0]}
          right={comparedEntities[1]}
          baseline={baseline}
          onClose={() => setSelectedIds([])}
        />
      )}

      {selectedIds.length === 1 && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>
            <strong className="text-foreground">{comparedEntities[0]?.entityName}</strong> selected — pick one more sender to compare side-by-side.
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={() => setSelectedIds([])}>
            Clear
          </Button>
        </div>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart2 className="w-4 h-4" />
                Sender Leaderboard
              </CardTitle>
              <CardDescription className="mt-0.5">
                Top {data.entities.length} senders by {sortBy === "volume" ? "total volume" : sortBy === "inboxRate" ? "inbox rate" : sortBy === "cadence" ? "send frequency" : sortBy}. Click any row to expand details. Select up to 2 to compare.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortField)}>
                <SelectTrigger className="w-[160px] h-8">
                  <ArrowUpDown className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="volume">By Volume</SelectItem>
                  <SelectItem value="inboxRate">By Inbox Rate</SelectItem>
                  <SelectItem value="emailCount">By Email Count</SelectItem>
                  <SelectItem value="smsCount">By SMS Count</SelectItem>
                  <SelectItem value="cadence">By Frequency</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="w-[80px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">Top 25</SelectItem>
                  <SelectItem value="50">Top 50</SelectItem>
                  <SelectItem value="100">Top 100</SelectItem>
                  <SelectItem value="200">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Column headers */}
          <div className="hidden md:grid grid-cols-[2.5rem_2.5rem_1fr_auto] border-b bg-muted/30 px-4 py-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            <div>#</div>
            <div />
            <div>Sender</div>
            <div className="flex items-center gap-[4.5rem] pr-20">
              <span>Volume</span>
              <span>Inbox</span>
              <span>Cadence</span>
              <span>Platform</span>
              <span className="w-28">Types</span>
            </div>
          </div>
          {data.entities.map((entity, i) => (
            <LeaderboardRow
              key={entity.entityId}
              entity={entity}
              rank={i + 1}
              baseline={baseline}
              isSelected={selectedIds.includes(entity.entityId)}
              compareCount={selectedIds.length}
              onSelect={() => toggleSelect(entity.entityId)}
              onExpand={() => setExpandedId((prev) => (prev === entity.entityId ? null : entity.entityId))}
              isExpanded={expandedId === entity.entityId}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
