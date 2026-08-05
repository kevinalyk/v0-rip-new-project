"use client"

import { useState, useEffect, useCallback } from "react"
import { Copy, Check, RefreshCw, Mail, ShieldCheck, ShieldX, Minus, Clock, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpamRule {
  name: string
  score: number
  description: string
}

interface HtmlAnalysis {
  hasHtml: boolean
  linkCount: number
  imageCount: number
  textHtmlRatio: number
  hasUnsubscribe: boolean
}

interface SpamTestRecord {
  id: string
  testAddress: string
  status: "pending" | "received" | "expired"
  expiresAt: string
  receivedAt?: string
  subject?: string
  fromAddress?: string
  score?: number
  maxScore?: number
  spamRules?: SpamRule[]
  spfResult?: string
  dkimResult?: string
  dmarcResult?: string
  htmlAnalysis?: HtmlAnalysis
  createdAt: string
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, maxScore }: { score: number; maxScore: number }) {
  const normalized = Math.max(0, Math.min(score, maxScore))
  // Score is inverted: 0 = perfect, 10 = terrible
  // We display it as a quality score: 10 = best, 0 = worst
  const qualityScore = Math.max(0, maxScore - normalized)
  const pct = qualityScore / maxScore

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)

  const color =
    pct >= 0.8 ? "text-emerald-400" :
    pct >= 0.5 ? "text-yellow-400" :
    "text-red-400"

  const strokeColor =
    pct >= 0.8 ? "#34d399" :
    pct >= 0.5 ? "#facc15" :
    "#f87171"

  const label =
    pct >= 0.8 ? "Good" :
    pct >= 0.5 ? "Fair" :
    "Poor"

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-32 h-32">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
          <circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={strokeColor} strokeWidth="10"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold ${color}`}>{qualityScore.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/ {maxScore}</span>
        </div>
      </div>
      <span className={`text-sm font-semibold ${color}`}>{label}</span>
    </div>
  )
}

// ─── Auth badge ───────────────────────────────────────────────────────────────

function AuthBadge({ label, result }: { label: string; result?: string }) {
  const pass = result === "pass"
  const fail = result === "fail" || result === "softfail"
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
      {pass ? (
        <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
      ) : fail ? (
        <ShieldX size={16} className="text-red-400 shrink-0" />
      ) : (
        <Minus size={16} className="text-muted-foreground shrink-0" />
      )}
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        <p className={`text-xs capitalize ${pass ? "text-emerald-400" : fail ? "text-red-400" : "text-muted-foreground"}`}>
          {result ?? "none"}
        </p>
      </div>
    </div>
  )
}

// ─── SpamRules list ───────────────────────────────────────────────────────────

function SpamRulesList({ rules }: { rules: SpamRule[] }) {
  const [expanded, setExpanded] = useState(false)
  const positive = rules.filter((r) => r.score > 0).sort((a, b) => b.score - a.score)
  const negative = rules.filter((r) => r.score < 0).sort((a, b) => a.score - b.score)
  const visible = expanded ? rules : positive.slice(0, 5)

  if (rules.length === 0) return (
    <p className="text-sm text-muted-foreground">No SpamAssassin rules triggered.</p>
  )

  return (
    <div className="space-y-2">
      {visible.map((rule) => (
        <div key={rule.name} className="flex items-start gap-3 text-sm">
          <span className={`font-mono text-xs w-12 shrink-0 pt-0.5 text-right ${rule.score > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {rule.score > 0 ? "+" : ""}{rule.score.toFixed(2)}
          </span>
          <div>
            <span className="font-mono text-xs text-muted-foreground">{rule.name}</span>
            <p className="text-muted-foreground">{rule.description}</p>
          </div>
        </div>
      ))}
      {rules.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? "Show less" : `Show all ${rules.length} rules`}
          {!expanded && negative.length > 0 && (
            <span className="text-emerald-400 ml-1">({negative.length} positive signals)</span>
          )}
        </button>
      )}
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ test }: { test: SpamTestRecord }) {
  return (
    <div className="space-y-6">
      {/* Score + Auth row */}
      <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start p-6 rounded-xl border border-border/60 bg-card">
        <ScoreRing score={test.score ?? 0} maxScore={test.maxScore ?? 10} />
        <div className="flex-1 space-y-4 w-full">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Subject</p>
            <p className="text-sm font-medium text-foreground">{test.subject || "(no subject)"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Sender</p>
            <p className="text-sm text-foreground">{test.fromAddress || "unknown"}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <AuthBadge label="SPF" result={test.spfResult} />
            <AuthBadge label="DKIM" result={test.dkimResult} />
            <AuthBadge label="DMARC" result={test.dmarcResult} />
          </div>
        </div>
      </div>

      {/* HTML analysis */}
      {test.htmlAnalysis && (
        <div className="p-5 rounded-xl border border-border/60 bg-card space-y-3">
          <h3 className="text-sm font-semibold text-foreground">HTML Analysis</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Links", value: String(test.htmlAnalysis.linkCount) },
              { label: "Images", value: String(test.htmlAnalysis.imageCount) },
              { label: "Text/HTML Ratio", value: `${(test.htmlAnalysis.textHtmlRatio * 100).toFixed(0)}%` },
              { label: "Unsubscribe Link", value: test.htmlAnalysis.hasUnsubscribe ? "Present" : "Missing" },
            ].map(({ label, value }) => (
              <div key={label} className="px-3 py-2 rounded-lg bg-muted/30 border border-border/40">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SpamAssassin rules */}
      <div className="p-5 rounded-xl border border-border/60 bg-card space-y-3">
        <h3 className="text-sm font-semibold text-foreground">SpamAssassin Rules</h3>
        <SpamRulesList rules={test.spamRules ?? []} />
      </div>
    </div>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ test, onSelect, selected }: { test: SpamTestRecord; onSelect: () => void; selected: boolean }) {
  const pct = test.score != null && test.maxScore
    ? (test.maxScore - test.score) / test.maxScore
    : null

  const scoreColor =
    pct == null ? "text-muted-foreground" :
    pct >= 0.8 ? "text-emerald-400" :
    pct >= 0.5 ? "text-yellow-400" :
    "text-red-400"

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors border ${
        selected
          ? "border-primary/40 bg-primary/5"
          : "border-transparent hover:border-border/60 hover:bg-muted/30"
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{test.subject || "(no subject)"}</p>
        <p className="text-xs text-muted-foreground truncate">{test.fromAddress || "unknown sender"}</p>
      </div>
      <div className="text-right shrink-0">
        {test.score != null ? (
          <p className={`text-sm font-bold ${scoreColor}`}>{(test.maxScore! - test.score!).toFixed(1)}/10</p>
        ) : (
          <p className="text-xs text-muted-foreground capitalize">{test.status}</p>
        )}
        <p className="text-xs text-muted-foreground">{new Date(test.createdAt).toLocaleDateString()}</p>
      </div>
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SpamTestContent({ clientSlug }: { clientSlug: string }) {
  const [tab, setTab] = useState<"test" | "history">("test")

  // Current test state
  const [testAddress, setTestAddress] = useState<string | null>(null)
  const [testId, setTestId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [currentTest, setCurrentTest] = useState<SpamTestRecord | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [polling, setPolling] = useState(false)

  // History state
  const [history, setHistory] = useState<SpamTestRecord[]>([])
  const [selectedHistory, setSelectedHistory] = useState<SpamTestRecord | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

  // Generate a new test address
  const generateAddress = async () => {
    setGenerating(true)
    setCurrentTest(null)
    setTestAddress(null)
    setTestId(null)
    try {
      const res = await fetch(`/api/spam-test/generate?clientSlug=${encodeURIComponent(clientSlug)}`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to generate")
      const data = await res.json()
      setTestAddress(data.testAddress)
      setTestId(data.id)
      setExpiresAt(new Date(data.expiresAt))
      setPolling(true)
    } catch {
      // silently fail — user can retry
    } finally {
      setGenerating(false)
    }
  }

  // Poll for result
  const pollResult = useCallback(async () => {
    if (!testId) return
    try {
      const res = await fetch(`/api/spam-test/results?clientSlug=${encodeURIComponent(clientSlug)}&id=${testId}`, {
        credentials: "include",
      })
      if (!res.ok) return
      const data = await res.json()
      if (data.test?.status === "received") {
        setCurrentTest(data.test)
        setPolling(false)
      }
    } catch {
      // ignore
    }
  }, [testId, clientSlug])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(pollResult, 4000)
    return () => clearInterval(interval)
  }, [polling, pollResult])

  // Load history
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(`/api/spam-test/results?clientSlug=${encodeURIComponent(clientSlug)}`, {
        credentials: "include",
      })
      if (!res.ok) return
      const data = await res.json()
      setHistory(data.tests ?? [])
    } finally {
      setLoadingHistory(false)
    }
  }, [clientSlug])

  useEffect(() => {
    if (tab === "history") loadHistory()
  }, [tab, loadHistory])

  const copyAddress = () => {
    if (!testAddress) return
    navigator.clipboard.writeText(testAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const timeLeft = expiresAt
    ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000 / 60))
    : null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Spam Score Tester</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate a test address, send your campaign to it, and get an instant spam score with a full breakdown.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit border border-border/40">
        {(["test", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
              tab === t
                ? "bg-background text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "history" ? `History` : "Run Test"}
          </button>
        ))}
      </div>

      {/* Run Test tab */}
      {tab === "test" && (
        <div className="space-y-6">
          {/* Step 1: Generate address */}
          <div className="p-6 rounded-xl border border-border/60 bg-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Generate a test address</h2>
                <p className="text-xs text-muted-foreground">A unique inbox address valid for 24 hours.</p>
              </div>
            </div>
            <Button
              onClick={generateAddress}
              disabled={generating}
              size="sm"
              className="gap-2"
            >
              {generating ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <Mail size={14} />
              )}
              {testAddress ? "Generate new address" : "Generate address"}
            </Button>

            {testAddress && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/50">
                <code className="flex-1 text-sm font-mono text-foreground break-all">{testAddress}</code>
                <button
                  onClick={copyAddress}
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
                </button>
                {timeLeft !== null && (
                  <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground">
                    <Clock size={12} />
                    {timeLeft}m
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Send email */}
          {testAddress && (
            <div className="p-6 rounded-xl border border-border/60 bg-card space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Send your campaign email to that address</h2>
                  <p className="text-xs text-muted-foreground">
                    Use your actual sending tool — your ESP, CRM, or email client. Send the email exactly as you&apos;d send it to a real recipient.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Results */}
          {testAddress && (
            <div className="p-6 rounded-xl border border-border/60 bg-card space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">3</span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Your results</h2>
                  <p className="text-xs text-muted-foreground">Results appear automatically once your email is received.</p>
                </div>
              </div>

              {polling && !currentTest && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
                  <RefreshCw size={16} className="animate-spin text-primary" />
                  Waiting for your email to arrive...
                </div>
              )}

              {currentTest && <ResultCard test={currentTest} />}
            </div>
          )}

          {/* Empty state */}
          {!testAddress && (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="w-16 h-16 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center">
                <Mail size={28} className="text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Generate a test address above, send your campaign to it, and get a full spam analysis within seconds.
              </p>
            </div>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === "history" && (
        <div className="space-y-4">
          {loadingHistory ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <RefreshCw size={14} className="animate-spin" />
              Loading history...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <p className="text-sm text-muted-foreground">No tests yet. Run your first spam test to see results here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              {/* List */}
              <div className="lg:col-span-2 space-y-1 p-2 rounded-xl border border-border/60 bg-card">
                {history.map((t) => (
                  <HistoryRow
                    key={t.id}
                    test={t}
                    onSelect={() => setSelectedHistory(t)}
                    selected={selectedHistory?.id === t.id}
                  />
                ))}
              </div>

              {/* Detail */}
              <div className="lg:col-span-3">
                {selectedHistory ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Test run</p>
                        <p className="text-sm text-foreground">{new Date(selectedHistory.createdAt).toLocaleString()}</p>
                      </div>
                      <Badge variant="outline" className="capitalize text-xs">{selectedHistory.status}</Badge>
                    </div>
                    {selectedHistory.status === "received" ? (
                      <ResultCard test={selectedHistory} />
                    ) : (
                      <div className="p-6 rounded-xl border border-border/60 bg-card text-center">
                        <p className="text-sm text-muted-foreground capitalize">{selectedHistory.status} — no results available</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-[200px] text-sm text-muted-foreground">
                    Select a test from the list to view details.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
