"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Copy, Check, RefreshCw, Mail, ShieldCheck, ShieldX, Minus, Clock,
  ChevronDown, ChevronUp, AlertTriangle, Link2, Eye, EyeOff, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"

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

interface BlocklistResult {
  list: string
  listed: boolean
  value: string
  type: "ip" | "domain"
}

interface LinkCheckResult {
  url: string
  ok: boolean
  statusCode?: number
  error?: string
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
  blocklistResults?: BlocklistResult[]
  linkCheckResults?: LinkCheckResult[]
  bodyHtml?: string
  bodyText?: string
  createdAt: string
}

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, maxScore }: { score: number; maxScore: number }) {
  const normalized = Math.max(0, Math.min(score, maxScore))
  const qualityScore = Math.max(0, maxScore - normalized)
  const pct = qualityScore / maxScore
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct)
  const strokeColor = pct >= 0.8 ? "#34d399" : pct >= 0.5 ? "#facc15" : "#f87171"
  const textColor = pct >= 0.8 ? "text-emerald-400" : pct >= 0.5 ? "text-yellow-400" : "text-red-400"
  const label = pct >= 0.8 ? "Good" : pct >= 0.5 ? "Fair" : "Poor"

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
          <circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={strokeColor} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${textColor}`}>{qualityScore.toFixed(1)}</span>
          <span className="text-xs text-muted-foreground">/ {maxScore}</span>
        </div>
      </div>
      <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
    </div>
  )
}

// ─── Section accordion ────────────────────────────────────────────────────────

type SectionStatus = "pass" | "fail" | "warn" | "neutral"

function SectionAccordion({
  title,
  status,
  defaultOpen = false,
  children,
}: {
  title: string
  status: SectionStatus
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  const iconMap: Record<SectionStatus, React.ReactNode> = {
    pass: <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"><Check size={12} className="text-emerald-400" /></div>,
    fail: <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center"><ShieldX size={12} className="text-red-400" /></div>,
    warn: <div className="w-6 h-6 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center"><AlertTriangle size={12} className="text-yellow-400" /></div>,
    neutral: <div className="w-6 h-6 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center"><Minus size={12} className="text-muted-foreground" /></div>,
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/20 transition-colors text-left"
      >
        {iconMap[status]}
        <span className="flex-1 text-sm font-semibold text-foreground">{title}</span>
        {open ? <ChevronUp size={15} className="text-muted-foreground shrink-0" /> : <ChevronDown size={15} className="text-muted-foreground shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-5 border-t border-border/40 pt-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Message preview ──────────────────────────────────────────────────────────

function MessagePreview({ bodyHtml, bodyText, subject, fromAddress }: {
  bodyHtml?: string
  bodyText?: string
  subject?: string
  fromAddress?: string
}) {
  const [showHtml, setShowHtml] = useState(false)

  if (!bodyHtml && !bodyText) {
    return <p className="text-sm text-muted-foreground">No message body captured.</p>
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">From</p>
          <p className="text-foreground truncate">{fromAddress || "unknown"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-0.5">Subject</p>
          <p className="text-foreground truncate">{subject || "(no subject)"}</p>
        </div>
      </div>
      {bodyHtml && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHtml((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showHtml ? <EyeOff size={13} /> : <Eye size={13} />}
            {showHtml ? "Hide rendered HTML" : "Show rendered HTML"}
          </button>
        </div>
      )}
      {showHtml && bodyHtml ? (
        <div
          className="rounded-lg border border-border/50 bg-white p-4 overflow-auto max-h-96 text-sm"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      ) : (
        bodyText && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/30 rounded-lg p-4 max-h-48 overflow-auto font-mono">
            {bodyText.slice(0, 1500)}{bodyText.length > 1500 ? "\n…(truncated)" : ""}
          </pre>
        )
      )}
    </div>
  )
}

// ─── SpamAssassin section ─────────────────────────────────────────────────────

function SpamAssassinSection({ rules, score }: { rules: SpamRule[]; score?: number }) {
  const [expanded, setExpanded] = useState(false)
  const badRules = rules.filter((r) => r.score > 0).sort((a, b) => b.score - a.score)
  const goodRules = rules.filter((r) => r.score <= 0).sort((a, b) => a.score - b.score)
  const visibleBad = expanded ? badRules : badRules.slice(0, 5)
  const visibleGood = expanded ? goodRules : []

  if (rules.length === 0) return (
    <p className="text-sm text-muted-foreground">No SpamAssassin data available.</p>
  )

  return (
    <div className="space-y-3">
      {score != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Raw score:</span>
          <span className={`font-mono font-semibold ${score <= 2 ? "text-emerald-400" : score <= 5 ? "text-yellow-400" : "text-red-400"}`}>
            {score.toFixed(2)} / 10
          </span>
          <span className="text-xs text-muted-foreground">(lower is better)</span>
        </div>
      )}
      <div className="space-y-1.5">
        {visibleBad.map((rule) => (
          <div key={rule.name} className="flex items-start gap-3 text-sm">
            <span className="font-mono text-xs w-12 shrink-0 pt-0.5 text-right text-red-400">
              +{rule.score.toFixed(2)}
            </span>
            <div>
              <span className="font-mono text-xs text-muted-foreground">{rule.name}</span>
              <p className="text-xs text-muted-foreground">{rule.description}</p>
            </div>
          </div>
        ))}
        {expanded && visibleGood.length > 0 && (
          <>
            <div className="border-t border-border/30 pt-2 mt-2">
              <p className="text-xs text-muted-foreground mb-1.5">Positive signals (reduce score):</p>
              {visibleGood.map((rule) => (
                <div key={rule.name} className="flex items-start gap-3 text-sm">
                  <span className="font-mono text-xs w-12 shrink-0 pt-0.5 text-right text-emerald-400">
                    {rule.score.toFixed(2)}
                  </span>
                  <div>
                    <span className="font-mono text-xs text-muted-foreground">{rule.name}</span>
                    <p className="text-xs text-muted-foreground">{rule.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      {(badRules.length > 5 || goodRules.length > 0) && (
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded
            ? "Show less"
            : `Show all ${rules.length} rules${goodRules.length > 0 ? ` (${goodRules.length} positive signal${goodRules.length !== 1 ? "s" : ""})` : ""}`}
        </button>
      )}
    </div>
  )
}

// ─── Auth section ─────────────────────────────────────────────────────────────

function AuthSection({ spf, dkim, dmarc }: { spf?: string; dkim?: string; dmarc?: string }) {
  const rows = [
    { label: "SPF", result: spf, description: "Verifies the sending server is authorized to send mail for the domain." },
    { label: "DKIM", result: dkim, description: "Cryptographic signature confirming the email wasn't altered in transit." },
    { label: "DMARC", result: dmarc, description: "Policy that instructs receivers how to handle SPF/DKIM failures." },
  ]
  return (
    <div className="space-y-3">
      {rows.map(({ label, result, description }) => {
        const pass = result === "pass"
        const fail = result === "fail" || result === "softfail"
        return (
          <div key={label} className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              {pass ? <ShieldCheck size={15} className="text-emerald-400" />
                : fail ? <ShieldX size={15} className="text-red-400" />
                : <Minus size={15} className="text-muted-foreground" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {label}{" "}
                <span className={`font-normal capitalize text-xs ${pass ? "text-emerald-400" : fail ? "text-red-400" : "text-muted-foreground"}`}>
                  {result ?? "none"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Formatting section ───────────────────────────────────────────────────────

function FormattingSection({ html }: { html: HtmlAnalysis }) {
  const items = [
    {
      label: "HTML body",
      ok: html.hasHtml,
      detail: html.hasHtml ? "Present" : "Missing — text only",
      desc: "HTML emails generally render better and are expected by most ESPs.",
    },
    {
      label: "Unsubscribe link",
      ok: html.hasUnsubscribe,
      detail: html.hasUnsubscribe ? "Found" : "Not found",
      desc: "Required by CAN-SPAM. Missing unsubscribe links hurt deliverability.",
    },
    {
      label: "Text/HTML ratio",
      ok: html.textHtmlRatio >= 0.1,
      detail: `${(html.textHtmlRatio * 100).toFixed(0)}%`,
      desc: "A healthy ratio of text to HTML helps avoid spam filters.",
    },
    {
      label: "Links",
      ok: html.linkCount <= 15,
      detail: `${html.linkCount} link${html.linkCount !== 1 ? "s" : ""}`,
      desc: "Excessive links can trigger spam filters.",
    },
    {
      label: "Images",
      ok: html.imageCount <= 5,
      detail: `${html.imageCount} image${html.imageCount !== 1 ? "s" : ""}`,
      desc: "Image-heavy emails with little text are often flagged.",
    },
  ]

  return (
    <div className="space-y-3">
      {items.map(({ label, ok, detail, desc }) => (
        <div key={label} className="flex items-start gap-3">
          <div className="mt-0.5 shrink-0">
            {ok ? <Check size={15} className="text-emerald-400" /> : <AlertTriangle size={15} className="text-yellow-400" />}
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {label}{" "}
              <span className={`font-normal text-xs ${ok ? "text-emerald-400" : "text-yellow-400"}`}>{detail}</span>
            </p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Blocklist section ────────────────────────────────────────────────────────

function BlocklistSection({ results }: { results: BlocklistResult[] }) {
  if (results.length === 0) return (
    <p className="text-sm text-muted-foreground">No blocklist data available.</p>
  )
  const anyListed = results.some((r) => r.listed)
  return (
    <div className="space-y-2">
      {!anyListed && (
        <p className="text-sm text-emerald-400 mb-3">Your sending IP and domain are not listed on any major blocklists.</p>
      )}
      {results.map((r) => (
        <div key={r.list} className="flex items-center gap-3 text-sm">
          {r.listed
            ? <ShieldX size={15} className="text-red-400 shrink-0" />
            : <Check size={15} className="text-emerald-400 shrink-0" />}
          <span className="font-medium text-foreground w-36 shrink-0">{r.list}</span>
          <span className={`text-xs ${r.listed ? "text-red-400" : "text-muted-foreground"}`}>
            {r.listed ? `Listed (${r.value})` : `Clean (${r.type === "ip" ? "IP" : "domain"}: ${r.value === "unknown" ? "not detected" : r.value})`}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Link check section ───────────────────────────────────────────────────────

function LinkCheckSection({ results }: { results: LinkCheckResult[] }) {
  if (results.length === 0) return (
    <p className="text-sm text-muted-foreground">No links found in this email.</p>
  )
  const broken = results.filter((r) => !r.ok)
  return (
    <div className="space-y-2">
      {broken.length === 0 && (
        <p className="text-sm text-emerald-400 mb-3">All {results.length} link{results.length !== 1 ? "s" : ""} resolved successfully.</p>
      )}
      {results.map((r) => (
        <div key={r.url} className="flex items-start gap-3 text-sm">
          {r.ok
            ? <Check size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            : <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono text-muted-foreground hover:text-foreground truncate block max-w-xs"
            >
              {r.url.length > 60 ? r.url.slice(0, 60) + "…" : r.url}
              <ExternalLink size={10} className="inline ml-1" />
            </a>
            {!r.ok && (
              <p className="text-xs text-red-400">{r.error ?? `HTTP ${r.statusCode}`}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ test }: { test: SpamTestRecord }) {
  const score = test.score ?? 0
  const maxScore = test.maxScore ?? 10
  const qualityScore = Math.max(0, maxScore - score)
  const pct = qualityScore / maxScore

  // Compute section statuses
  const spamStatus: SectionStatus = pct >= 0.8 ? "pass" : pct >= 0.5 ? "warn" : "fail"

  const authPass = test.spfResult === "pass" && test.dkimResult === "pass"
  const authStatus: SectionStatus = authPass ? "pass" : test.spfResult === "none" && test.dkimResult === "none" ? "neutral" : "warn"

  const htmlAnalysis = test.htmlAnalysis
  const formattingOk = htmlAnalysis ? htmlAnalysis.hasUnsubscribe && htmlAnalysis.linkCount <= 15 : null
  const formattingStatus: SectionStatus = formattingOk == null ? "neutral" : formattingOk ? "pass" : "warn"

  const anyListed = test.blocklistResults?.some((r) => r.listed) ?? false
  const blocklistStatus: SectionStatus = test.blocklistResults == null ? "neutral" : anyListed ? "fail" : "pass"

  const brokenLinks = test.linkCheckResults?.filter((r) => !r.ok) ?? []
  const linkStatus: SectionStatus = test.linkCheckResults == null ? "neutral"
    : brokenLinks.length === 0 ? "pass" : "warn"

  return (
    <div className="space-y-4">
      {/* Score header */}
      <div className="flex items-center gap-6 p-5 rounded-xl border border-border/60 bg-card">
        <ScoreRing score={score} maxScore={maxScore} />
        <div className="space-y-1">
          <p className="text-lg font-bold text-foreground">
            {qualityScore.toFixed(1)} / {maxScore}
          </p>
          <p className="text-sm text-muted-foreground">{test.subject || "(no subject)"}</p>
          <p className="text-xs text-muted-foreground">{test.fromAddress}</p>
          {test.receivedAt && (
            <p className="text-xs text-muted-foreground">
              Received {new Date(test.receivedAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Accordion sections */}
      <SectionAccordion title="Message preview" status="neutral" defaultOpen={false}>
        <MessagePreview
          bodyHtml={test.bodyHtml}
          bodyText={test.bodyText}
          subject={test.subject}
          fromAddress={test.fromAddress}
        />
      </SectionAccordion>

      <SectionAccordion
        title={spamStatus === "pass" ? "SpamAssassin likes you" : "SpamAssassin flagged issues"}
        status={spamStatus}
        defaultOpen={spamStatus !== "pass"}
      >
        <SpamAssassinSection rules={test.spamRules ?? []} score={test.score} />
      </SectionAccordion>

      <SectionAccordion
        title={authStatus === "pass" ? "You're properly authenticated" : "Authentication issues found"}
        status={authStatus}
        defaultOpen={authStatus !== "pass"}
      >
        <AuthSection spf={test.spfResult} dkim={test.dkimResult} dmarc={test.dmarcResult} />
      </SectionAccordion>

      {htmlAnalysis && (
        <SectionAccordion
          title={formattingStatus === "pass" ? "Your message is safe and well formatted" : "Formatting warnings"}
          status={formattingStatus}
          defaultOpen={formattingStatus !== "pass"}
        >
          <FormattingSection html={htmlAnalysis} />
        </SectionAccordion>
      )}

      <SectionAccordion
        title={blocklistStatus === "pass" ? "You're not blocklisted" : blocklistStatus === "neutral" ? "Blocklist check" : "Blocklist issues found"}
        status={blocklistStatus}
        defaultOpen={blocklistStatus === "fail"}
      >
        <BlocklistSection results={test.blocklistResults ?? []} />
      </SectionAccordion>

      {test.linkCheckResults != null && (
        <SectionAccordion
          title={linkStatus === "pass" ? `All links resolve (${test.linkCheckResults.length})` : `Broken links found (${brokenLinks.length})`}
          status={linkStatus}
          defaultOpen={linkStatus !== "pass"}
        >
          <LinkCheckSection results={test.linkCheckResults} />
        </SectionAccordion>
      )}
    </div>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ test, onSelect, selected }: {
  test: SpamTestRecord
  onSelect: () => void
  selected: boolean
}) {
  const pct = test.score != null && test.maxScore
    ? (test.maxScore - test.score) / test.maxScore : null
  const scoreColor = pct == null ? "text-muted-foreground"
    : pct >= 0.8 ? "text-emerald-400"
    : pct >= 0.5 ? "text-yellow-400"
    : "text-red-400"

  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-lg text-left transition-colors border ${
        selected ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border/60 hover:bg-muted/30"
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
  const [testAddress, setTestAddress] = useState<string | null>(null)
  const [testId, setTestId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [currentTest, setCurrentTest] = useState<SpamTestRecord | null>(null)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [polling, setPolling] = useState(false)
  const [history, setHistory] = useState<SpamTestRecord[]>([])
  const [selectedHistory, setSelectedHistory] = useState<SpamTestRecord | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)

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

  const pollResult = useCallback(async () => {
    if (!testId) return
    try {
      const res = await fetch(
        `/api/spam-test/results?clientSlug=${encodeURIComponent(clientSlug)}&id=${testId}`,
        { credentials: "include" }
      )
      if (!res.ok) return
      const data = await res.json()
      if (data.test?.status === "received") {
        setCurrentTest(data.test)
        setPolling(false)
      }
    } catch { /* ignore */ }
  }, [testId, clientSlug])

  useEffect(() => {
    if (!polling) return
    const interval = setInterval(pollResult, 4000)
    return () => clearInterval(interval)
  }, [polling, pollResult])

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const res = await fetch(
        `/api/spam-test/results?clientSlug=${encodeURIComponent(clientSlug)}`,
        { credentials: "include" }
      )
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Spam Score Tester</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate a test address, send your campaign to it, and get a full deliverability breakdown.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/40 rounded-lg w-fit border border-border/40">
        {(["test", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-background text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "test" ? "Run Test" : "History"}
          </button>
        ))}
      </div>

      {/* Run Test tab */}
      {tab === "test" && (
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="p-5 rounded-xl border border-border/60 bg-card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">1</span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">Generate a test address</h2>
                <p className="text-xs text-muted-foreground">A unique inbox address valid for 24 hours.</p>
              </div>
            </div>
            <Button onClick={generateAddress} disabled={generating} size="sm" className="gap-2">
              {generating ? <RefreshCw size={14} className="animate-spin" /> : <Mail size={14} />}
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

          {/* Step 2 */}
          {testAddress && !currentTest && (
            <div className="p-5 rounded-xl border border-border/60 bg-card">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Send your campaign to that address</h2>
                  <p className="text-xs text-muted-foreground">
                    Use your actual sending tool — ESP, CRM, or email client. Send exactly as you&apos;d send it to a real recipient.
                  </p>
                </div>
              </div>
              {polling && (
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-4 ml-10">
                  <RefreshCw size={14} className="animate-spin text-primary" />
                  Waiting for your email to arrive...
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {currentTest && <ResultCard test={currentTest} />}

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
              <div className="lg:col-span-3">
                {selectedHistory ? (
                  <ResultCard test={selectedHistory} />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center gap-2">
                    <Link2 size={24} className="text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Select a test from the list to view details.</p>
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
