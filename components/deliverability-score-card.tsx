"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Lock, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertCircle, ExternalLink, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"

interface DeliverabilityData {
  hasData: boolean
  locked: boolean
  scoreOutOf100: number | null
  sendCount?: number | null
  inboxRate?: number | null
  inboxCount?: number | null
  spamCount?: number | null
  checks?: {
    spf: boolean | null
    dkim: boolean | null
    dmarc: boolean | null
    dmarcAlignment: boolean | null
    tls: boolean | null
    oneClickUnsubscribe: boolean | null
    unsubscribeLinkInBody: boolean | null
    bothSpfAndDkim: boolean | null
    validMessageId: boolean | null
    noFakeReplyPrefix: boolean | null
    noDeceptiveEmojisInSubject: boolean | null
    singleFromAddress: boolean | null
  }
}

function ScoreRing({ score, locked }: { score: number | null; locked: boolean }) {
  const displayScore = score ?? 0
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const progress = locked ? 0 : (displayScore / 100) * circumference
  const strokeColor =
    displayScore >= 80 ? "#22c55e" : displayScore >= 60 ? "#f59e0b" : "#ef4444"

  return (
    <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
      <svg width="110" height="110" className="-rotate-90">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        {!locked && score !== null && (
          <circle
            cx="55"
            cy="55"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {locked ? (
          <Lock className="h-6 w-6 text-muted-foreground" />
        ) : (
          <>
            <span className="text-2xl font-bold leading-none" style={{ color: strokeColor }}>
              {score !== null ? score : "—"}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">/ 100</span>
          </>
        )}
      </div>
    </div>
  )
}

function CheckRow({ label, value, description }: { label: string; value: boolean | null; description?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex-shrink-0 mt-0.5">
        {value === true ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : value === false ? (
          <XCircle className="h-4 w-4 text-red-500" />
        ) : (
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {description && value === false && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      <span className={`text-xs font-semibold flex-shrink-0 ${value === true ? "text-green-500" : value === false ? "text-red-500" : "text-muted-foreground"}`}>
        {value === true ? "Pass" : value === false ? "Fail" : "N/A"}
      </span>
    </div>
  )
}

const CHECK_META: Record<string, { label: string; improvement: string }> = {
  spf: {
    label: "SPF Record",
    improvement: "Add a valid SPF record to your DNS. This tells receiving servers which IPs are authorized to send on your behalf.",
  },
  dkim: {
    label: "DKIM Signing",
    improvement: "Configure DKIM signing in your email platform and publish the public key in your DNS records.",
  },
  dmarc: {
    label: "DMARC Policy",
    improvement: "Publish a DMARC record (p=quarantine or p=reject) to protect your domain from spoofing.",
  },
  dmarcAlignment: {
    label: "DMARC Alignment",
    improvement: "Ensure your From domain aligns with both SPF and DKIM domains for full DMARC alignment.",
  },
  tls: {
    label: "TLS Encryption",
    improvement: "Ensure your sending infrastructure supports TLS 1.2+ for encrypted email delivery.",
  },
  oneClickUnsubscribe: {
    label: "One-Click Unsubscribe Header",
    improvement: "Add List-Unsubscribe-Post and List-Unsubscribe headers to comply with Gmail & Yahoo bulk sender requirements.",
  },
  unsubscribeLinkInBody: {
    label: "Unsubscribe Link in Body",
    improvement: "Include a visible unsubscribe link in the body of every email — required by CAN-SPAM.",
  },
  validMessageId: {
    label: "Valid Message-ID",
    improvement: "Use a Message-ID header that matches your sending domain to improve spam filter trust.",
  },
  noFakeReplyPrefix: {
    label: "No Fake RE:/FWD: Prefix",
    improvement: "Avoid using RE: or FWD: prefixes in subjects when the email is not a reply or forward — this is deceptive.",
  },
  noDeceptiveEmojisInSubject: {
    label: "No Deceptive Subject Emojis",
    improvement: "Remove emojis that simulate notification badges or alerts from subject lines.",
  },
  singleFromAddress: {
    label: "Consistent From Address",
    improvement: "Use a single consistent From address to build sender reputation over time.",
  },
}

interface Props {
  slug: string
  clientSlug: string
  isAuthenticated: boolean
}

export function DeliverabilityScoreCard({ slug, clientSlug, isAuthenticated }: Props) {
  const [data, setData] = useState<DeliverabilityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [checksExpanded, setChecksExpanded] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/public/directory/${slug}/deliverability`, {
          credentials: "include",
        })
        if (res.ok) {
          setData(await res.json())
        }
      } catch {
        // Silently fail — don't show broken card
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [slug])

  // Don't render until we know if data exists
  if (loading) return null
  // Don't render if no compliance data exists for this entity
  if (!data || !data.hasData) return null

  const upgradeHref = isAuthenticated
    ? `/${clientSlug}/billing`
    : "/login"
  const upgradeCta = isAuthenticated ? "Upgrade to Professional" : "Sign In to View"

  const failingChecks = data.locked
    ? []
    : Object.entries(data.checks ?? {}).filter(([, v]) => v === false)

  const score = data.scoreOutOf100

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden mb-8">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#dc2a28]" />
          <h2 className="font-semibold text-sm">Deliverability Score</h2>
        </div>
        {data.locked && (
          <span className="text-xs font-medium text-[#dc2a28] flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Professional Plan
          </span>
        )}
        {!data.locked && (
          <span className="text-xs text-muted-foreground">
            {data.sendCount ? `Across ${data.sendCount} send${data.sendCount === 1 ? "" : "s"}` : "All-time average"}
          </span>
        )}
      </div>

      {/* Score row */}
      <div className={`flex items-center gap-6 p-5 ${data.locked ? "relative" : ""}`}>
        <div className={data.locked ? "filter blur-sm pointer-events-none select-none" : ""}>
          <ScoreRing score={score} locked={false} />
        </div>

        <div className={`flex-1 ${data.locked ? "filter blur-sm pointer-events-none select-none" : ""}`}>
          {!data.locked ? (
            <>
              <p className="text-sm font-medium mb-1">
                {score !== null && score >= 80 ? "Strong deliverability" : score !== null && score >= 60 ? "Room for improvement" : "Deliverability issues detected"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Averaged across {data.sendCount ?? "all"} send{data.sendCount === 1 ? "" : "s"} — {Object.keys(data.checks ?? {}).length} authentication and compliance checks.
              </p>
              {data.inboxRate !== null && data.inboxRate !== undefined && (
                <div className="flex items-center gap-4 mt-3">
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-500">
                      {/* inboxRate may be 0–1 float or 0–100 integer depending on DB value */}
                      {Math.round((data.inboxRate > 1 ? data.inboxRate : data.inboxRate * 100))}%
                    </p>
                    <p className="text-xs text-muted-foreground">Inbox Rate</p>
                  </div>
                  {data.inboxCount != null && (
                    <div className="text-center">
                      <p className="text-lg font-bold">{data.inboxCount}</p>
                      <p className="text-xs text-muted-foreground">Inboxed</p>
                    </div>
                  )}
                  {data.spamCount != null && (
                    <div className="text-center">
                      <p className="text-lg font-bold text-red-500">{data.spamCount}</p>
                      <p className="text-xs text-muted-foreground">Spam</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium mb-1">
                {score !== null && score >= 80 ? "Strong deliverability" : score !== null && score >= 60 ? "Room for improvement" : score !== null ? "Deliverability issues detected" : "Deliverability data available"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Authentication checks, inbox placement rates, and compliance breakdown.
              </p>
            </>
          )}
        </div>

        {/* Locked overlay */}
        {data.locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-card/60 backdrop-blur-[2px] rounded-b-none z-10 gap-3 px-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <ShieldAlert className="h-7 w-7 text-[#dc2a28]" />
              <p className="text-sm font-semibold">Deliverability report locked</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Upgrade to Professional to see full authentication scores, inbox placement rates, and compliance checks.
              </p>
            </div>
            <Link href={upgradeHref}>
              <Button size="sm" className="bg-[#dc2a28] hover:bg-[#c02422] text-white text-xs px-4">
                {upgradeCta}
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Checks breakdown — only shown when unlocked */}
      {!data.locked && data.checks && (
        <div className="border-t border-border">
          {/* Collapsible toggle */}
          <button
            onClick={() => setChecksExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
          >
            <span>Authentication &amp; Compliance Checks</span>
            {checksExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {checksExpanded && (
            <div className="px-5 pb-5">
              <div className="rounded-lg border border-border bg-background/50 px-4 py-1">
                {Object.entries(data.checks).map(([key, value]) => {
                  const meta = CHECK_META[key]
                  if (!meta) return null
                  return (
                    <CheckRow
                      key={key}
                      label={meta.label}
                      value={value}
                      description={meta.improvement}
                    />
                  )
                })}
              </div>

              {/* How to improve — only show if there are failing checks */}
              {failingChecks.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    How to Improve
                  </p>
                  <div className="flex flex-col gap-2">
                    {failingChecks.map(([key]) => {
                      const meta = CHECK_META[key]
                      if (!meta) return null
                      return (
                        <div key={key} className="flex items-start gap-2">
                          <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                          <div>
                            <span className="text-xs font-semibold text-foreground">{meta.label}: </span>
                            <span className="text-xs text-muted-foreground">{meta.improvement}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <a
                    href="https://support.google.com/mail/answer/81126"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-3 transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Google Bulk Sender Guidelines
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
