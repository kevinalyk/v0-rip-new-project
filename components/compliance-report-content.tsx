"use client"

import { useEffect, useState, useRef } from "react"
import {
  Loader2, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronRight,
  ShieldCheck, Search, X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FilterType =
  | { type: "placement"; placement: "inbox" | "spam" }
  | { type: "section"; section: 1 | 2 | 3 | 4; failed: true }
  | { type: "auth"; check: "spf" | "dkim" | "dmarc" | "tls" | "oneClick" | "unsubBody"; failed: true }
  | null

interface Entity {
  id: string
  name: string
  slug: string | null
  type: string | null
  party: string | null
  state: string | null
}

interface ComplianceRow {
  id: string
  checkedAt: string
  totalScore: number | null
  section1Score: number | null
  section2Score: number | null
  section3Score: number | null
  section4Score: number | null
  hasSpf: boolean | null
  hasDkim: boolean | null
  hasTls: boolean | null
  hasValidMessageId: boolean | null
  notImpersonatingGmail: boolean | null
  hasArcHeaders: boolean | null
  hasBothSpfAndDkim: boolean | null
  hasDmarc: boolean | null
  hasDmarcAlignment: boolean | null
  hasOneClickUnsubscribeHeaders: boolean | null
  hasUnsubscribeLinkInBody: boolean | null
  hasSingleFromAddress: boolean | null
  noFakeReplyPrefix: boolean | null
  hasValidFromTo: boolean | null
  noDeceptiveEmojisInSubject: boolean | null
  noHiddenContent: boolean | null
  displayNameClean: boolean | null
  displayNameNoRecipient: boolean | null
  displayNameNoReplyPattern: boolean | null
  displayNameNoDeceptiveEmojis: boolean | null
  displayNameNotGmail: boolean | null
  campaign: {
    id: string
    senderName: string
    senderEmail: string
    subject: string
    dateReceived: string
    inboxCount: number
    spamCount: number
    notDeliveredCount: number
    inboxRate: number
    entity: { id: string; name: string; type: string; party: string | null; state: string | null } | null
    source: string
  }
}

interface Stats {
  total: number
  avgTotalScore: number
  avgSection1: number
  avgSection2: number
  avgSection3: number
  avgSection4: number
  spfRate: number
  dkimRate: number
  tlsRate: number
  dmarcRate: number
  oneClickUnsubRate: number
  unsubBodyRate: number
  noHiddenContentRate: number
  totalInbox: number
  totalSpam: number
  avgInboxRate: number | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pct(val: number) {
  return `${Math.round(val * 100)}%`
}

function scoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground"
  if (score >= 0.85) return "text-green-500"
  if (score >= 0.65) return "text-yellow-500"
  return "text-red-500"
}

function scoreBadge(score: number | null) {
  if (score == null) return <Badge variant="outline">N/A</Badge>
  const pctVal = Math.round(score * 100)
  if (pctVal >= 85) return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{pctVal}%</Badge>
  if (pctVal >= 65) return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{pctVal}%</Badge>
  return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">{pctVal}%</Badge>
}

function Check({ val }: { val: boolean | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>
  return val
    ? <CheckCircle className="h-4 w-4 text-green-500 inline" />
    : <XCircle className="h-4 w-4 text-red-500 inline" />
}

function partyColor(party: string | null) {
  if (party === "republican") return "bg-red-500/10 text-red-400 border-red-500/20"
  if (party === "democrat") return "bg-blue-500/10 text-blue-400 border-blue-500/20"
  return "bg-muted text-muted-foreground border-border"
}

// ---------------------------------------------------------------------------
// Entity Dropdown
// ---------------------------------------------------------------------------

function EntityDropdown({
  selected,
  onSelect,
  clientSlug,
}: {
  selected: Entity | null
  onSelect: (e: Entity) => void
  clientSlug: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Entity[]>([])
  const [loading, setLoading] = useState(false)
  const [followed, setFollowed] = useState<Entity[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fetchFollowed = async () => {
      try {
        const res = await fetch(`/api/ci/subscriptions/check-all?clientSlug=${clientSlug}`, { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        const ids: string[] = data.entityIds ?? []
        if (ids.length === 0) return
        const detailsRes = await fetch(`/api/public/ci-entities?ids=${ids.join(",")}&pageSize=50`, { credentials: "include" })
        if (detailsRes.ok) {
          const detailsData = await detailsRes.json()
          setFollowed(detailsData.entities ?? [])
        }
      } catch { /* silently fail */ }
    }
    fetchFollowed()
  }, [clientSlug])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQuery(""); setResults([]) }
  }, [open])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/public/ci-entities?search=${encodeURIComponent(query.trim())}&pageSize=20`, { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          const followedIds = new Set(followed.map((e) => e.id))
          const all: Entity[] = data.entities ?? []
          setResults([...all.filter((e) => followedIds.has(e.id)), ...all.filter((e) => !followedIds.has(e.id))])
        }
      } catch { /* silently fail */ }
      finally { setLoading(false) }
    }, 300)
  }, [query, followed])

  const EntityRow = ({ entity }: { entity: Entity }) => (
    <div
      onClick={() => { onSelect(entity); setOpen(false) }}
      className="flex items-center gap-3 px-2 py-2 hover:bg-muted rounded-md cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{entity.name}</p>
        {(entity.type || entity.state) && (
          <p className="text-xs text-muted-foreground">{[entity.type, entity.state].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      {entity.party && (
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium shrink-0 ${partyColor(entity.party)}`}>
          {entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}
        </span>
      )}
    </div>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full max-w-sm justify-between">
          <span className={selected ? "text-foreground" : "text-muted-foreground"}>
            {selected ? selected.name : "Select an entity..."}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="sticky top-0 z-50 bg-background p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input ref={inputRef} placeholder="Search entities..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 pl-8" />
          </div>
        </div>
        <div className="max-h-[280px] overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : query.trim() && results.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No entities found</div>
          ) : !query.trim() ? (
            followed.length > 0 ? (
              <>
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Following</p>
                {followed.map((e) => <EntityRow key={e.id} entity={e} />)}
                <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">Type to search all entities...</p>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">Start typing to search...</div>
            )
          ) : (
            <>
              {results.some((e) => followed.some((f) => f.id === e.id)) && (
                <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Following</p>
              )}
              {results.map((entity, i) => {
                const isFollowed = followed.some((f) => f.id === entity.id)
                const prevIsFollowed = i > 0 && followed.some((f) => f.id === results[i - 1].id)
                const showOthersLabel = !isFollowed && (i === 0 || prevIsFollowed) && results.some((e) => followed.some((f) => f.id === e.id))
                return (
                  <div key={entity.id}>
                    {showOthersLabel && <p className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">All Results</p>}
                    <EntityRow entity={entity} />
                  </div>
                )
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ComplianceReportContentProps {
  clientSlug: string
}

export function ComplianceReportContent({ clientSlug }: ComplianceReportContentProps) {
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [rows, setRows] = useState<ComplianceRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterType>(null)
  const pageSize = 50

  const fetchData = async (p = page, entity = selectedEntity, filter = activeFilter) => {
    if (!entity) return
    setLoading(true)
    try {
      let url = `/api/reports/compliance-summary?entityId=${entity.id}&page=${p}&pageSize=${pageSize}`
      if (filter) {
        url += `&filterType=${filter.type}`
        if (filter.type === "placement") url += `&filterPlacement=${filter.placement}`
        else if (filter.type === "section") url += `&filterSection=${filter.section}`
        else if (filter.type === "auth") url += `&filterCheck=${filter.check}`
      }
      const res = await fetch(url, { credentials: "include" })
      if (!res.ok) return
      const data = await res.json()
      setRows(data.rows)
      setTotal(data.total)
      setStats(data.stats)
    } finally {
      setLoading(false)
    }
  }

  // When entity changes, reset everything and fetch fresh
  useEffect(() => {
    if (selectedEntity) {
      setPage(1)
      setActiveFilter(null)
      setExpandedId(null)
      fetchData(1, selectedEntity, null)
    } else {
      setRows([])
      setStats(null)
      setTotal(0)
    }
  }, [selectedEntity])

  // When page or filter changes (but entity is already selected), re-fetch
  useEffect(() => {
    if (selectedEntity) fetchData(page, selectedEntity, activeFilter)
  }, [page, activeFilter])

  const totalPages = Math.ceil(total / pageSize)

  const handleFilterClick = (filter: FilterType) => {
    const next = JSON.stringify(activeFilter) === JSON.stringify(filter) ? null : filter
    setActiveFilter(next)
    setPage(1)
  }

  const getFilterLabel = (filter: FilterType): string => {
    if (!filter) return ""
    if (filter.type === "placement") return filter.placement === "inbox" ? "Inbox only" : "Spam only"
    if (filter.type === "section") {
      const names = ["All Senders", "Bulk Senders", "Content", "Display Name"]
      return `Failed Section ${filter.section} (${names[filter.section - 1]})`
    }
    if (filter.type === "auth") {
      const names: Record<string, string> = { spf: "SPF", dkim: "DKIM", dmarc: "DMARC", tls: "TLS", oneClick: "1-Click Unsubscribe", unsubBody: "Unsub in Body" }
      return `Failed ${names[filter.check]}`
    }
    return ""
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Compliance Summary</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Authentication and compliance checks — based on raw header data captured at ingestion.
          </p>
        </div>
        {selectedEntity && (
          <Button variant="outline" size="sm" onClick={() => fetchData(page)} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        )}
      </div>

      {/* Entity selector */}
      <div className="flex items-center gap-2">
        <EntityDropdown selected={selectedEntity} onSelect={(e) => setSelectedEntity(e)} clientSlug={clientSlug} />
        {selectedEntity && (
          <Button variant="ghost" size="icon" onClick={() => setSelectedEntity(null)}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!selectedEntity && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">Select an entity to view compliance data</p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              Choose any campaign, PAC, or candidate above to see their authentication checks, inbox placement, and section scores.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Initial load spinner */}
      {selectedEntity && loading && !stats && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {selectedEntity && stats && (
        <>
          {/* Aggregate stat cards */}
          <p className="text-xs text-muted-foreground">Click any metric below to filter campaigns by failures</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Campaigns Checked</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{stats.total.toLocaleString()}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Total Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.avgTotalScore)}`}>{pct(stats.avgTotalScore)}</div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "placement" && activeFilter.placement === "inbox" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "placement", placement: "inbox" })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Inbox Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.avgInboxRate)}`}>
                  {stats.avgInboxRate != null ? pct(stats.avgInboxRate) : "—"}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stats.totalInbox} inbox / {stats.totalSpam} spam</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "auth" && activeFilter.check === "spf" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "auth", check: "spf", failed: true })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">SPF Pass Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.spfRate)}`}>{pct(stats.spfRate)}</div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "auth" && activeFilter.check === "dkim" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "auth", check: "dkim", failed: true })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">DKIM Pass Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.dkimRate)}`}>{pct(stats.dkimRate)}</div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "auth" && activeFilter.check === "tls" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "auth", check: "tls", failed: true })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">TLS Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.tlsRate)}`}>{pct(stats.tlsRate)}</div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "auth" && activeFilter.check === "dmarc" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "auth", check: "dmarc", failed: true })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">DMARC Pass Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.dmarcRate)}`}>{pct(stats.dmarcRate)}</div>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${activeFilter?.type === "auth" && activeFilter.check === "oneClick" ? "ring-2 ring-offset-2 ring-primary" : ""}`}
              onClick={() => handleFilterClick({ type: "auth", check: "oneClick", failed: true })}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">1-Click Unsub Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-3xl font-bold ${scoreColor(stats.oneClickUnsubRate)}`}>{pct(stats.oneClickUnsubRate)}</div>
              </CardContent>
            </Card>
          </div>

          {/* Section Score Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Section Score Breakdown</CardTitle>
              <CardDescription>
                Average pass rate per compliance section across all checked emails
                <span className="block mt-1 text-xs opacity-70">Click any section to filter campaigns by failures</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: "All Senders",  score: stats.avgSection1, desc: "SPF, DKIM, TLS, Message-ID, ARC",        section: 1 as const },
                  { label: "Bulk Senders", score: stats.avgSection2, desc: "Both SPF+DKIM, DMARC, 1-Click Unsub",    section: 2 as const },
                  { label: "Content",      score: stats.avgSection3, desc: "From address, subject, hidden content",   section: 3 as const },
                  { label: "Display Name", score: stats.avgSection4, desc: "No impersonation, no deceptive patterns", section: 4 as const },
                ].map((s) => {
                  const isActive = activeFilter?.type === "section" && activeFilter.section === s.section
                  return (
                    <div
                      key={s.label}
                      className={`space-y-1 p-2 rounded cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-primary transition-all ${isActive ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                      onClick={() => handleFilterClick({ type: "section", section: s.section, failed: true })}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{s.label}</span>
                        {scoreBadge(s.score)}
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${s.score >= 0.85 ? "bg-green-500" : s.score >= 0.65 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${Math.round(s.score * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{s.desc}</p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Results table — hidden until per-domain filtering is available */}
          {false && <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-base">Individual Campaign Results</CardTitle>
                  <CardDescription>
                    {total} total {activeFilter ? "matching " : ""}campaigns — showing {rows.length} on this page
                  </CardDescription>
                </div>
                {activeFilter && (
                  <Badge
                    variant="secondary"
                    className="gap-2 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => setActiveFilter(null)}
                  >
                    {getFilterLabel(activeFilter)}
                    <X className="h-3 w-3" />
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {activeFilter ? "No campaigns match the current filter." : "No compliance data yet for this entity."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="w-6 px-4 py-3" />
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sender</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Placement</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">S1</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">S2</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">S3</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">S4</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Checked</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <>
                          <tr
                            key={row.id}
                            className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                          >
                            <td className="px-4 py-3 text-muted-foreground">
                              {expandedId === row.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium truncate max-w-[200px]">{row.campaign.senderName}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px]">{row.campaign.senderEmail}</div>
                              <div className="text-xs text-muted-foreground truncate max-w-[200px] italic">{row.campaign.subject}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                {row.campaign.inboxCount > 0 && (
                                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs w-fit">{row.campaign.inboxCount} inbox</Badge>
                                )}
                                {row.campaign.spamCount > 0 && (
                                  <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs w-fit">{row.campaign.spamCount} spam</Badge>
                                )}
                                {row.campaign.notDeliveredCount > 0 && (
                                  <Badge variant="outline" className="text-xs w-fit">{row.campaign.notDeliveredCount} not delivered</Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">{scoreBadge(row.section1Score)}</td>
                            <td className="px-4 py-3">{scoreBadge(row.section2Score)}</td>
                            <td className="px-4 py-3">{scoreBadge(row.section3Score)}</td>
                            <td className="px-4 py-3">{scoreBadge(row.section4Score)}</td>
                            <td className="px-4 py-3">
                              <span className={`font-semibold ${scoreColor(row.totalScore)}`}>
                                {row.totalScore != null ? `${Math.round(row.totalScore * 100)}%` : "—"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(row.checkedAt), "MMM d, h:mma")}
                            </td>
                          </tr>

                          {expandedId === row.id && (
                            <tr key={`${row.id}-detail`} className="bg-muted/20 border-b">
                              <td colSpan={9} className="px-8 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-xs">
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-2">Section 1 — All Senders</p>
                                    <ul className="space-y-1">
                                      <li className="flex items-center gap-2"><Check val={row.hasSpf} /> SPF</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasDkim} /> DKIM</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasTls} /> TLS</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasValidMessageId} /> Valid Message-ID</li>
                                      <li className="flex items-center gap-2"><Check val={row.notImpersonatingGmail} /> Not Impersonating Gmail</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasArcHeaders} /> ARC Headers</li>
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-2">Section 2 — Bulk Senders</p>
                                    <ul className="space-y-1">
                                      <li className="flex items-center gap-2"><Check val={row.hasBothSpfAndDkim} /> Both SPF + DKIM</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasDmarc} /> DMARC</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasDmarcAlignment} /> DMARC Alignment</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasOneClickUnsubscribeHeaders} /> 1-Click Unsub Header</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasUnsubscribeLinkInBody} /> Unsub Link in Body</li>
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-2">Section 3 — Content</p>
                                    <ul className="space-y-1">
                                      <li className="flex items-center gap-2"><Check val={row.hasSingleFromAddress} /> Single From Address</li>
                                      <li className="flex items-center gap-2"><Check val={row.noFakeReplyPrefix} /> No Fake Reply Prefix</li>
                                      <li className="flex items-center gap-2"><Check val={row.hasValidFromTo} /> Valid From/To</li>
                                      <li className="flex items-center gap-2"><Check val={row.noDeceptiveEmojisInSubject} /> No Deceptive Emojis</li>
                                      <li className="flex items-center gap-2"><Check val={row.noHiddenContent} /> No Hidden Content</li>
                                    </ul>
                                  </div>
                                  <div>
                                    <p className="font-semibold text-muted-foreground uppercase tracking-wide mb-2">Section 4 — Display Name</p>
                                    <ul className="space-y-1">
                                      <li className="flex items-center gap-2"><Check val={row.displayNameClean} /> Clean Display Name</li>
                                      <li className="flex items-center gap-2"><Check val={row.displayNameNoRecipient} /> No Recipient in Name</li>
                                      <li className="flex items-center gap-2"><Check val={row.displayNameNoReplyPattern} /> No Reply Pattern</li>
                                      <li className="flex items-center gap-2"><Check val={row.displayNameNoDeceptiveEmojis} /> No Deceptive Emojis</li>
                                      <li className="flex items-center gap-2"><Check val={row.displayNameNotGmail} /> Not Impersonating Gmail</li>
                                    </ul>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>}

          {/* Pagination — hidden with table above */}
          {false && totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>Page {page} of {totalPages} — {total} total records</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
