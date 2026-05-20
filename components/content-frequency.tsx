"use client"

import { useState, useCallback } from "react"
import useSWR from "swr"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, CalendarIcon, RotateCcw, ChevronDown, ChevronRight, ExternalLink } from "lucide-react"
import { Input } from "@/components/ui/input"

// ─── Types ───────────────────────────────────────────────────────────────────

interface SendRow {
  id: string
  shareToken: string
  date: string
  preview: string
  entityName: string | null
  entityParty: string | null
  sendingNumber?: string | null
}

interface FrequencyRow {
  subject?: string
  body_fingerprint?: string
  send_days: number
  entity_name: string | null
  entity_party: string | null
  entity_id: string | null
  last_sent: string | null
  example_id: string
  example_subject?: string
  example_preview?: string | null
  example_message?: string | null
}

interface ContentFrequencyData {
  emailSubjects: FrequencyRow[]
  emailBodies: FrequencyRow[]
  smsBodies: FrequencyRow[]
}

interface Filters {
  party: string
  source: string
  fromDate: string
  toDate: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((r) => {
    if (!r.ok) throw new Error("fetch failed")
    return r.json()
  })

function partyColor(party: string | null) {
  if (!party) return "secondary"
  if (party === "republican") return "destructive"
  if (party === "democrat") return "default"
  return "secondary"
}

function partyLabel(party: string | null) {
  if (!party) return "Unknown"
  return party.charAt(0).toUpperCase() + party.slice(1)
}

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function truncate(str: string | null | undefined, n = 120) {
  if (!str) return "—"
  return str.length > n ? str.slice(0, n) + "…" : str
}

// ─── Filter Bar ──────────────────────────────────────────────────────────────

function FilterBar({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters
  onChange: (f: Partial<Filters>) => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      {/* Party */}
      <Select value={filters.party} onValueChange={(v) => onChange({ party: v })}>
        <SelectTrigger className="w-36 h-9 text-sm">
          <SelectValue placeholder="All Parties" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Parties</SelectItem>
          <SelectItem value="republican">Republican</SelectItem>
          <SelectItem value="democrat">Democrat</SelectItem>
          <SelectItem value="independent">Independent</SelectItem>
        </SelectContent>
      </Select>

      {/* Source */}
      <Select value={filters.source} onValueChange={(v) => onChange({ source: v })}>
        <SelectTrigger className="w-36 h-9 text-sm">
          <SelectValue placeholder="All Sources" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Sources</SelectItem>
          <SelectItem value="house">House File</SelectItem>
          <SelectItem value="third_party">3rd Party</SelectItem>
        </SelectContent>
      </Select>

      {/* From date */}
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="date"
          className="h-9 pl-8 text-sm w-36"
          value={filters.fromDate}
          onChange={(e) => onChange({ fromDate: e.target.value })}
        />
      </div>

      <span className="text-muted-foreground text-sm">–</span>

      {/* To date */}
      <div className="relative">
        <CalendarIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="date"
          className="h-9 pl-8 text-sm w-36"
          value={filters.toDate}
          onChange={(e) => onChange({ toDate: e.target.value })}
        />
      </div>

      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-muted-foreground"
        onClick={onReset}
      >
        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
        Reset
      </Button>
    </div>
  )
}

// ─── Expanded sends row ───────────────────────────────────────────────────────

function ExpandedSends({
  rowKey,
  type,
  clientSlug,
}: {
  rowKey: string
  type: "subject" | "email-body" | "sms-body"
  clientSlug: string
}) {
  const params = new URLSearchParams({ type, key: rowKey, clientSlug })
  const { data, isLoading, error } = useSWR<{ sends: SendRow[] }>(
    `/api/reports/content-frequency/sends?${params.toString()}`,
    fetcher,
    { keepPreviousData: false }
  )

  if (isLoading) {
    return (
      <tr>
        <td colSpan={6} className="py-4 px-10 bg-muted/30">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading sends…
          </div>
        </td>
      </tr>
    )
  }

  if (error || !data?.sends?.length) {
    return (
      <tr>
        <td colSpan={6} className="py-4 px-10 bg-muted/30 text-muted-foreground text-xs">
          {error ? "Failed to load sends." : "No individual sends found."}
        </td>
      </tr>
    )
  }

  return (
    <>
      {data.sends.map((send) => (
        <tr
          key={send.id}
          onClick={() => window.open(`/share/${send.shareToken}`, "_blank")}
          className="bg-muted/30 border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors group"
        >
          <td className="py-2.5 px-4 w-4" />
          <td className="py-2.5 pl-10 pr-4 max-w-md" colSpan={2}>
            <p className="text-xs text-foreground leading-relaxed">{truncate(send.preview, 140)}</p>
            {send.sendingNumber && (
              <p className="text-[10px] text-muted-foreground mt-0.5">From: {send.sendingNumber}</p>
            )}
          </td>
          <td className="py-2.5 px-4" />
          <td className="py-2.5 px-4 text-right text-muted-foreground text-xs whitespace-nowrap">
            {formatDate(send.date)}
          </td>
          <td className="py-2.5 px-4 text-right">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors ml-auto" />
          </td>
        </tr>
      ))}
    </>
  )
}

// ─── Table ─────────────────��──────────────────────────────────────────────────

function FrequencyTable({
  rows,
  type,
  clientSlug,
}: {
  rows: FrequencyRow[]
  type: "subject" | "email-body" | "sms-body"
  clientSlug: string
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">No repeated copy found for the selected filters.</p>
        <p className="text-xs mt-1">Try expanding the date range or removing filters.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
            <th className="py-3 px-4 w-4" />
            <th className="text-left py-3 px-4 font-medium">
              {type === "subject" ? "Subject Line" : type === "email-body" ? "Example Subject" : "SMS Preview"}
            </th>
            <th className="text-left py-3 px-4 font-medium">Entity</th>
            <th className="text-right py-3 px-4 font-medium">Send Days</th>
            <th className="text-right py-3 px-4 font-medium">Last Sent</th>
            <th className="py-3 px-4 w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const rowKey =
              type === "subject"
                ? (row.subject ?? "")
                : (row.body_fingerprint ?? "")
            const isExpanded = expandedKey === rowKey + i
            const preview =
              type === "subject"
                ? row.subject
                : type === "email-body"
                ? row.example_subject  // use subject as the readable label — body preview contains raw HTML
                : row.example_message

            return (
              <>
                <tr
                  key={row.example_id + i}
                  onClick={() => setExpandedKey(isExpanded ? null : rowKey + i)}
                  className="border-b hover:bg-muted/40 transition-colors cursor-pointer select-none"
                >
                  <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{i + 1}</td>
                  <td className="py-3 px-4 max-w-md">
                    <p className="leading-relaxed text-foreground">{truncate(preview)}</p>
                  </td>
                  <td className="py-3 px-4">
                    {row.entity_name ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-xs">{row.entity_name}</span>
                        {row.entity_party && (
                          <Badge
                            variant={partyColor(row.entity_party) as any}
                            className="w-fit text-[10px] px-1.5 py-0"
                          >
                            {partyLabel(row.entity_party)}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs px-2.5 py-1 min-w-[2rem]">
                      {row.send_days}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-muted-foreground text-xs whitespace-nowrap">
                    {formatDate(row.last_sent)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto" />
                    }
                  </td>
                </tr>
                {isExpanded && (
                  <ExpandedSends
                    key={"exp-" + rowKey + i}
                    rowKey={rowKey}
                    type={type}
                    clientSlug={clientSlug}
                  />
                )}
              </>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS: Filters = { party: "all", source: "all", fromDate: "", toDate: "" }

export function ContentFrequency({ clientSlug }: { clientSlug: string }) {
  const [tab, setTab] = useState<"subject" | "email-body" | "sms-body">("subject")
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const updateFilter = useCallback((partial: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...partial }))
  }, [])

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  // Build query string
  const params = new URLSearchParams({ clientSlug })
  if (filters.party !== "all") params.set("party", filters.party)
  if (filters.source !== "all") params.set("source", filters.source)
  if (filters.fromDate) params.set("fromDate", filters.fromDate)
  if (filters.toDate) params.set("toDate", filters.toDate)

  const { data, isLoading, error } = useSWR<ContentFrequencyData>(
    `/api/reports/content-frequency?${params.toString()}`,
    fetcher,
    { keepPreviousData: true }
  )

  const tabRows: FrequencyRow[] =
    tab === "subject"
      ? data?.emailSubjects ?? []
      : tab === "email-body"
      ? data?.emailBodies ?? []
      : data?.smsBodies ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Copy Frequency</h1>
        <p className="text-muted-foreground text-sm mt-1">
          The most frequently sent email subjects, email body copy, and SMS messages — ranked by number of unique send days.
        </p>
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={updateFilter} onReset={resetFilters} />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="mb-4">
          <TabsTrigger value="subject">
            Email Subjects
            {data && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                {data.emailSubjects.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="email-body">
            Email Body
            {data && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                {data.emailBodies.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sms-body">
            SMS Copy
            {data && (
              <span className="ml-2 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                {data.smsBodies.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="flex items-center justify-center py-16 text-destructive text-sm">
            Failed to load data. Please try again.
          </div>
        )}

        {/* Table */}
        {!isLoading && !error && data && (
          <div className="rounded-lg border bg-card shadow-none">
            <FrequencyTable rows={tabRows} type={tab} clientSlug={clientSlug} />
          </div>
        )}
      </Tabs>
    </div>
  )
}
