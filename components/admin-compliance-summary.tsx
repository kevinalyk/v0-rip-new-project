"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react"
import { format } from "date-fns"

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
    entity: {
      id: string
      name: string
      type: string
      party: string | null
      state: string | null
    } | null
    source: string
  }
}

interface PartyStat {
  count: number
  avgCompliance: number
  avgInboxRate: number
  spamRate: number
  spfRate: number
  dkimRate: number
  dmarcRate: number
  oneClickRate: number
}

interface PartySplit {
  republican: PartyStat
  democrat: PartyStat
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
}

function pct(val: number) {
  return `${Math.round(val * 100)}%`
}

function scoreColor(score: number | null) {
  if (score == null) return "text-muted-foreground"
  if (score >= 0.85) return "text-green-600"
  if (score >= 0.65) return "text-yellow-600"
  return "text-red-600"
}

function scoreBadge(score: number | null) {
  if (score == null) return <Badge variant="outline">N/A</Badge>
  const pctVal = Math.round(score * 100)
  if (pctVal >= 85) return <Badge className="bg-green-100 text-green-800 border-green-200">{pctVal}%</Badge>
  if (pctVal >= 65) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">{pctVal}%</Badge>
  return <Badge className="bg-red-100 text-red-800 border-red-200">{pctVal}%</Badge>
}

function Check({ val }: { val: boolean | null }) {
  if (val === null) return <span className="text-muted-foreground text-xs">—</span>
  return val
    ? <CheckCircle className="h-4 w-4 text-green-600 inline" />
    : <XCircle className="h-4 w-4 text-red-500 inline" />
}

function getPartyColor(party: string | null) {
  if (!party) return "bg-muted text-muted-foreground"
  if (party === "republican") return "bg-red-100 text-red-800 border-red-200"
  if (party === "democrat") return "bg-blue-100 text-blue-800 border-blue-200"
  return "bg-gray-100 text-gray-800 border-gray-200"
}

export function AdminComplianceSummary() {
  const [rows, setRows] = useState<ComplianceRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [partySplit, setPartySplit] = useState<PartySplit | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pageSize = 50

  const fetchData = async (p = page) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/compliance-summary?page=${p}&pageSize=${pageSize}`, {
        credentials: "include",
      })
      if (!res.ok) return
      const data = await res.json()
      setRows(data.rows)
      setTotal(data.total)
      setStats(data.stats)
      setPartySplit(data.partySplit ?? null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(page)
  }, [page])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Email Compliance Summary</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gmail bias analysis — based on raw header data captured at ingestion.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchData(page)} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Republican vs Democrat Comparison */}
      {partySplit && (partySplit.republican.count > 0 || partySplit.democrat.count > 0) && (
        <Card className="border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Republican vs. Democrat — Compliance &amp; Inbox Analysis</CardTitle>
            <CardDescription>
              Compares email compliance scores against actual inbox placement to surface potential Gmail bias. High compliance + high spam rate = potential bias signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(["republican", "democrat"] as const).map((party) => {
                const s = partySplit[party]
                const isRep = party === "republican"
                const color = isRep ? "red" : "blue"
                const bias = s.avgCompliance >= 0.8 && s.spamRate >= 0.3
                return (
                  <div key={party} className={`rounded-lg border-2 p-5 ${isRep ? "border-red-200 bg-red-50/30" : "border-blue-200 bg-blue-50/30"}`}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className={`font-bold text-lg capitalize ${isRep ? "text-red-700" : "text-blue-700"}`}>
                        {party}
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{s.count} campaigns</span>
                        {bias && (
                          <Badge className="bg-orange-100 text-orange-800 border-orange-300 text-xs font-semibold">
                            Bias Signal
                          </Badge>
                        )}
                      </div>
                    </div>

                    {s.count === 0 ? (
                      <p className="text-sm text-muted-foreground">No data yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {/* Key metrics side by side */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-background rounded-md p-3 border">
                            <p className="text-xs text-muted-foreground mb-1">Avg Compliance Score</p>
                            <p className={`text-2xl font-bold ${scoreColor(s.avgCompliance)}`}>{pct(s.avgCompliance)}</p>
                          </div>
                          <div className="bg-background rounded-md p-3 border">
                            <p className="text-xs text-muted-foreground mb-1">Avg Inbox Rate</p>
                            <p className={`text-2xl font-bold ${scoreColor(s.avgInboxRate)}`}>{pct(s.avgInboxRate)}</p>
                          </div>
                          <div className="bg-background rounded-md p-3 border">
                            <p className="text-xs text-muted-foreground mb-1">Spam Rate</p>
                            <p className={`text-2xl font-bold ${s.spamRate >= 0.3 ? "text-red-600" : s.spamRate >= 0.15 ? "text-yellow-600" : "text-green-600"}`}>
                              {pct(s.spamRate)}
                            </p>
                          </div>
                          <div className="bg-background rounded-md p-3 border">
                            <p className="text-xs text-muted-foreground mb-1">Compliance vs Inbox Gap</p>
                            <p className={`text-2xl font-bold ${(s.avgCompliance - s.avgInboxRate) >= 0.2 ? "text-red-600" : "text-green-600"}`}>
                              {s.avgCompliance - s.avgInboxRate >= 0
                                ? `+${pct(s.avgCompliance - s.avgInboxRate)}`
                                : pct(s.avgCompliance - s.avgInboxRate)}
                            </p>
                          </div>
                        </div>

                        {/* Auth signals */}
                        <div className="grid grid-cols-4 gap-2 pt-1">
                          {[
                            { label: "SPF", val: s.spfRate },
                            { label: "DKIM", val: s.dkimRate },
                            { label: "DMARC", val: s.dmarcRate },
                            { label: "1-Click Unsub", val: s.oneClickRate },
                          ].map((m) => (
                            <div key={m.label} className="text-center">
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1">
                                <div
                                  className={`h-full rounded-full ${m.val >= 0.85 ? `bg-${color}-500` : m.val >= 0.65 ? "bg-yellow-500" : "bg-red-400"}`}
                                  style={{ width: `${Math.round(m.val * 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">{m.label}</p>
                              <p className="text-xs font-semibold">{pct(m.val)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Delta summary row */}
            {partySplit.republican.count > 0 && partySplit.democrat.count > 0 && (
              <div className="mt-4 p-3 rounded-md bg-muted/40 border text-sm flex flex-wrap gap-6">
                <div>
                  <span className="text-muted-foreground">Compliance delta (R - D): </span>
                  <span className="font-semibold">{(partySplit.republican.avgCompliance - partySplit.democrat.avgCompliance) >= 0 ? "+" : ""}{pct(partySplit.republican.avgCompliance - partySplit.democrat.avgCompliance)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Inbox rate delta (R - D): </span>
                  <span className="font-semibold">{(partySplit.republican.avgInboxRate - partySplit.democrat.avgInboxRate) >= 0 ? "+" : ""}{pct(partySplit.republican.avgInboxRate - partySplit.democrat.avgInboxRate)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Spam rate delta (R - D): </span>
                  <span className={`font-semibold ${(partySplit.republican.spamRate - partySplit.democrat.spamRate) >= 0.1 ? "text-red-600" : ""}`}>
                    {(partySplit.republican.spamRate - partySplit.democrat.spamRate) >= 0 ? "+" : ""}{pct(partySplit.republican.spamRate - partySplit.democrat.spamRate)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Aggregate Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Campaigns Checked</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Total Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.avgTotalScore)}`}>
                {pct(stats.avgTotalScore)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">SPF Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.spfRate)}`}>{pct(stats.spfRate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">DKIM Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.dkimRate)}`}>{pct(stats.dkimRate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">TLS Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.tlsRate)}`}>{pct(stats.tlsRate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">DMARC Pass Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.dmarcRate)}`}>{pct(stats.dmarcRate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">1-Click Unsub Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.oneClickUnsubRate)}`}>{pct(stats.oneClickUnsubRate)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Unsub in Body Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${scoreColor(stats.unsubBodyRate)}`}>{pct(stats.unsubBodyRate)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Section Score Breakdown */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Section Score Breakdown</CardTitle>
            <CardDescription>Average pass rate per compliance section across all checked emails</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { label: "All Senders", score: stats.avgSection1, desc: "SPF, DKIM, TLS, Message-ID, ARC" },
                { label: "Bulk Senders", score: stats.avgSection2, desc: "Both SPF+DKIM, DMARC, 1-Click Unsub" },
                { label: "Content", score: stats.avgSection3, desc: "From address, subject, hidden content" },
                { label: "Display Name", score: stats.avgSection4, desc: "No impersonation, no deceptive patterns" },
              ].map((s) => (
                <div key={s.label} className="space-y-1">
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
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Individual Campaign Results</CardTitle>
          <CardDescription>
            {total} campaigns checked — showing {rows.length} on this page
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No compliance data yet. The hourly CRON will populate this as emails come in.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="w-6 px-4 py-3" />
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Sender</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Entity</th>
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
                          {expandedId === row.id
                            ? <ChevronDown className="h-4 w-4" />
                            : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium truncate max-w-[200px]">{row.campaign.senderName}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">{row.campaign.senderEmail}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px] italic">{row.campaign.subject}</div>
                        </td>
                        <td className="px-4 py-3">
                          {row.campaign.entity ? (
                            <div>
                              <div className="font-medium text-xs">{row.campaign.entity.name}</div>
                              <Badge className={`text-xs mt-1 ${getPartyColor(row.campaign.entity.party)}`}>
                                {row.campaign.entity.party ?? row.campaign.entity.type}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">Unassigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {row.campaign.inboxCount > 0 && (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs w-fit">
                                {row.campaign.inboxCount} inbox
                              </Badge>
                            )}
                            {row.campaign.spamCount > 0 && (
                              <Badge className="bg-red-100 text-red-800 border-red-200 text-xs w-fit">
                                {row.campaign.spamCount} spam
                              </Badge>
                            )}
                            {row.campaign.notDeliveredCount > 0 && (
                              <Badge variant="outline" className="text-xs w-fit">
                                {row.campaign.notDeliveredCount} not delivered
                              </Badge>
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
                          <td colSpan={10} className="px-8 py-4">
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
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>Page {page} of {totalPages} — {total} total records</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
