"use client"

import { useState } from "react"
import useSWR from "swr"
import { TrendingUp, Search, MousePointerClick, Eye, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function TableRow({ cols }: { cols: (string | number)[] }) {
  return (
    <tr className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
      {cols.map((col, i) => (
        <td key={i} className={`py-2 px-3 text-sm ${i === 0 ? "text-foreground max-w-[200px] truncate" : "text-muted-foreground text-right tabular-nums"}`}>
          {col}
        </td>
      ))}
    </tr>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 mb-4">
      <AlertCircle size={14} className="flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export function SeoDashboardContent() {
  const [days, setDays] = useState(28)
  const [indexing, setIndexing] = useState(false)
  const [indexResult, setIndexResult] = useState<{ message: string; ok: boolean } | null>(null)

  const { data, isLoading, error, mutate } = useSWR(
    `/api/admin/seo-data?days=${days}`,
    fetcher,
    { revalidateOnFocus: false }
  )

  const handleRunIndexing = async () => {
    setIndexing(true)
    setIndexResult(null)
    try {
      const res = await fetch("/api/admin/trigger-gsc-index", { method: "POST" })
      const json = await res.json()
      setIndexResult({ message: json.message || JSON.stringify(json), ok: res.ok })
    } catch (e) {
      setIndexResult({ message: "Failed to run indexing job", ok: false })
    } finally {
      setIndexing(false)
    }
  }

  const gscQueries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[] =
    data?.gsc?.topQueries ?? []
  const gscPages: { page: string; clicks: number; impressions: number }[] =
    data?.gsc?.topPages ?? []
  const ga4Pages: { page: string; sessions: number; users: number }[] =
    data?.ga4?.topPages ?? []
  const ga4Terms: { term: string; sessions: number }[] =
    data?.ga4?.topSearchTerms ?? []

  const totalClicks = gscQueries.reduce((s, q) => s + q.clicks, 0)
  const totalImpressions = gscQueries.reduce((s, q) => s + q.impressions, 0)
  const avgCtr = gscQueries.length > 0
    ? (gscQueries.reduce((s, q) => s + q.ctr, 0) / gscQueries.length * 100).toFixed(1)
    : "0"
  const avgPosition = gscQueries.length > 0
    ? (gscQueries.reduce((s, q) => s + q.position, 0) / gscQueries.length).toFixed(1)
    : "—"

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className="text-[#dc2a28]" />
          <h1 className="text-2xl font-bold text-foreground">SEO Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="text-sm rounded-md border border-border bg-background text-foreground px-3 py-1.5 focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={28}>Last 28 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={() => mutate()}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Indexing tool */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">GSC Auto-Indexing</p>
          <p className="text-xs text-muted-foreground mt-0.5">Submit digest articles published in the last 48 hours to Google Search Console for indexing.</p>
        </div>
        <div className="flex items-center gap-3">
          {indexResult && (
            <div className={`flex items-center gap-1.5 text-xs ${indexResult.ok ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
              <CheckCircle2 size={13} />
              {indexResult.message}
            </div>
          )}
          <button
            onClick={handleRunIndexing}
            disabled={indexing}
            className="flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md bg-[#dc2a28] text-white hover:bg-[#b82220] transition-colors disabled:opacity-60"
          >
            {indexing ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
            {indexing ? "Running…" : "Run Now"}
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#dc2a28]" />
        </div>
      )}

      {error && <ErrorBanner message="Failed to load SEO data. Check your GSC and GA4 credentials." />}

      {data && (
        <>
          {data.gsc?.error && <ErrorBanner message={`GSC error: ${data.gsc.error}`} />}
          {data.ga4?.error && <ErrorBanner message={`GA4 error: ${data.ga4.error}`} />}

          {/* GSC Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Clicks" value={totalClicks.toLocaleString()} sub={`Last ${days} days`} />
            <StatCard label="Impressions" value={totalImpressions.toLocaleString()} sub={`Last ${days} days`} />
            <StatCard label="Avg CTR" value={`${avgCtr}%`} sub="Across top queries" />
            <StatCard label="Avg Position" value={avgPosition} sub="In Google Search" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GSC Top Queries */}
            <Section title="Top Search Queries (GSC)">
              {gscQueries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No query data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-semibold text-muted-foreground py-2 px-3">Query</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Clicks</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Impr.</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Pos.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscQueries.slice(0, 15).map((q, i) => (
                        <TableRow key={i} cols={[q.query, q.clicks.toLocaleString(), q.impressions.toLocaleString(), Number(q.position).toFixed(1)]} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* GSC Top Pages */}
            <Section title="Top Pages by Clicks (GSC)">
              {gscPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No page data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-semibold text-muted-foreground py-2 px-3">Page</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Clicks</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Impr.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gscPages.slice(0, 15).map((p, i) => (
                        <TableRow
                          key={i}
                          cols={[
                            p.page.replace("https://app.rip-tool.com", ""),
                            p.clicks.toLocaleString(),
                            p.impressions.toLocaleString(),
                          ]}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* GA4 Top Pages */}
            <Section title="Top Pages by Sessions (GA4)">
              {ga4Pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No GA4 page data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-semibold text-muted-foreground py-2 px-3">Page</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Sessions</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ga4Pages.slice(0, 15).map((p, i) => (
                        <TableRow key={i} cols={[p.page, p.sessions.toLocaleString(), p.users.toLocaleString()]} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* GA4 Search Terms */}
            <Section title="Top Internal Search Terms (GA4)">
              {ga4Terms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No search term data available.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left text-xs font-semibold text-muted-foreground py-2 px-3">Term</th>
                        <th className="text-right text-xs font-semibold text-muted-foreground py-2 px-3">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ga4Terms.slice(0, 15).map((t, i) => (
                        <TableRow key={i} cols={[t.term, t.sessions.toLocaleString()]} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        </>
      )}
    </div>
  )
}
