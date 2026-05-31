"use client"

import { useState, useEffect, useRef } from "react"
import {
  ChevronDown,
  Check,
  X,
  HelpCircle,
  RefreshCw,
  Shield,
  Send,
  User,
  Globe,
  Info,
  ChevronRight,
  Plus,
  Copy,
  Loader2,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "manual"
type Category = "Authentication" | "Google Bulk Sender Rules" | "Sender Practices" | "Sender Identity"

interface EmailSample {
  id: string
  source: "seed" | "ci"
  seedEmail: string | null
  fromAddress: string | null
  subject: string | null
  receivedAt: string | null
  placement: string
  checks: Record<string, boolean>
}

interface DomainCheck {
  id: string
  category: Category
  name: string
  summary: string
  why: string
  currentState?: string
  fix?: string[]
  manualSteps?: string[]
}





const CHECKS: DomainCheck[] = [
  // Authentication
  {
    id: "spf",
    category: "Authentication",
    name: "SPF Record",
    summary: "Identifies which mail servers can send for the domain.",
    why: "SPF (Sender Policy Framework) lets receiving servers verify that mail claiming to be from your domain actually came from an authorized server. Without SPF, your emails are trivially spoofable and will be aggressively filtered by Gmail.",
    fix: [
      "Log in to your DNS provider (Cloudflare, GoDaddy, etc.).",
      "Add a TXT record at {domain} starting with: v=spf1 include:_spf.youresp.com ~all",
      "Replace 'youresp.com' with your actual sending provider's SPF include.",
      "Allow 24–48 hours for DNS propagation before re-scanning.",
    ],
  },
  {
    id: "dkim",
    category: "Authentication",
    name: "DKIM Signing",
    summary: "Cryptographically signs every outbound message.",
    why: "DKIM adds a digital signature to each email that receivers can verify against a public key in your DNS. It proves the email was not tampered with in transit and is required by Google for bulk senders.",
    fix: [
      "Generate a DKIM key pair in your email sending platform (SendGrid, Mailchimp, etc.).",
      "Add the provided TXT record to your DNS at the selector subdomain (e.g. selector1._domainkey.{domain}).",
      "Enable DKIM signing in your sending platform settings.",
      "Confirm the signature is appearing on outbound mail by checking the email headers.",
    ],
  },
  {
    id: "dmarc",
    category: "Authentication",
    name: "DMARC Policy",
    summary: "Tells receivers what to do when SPF or DKIM fail.",
    why: "Google requires bulk senders to publish a DMARC record with at least p=none. Without DMARC, the domain will be aggressively filtered. A DMARC record also unlocks aggregate reports that show you who is sending on your behalf.",
    fix: [
      "Add a TXT record at _dmarc.{domain}",
      "Start with: v=DMARC1; p=none; rua=mailto:dmarc@{domain}",
      "Run in monitor mode for 2–4 weeks and review the aggregate reports.",
      "Once stable, escalate to p=quarantine, then p=reject.",
    ],
  },
  {
    id: "dmarc_align",
    category: "Authentication",
    name: "DMARC Alignment",
    summary: "From: header domain aligns with SPF or DKIM domain.",
    why: "Even with SPF and DKIM passing, DMARC can fail if the From: domain doesn't align with the authenticated domain. Google checks alignment and will filter mail where the visible From address doesn't match the authenticated envelope.",
    fix: [
      "Ensure your sending platform uses the same domain in the From: address as in the SPF/DKIM setup.",
      "Avoid using a subdomain in From: if SPF/DKIM is on the root domain without relaxed alignment.",
      "Check your DMARC record for adkim and aspf tags — set to 'r' (relaxed) if using subdomains.",
    ],
  },
  {
    id: "rdns",
    category: "Authentication",
    name: "Reverse DNS (PTR)",
    summary: "Sending IPs resolve back to a valid hostname.",
    why: "Gmail and most spam filters perform a reverse DNS lookup on the sending IP. If the IP does not resolve to a hostname, or the hostname does not point back to the IP, the message will often be rejected or sent to spam.",
    fix: [
      "Contact your sending IP provider or ESP and request a PTR record be set for your sending IPs.",
      "Ensure the hostname in the PTR record has a forward DNS A record pointing back to the same IP.",
    ],
  },
  {
    id: "tls",
    category: "Authentication",
    name: "TLS Encryption",
    summary: "Messages are transmitted over an encrypted connection.",
    why: "Google requires that mail be transmitted over TLS. Mail sent over unencrypted connections will be flagged in Gmail's interface with a security warning, significantly reducing recipient trust.",
    fix: [
      "Ensure your sending server supports and enforces TLS 1.2 or higher.",
      "Contact your ESP if you are unsure — most modern platforms support TLS by default.",
    ],
  },
  {
    id: "arc",
    category: "Authentication",
    name: "ARC Headers",
    summary: "Authenticated Received Chain for forwarded mail.",
    why: "ARC preserves authentication results across mail forwarding and mailing list re-sends. It is not required, but its presence improves deliverability for forwarded messages and signals a well-configured mail stack.",
    manualSteps: [
      "Verify your sending platform or MTA supports ARC signing.",
      "If using Google Workspace or Microsoft 365, ARC is typically handled automatically.",
      "For custom MTAs (Postfix, Exim), install and configure an ARC signing library.",
    ],
  },
  // Google Bulk Sender Rules
  {
    id: "one_click_unsub",
    category: "Google Bulk Sender Rules",
    name: "One-Click Unsubscribe",
    summary: "RFC 8058 List-Unsubscribe-Post header.",
    why: "As of February 2024, Google requires bulk senders to implement one-click unsubscribe via the List-Unsubscribe-Post header. Without it, Gmail will show a prominent unsubscribe button that routes through their own flow, damaging your reputation.",
    fix: [
      "Add both List-Unsubscribe and List-Unsubscribe-Post headers to every outbound message.",
      "The List-Unsubscribe-Post value must be exactly: List-Unsubscribe=One-Click",
      "The List-Unsubscribe value must include a POST-capable URL (not just a mailto: link).",
      "Most modern ESPs (Klaviyo, SendGrid, etc.) have a toggle for this ��� enable it in sending settings.",
    ],
  },
  {
    id: "unsub_link",
    category: "Google Bulk Sender Rules",
    name: "Visible Unsubscribe Link in Body",
    summary: "Clearly visible unsub link inside the message.",
    why: "Google requires that every bulk email contain a clearly visible unsubscribe link in the body of the message. Hiding the link in small print or omitting it entirely will trigger spam classification.",
    fix: [
      "Add a visible 'Unsubscribe' link to the footer of every email template.",
      "Ensure the link is not hidden by tiny font sizes, low-contrast color, or image-only formatting.",
      "Test by viewing the email as a recipient and confirming the unsubscribe link is easy to find.",
    ],
  },
  {
    id: "unsub_7d",
    category: "Google Bulk Sender Rules",
    name: "Unsubscribe Honored Within 2 Days",
    summary: "Opt-outs must be processed within 2 business days.",
    why: "Google's bulk sender policy requires that unsubscribe requests be honored within two business days. Continued sending to opted-out recipients damages your domain reputation and is a CAN-SPAM violation.",
    manualSteps: [
      "Log in to your list management platform and check how quickly suppression is applied.",
      "Run a test: opt out a test address and verify it is suppressed within 48 hours.",
      "If using a homegrown system, review your suppression processing job frequency.",
    ],
  },
  {
    id: "spam_rate",
    category: "Google Bulk Sender Rules",
    name: "Spam Rate Below 0.10%",
    summary: "Gmail requires spam rate stays under 0.10%.",
    why: "Google requires that your domain's spam rate stay below 0.10% as measured in Google Postmaster Tools. Sustained rates above 0.30% will cause Gmail to block all mail from your domain.",
    manualSteps: [
      "Sign up for Google Postmaster Tools at postmaster.google.com.",
      "Add and verify your sending domain.",
      "Monitor the Spam Rate dashboard — it updates daily with a 3-day lag.",
      "If your spam rate is elevated, audit your list hygiene and remove unengaged recipients.",
    ],
  },
  // Sender Practices
  {
    id: "ip_rep",
    category: "Sender Practices",
    name: "IP Reputation",
    summary: "Sending IPs should have a good reputation score.",
    why: "Google Postmaster Tools tracks the reputation of your sending IPs separately from your domain reputation. Low IP reputation — even with a clean domain — will cause inbox placement to drop significantly.",
    manualSteps: [
      "Sign up for Google Postmaster Tools at postmaster.google.com.",
      "Navigate to IP Reputation and check your sending IPs.",
      "If reputation is Low or Bad, investigate recent sending activity for spam-like patterns.",
      "Consider warming up new IPs gradually before high-volume sends.",
    ],
  },
  {
    id: "from_domain",
    category: "Sender Practices",
    name: "Consistent From Domain",
    summary: "All senders use the same root domain in the From: address.",
    why: "Sending from multiple inconsistent domains or switching domains frequently confuses spam filters and prevents your domain from building a reputation history with Gmail.",
  },
  // Sender Identity
  {
    id: "sender_name",
    category: "Sender Identity",
    name: "Display Name Audit",
    summary: "Sender display names follow best practices.",
    why: "Gmail uses display names as a spam signal. Names using urgency language ('URGENT', 'ACTION REQUIRED'), all caps, or names that don't match the registered organization often trigger spam classification. Consistent, recognizable display names improve inbox placement.",
  },
  {
    id: "display_name",
    category: "Sender Identity",
    name: "No Gmail Impersonation",
    summary: "Display name does not impersonate Gmail or Google.",
    why: "Using display names that impersonate Gmail, Google, or other mail providers is a hard policy violation and will result in immediate filtering. Gmail also watches for names that impersonate government agencies or financial institutions.",
    manualSteps: [
      "Review the display names observed above and confirm none include 'Gmail', 'Google', 'IRS', 'Federal', or similar.",
      "Check your email templates and sending platform for any deprecated sender profiles.",
      "Mark as verified once you have confirmed no impersonation is in use.",
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function gradeFor(pct: number) {
  if (pct >= 95) return { letter: "A", label: "Excellent", tag: "Meets all Google requirements", color: "#16a34a" }
  if (pct >= 85) return { letter: "B", label: "Solid Foundation", tag: "Address the open items to reach A", color: "#65a30d" }
  if (pct >= 70) return { letter: "C", label: "Needs Work", tag: "Several critical issues present", color: "#d97706" }
  if (pct >= 50) return { letter: "D", label: "At Risk", tag: "High likelihood of spam filtering", color: "#ea580c" }
  return { letter: "F", label: "Critical", tag: "Mail is likely being blocked", color: "#dc2626" }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status, size = 22 }: { status: CheckStatus; size?: number }) {
  if (status === "pass") {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, background: "#16a34a1a" }}>
        <Check size={size * 0.5} strokeWidth={3} className="text-green-700" />
      </div>
    )
  }
  if (status === "fail") {
    return (
      <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, background: "#dc26261a" }}>
        <X size={size * 0.5} strokeWidth={3} className="text-red-700" />
      </div>
    )
  }
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, background: "#d977061a" }}>
      <HelpCircle size={size * 0.5} strokeWidth={2.5} className="text-amber-600" />
    </div>
  )
}


function CheckRow({
  check,
  status,
  value,
  isFirst,
  forceOpen,
  onToggle,
}: {
  check: DomainCheck
  status: CheckStatus
  value?: string
  isFirst: boolean
  forceOpen?: boolean
  onToggle?: (id: string, next: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const isOpen = forceOpen !== undefined ? forceOpen : open
  const showFix = status === "fail" && check.fix
  const showManual = status === "manual" && check.manualSteps
  const stateLabel = status === "manual" ? "What we can see" : "Current state"

  return (
    <div id={`check-${check.id}`} className={cn(!isFirst && "border-t border-border")}>
      <button
        onClick={() => {
          const next = !isOpen
          setOpen(next)
          onToggle?.(check.id, next)
        }}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30",
          isOpen && "bg-muted/20"
        )}
      >
        <StatusIcon status={status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {check.name}
            {status === "manual" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium tracking-wide">REVIEW</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{check.summary}</div>
        </div>
        <ChevronDown
          size={14}
          className={cn("text-muted-foreground transition-transform flex-shrink-0", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div className={cn("px-4 pb-5 pt-0", status === "manual" ? "bg-amber-500/5" : "bg-muted/10")} style={{ paddingLeft: "calc(1rem + 22px + 0.75rem)" }}>
          <div className="pt-4 space-y-4">
            {value && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5">{stateLabel}</div>
                <div className="font-mono text-xs text-foreground bg-background border border-border rounded px-3 py-2 break-all leading-relaxed">
                  {value}
                </div>
              </div>
            )}

            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5">Why this matters</div>
              <p className="text-sm text-foreground/80 leading-relaxed">{check.why}</p>
            </div>

            {showFix && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-red-500 font-medium mb-1.5">How to fix</div>
                <ol className="list-decimal list-inside space-y-1.5">
                  {check.fix!.map((step, i) => (
                    <li key={i} className="text-sm text-foreground/80 leading-relaxed">{step}</li>
                  ))}
                </ol>
                <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-foreground text-background px-3 py-1.5 rounded hover:opacity-80 transition-opacity">
                  Open guided setup <ChevronRight size={11} />
                </button>
              </div>
            )}

            {showManual && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-amber-500 font-medium mb-1.5">How to verify yourself</div>
                <ol className="list-decimal list-inside space-y-1.5">
                  {check.manualSteps!.map((step, i) => (
                    <li key={i} className="text-sm text-foreground/80 leading-relaxed">{step}</li>
                  ))}
                </ol>
                <button className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 transition-colors">
                  Mark as verified <Check size={11} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const CAT_ICONS: Record<Category, React.ReactNode> = {
  Authentication: <Shield size={16} className="text-muted-foreground flex-shrink-0" />,
  "Google Bulk Sender Rules": <Send size={16} className="text-muted-foreground flex-shrink-0" />,
  "Sender Practices": <Globe size={16} className="text-muted-foreground flex-shrink-0" />,
  "Sender Identity": <User size={16} className="text-muted-foreground flex-shrink-0" />,
}

function CategorySection({
  category,
  checks,
  statuses,
  values,
  openCheckId,
  onCheckToggle,
}: {
  category: Category
  checks: DomainCheck[]
  statuses: Record<string, CheckStatus>
  values: Record<string, string>
  openCheckId: string | null
  onCheckToggle: (id: string, next: boolean) => void
}) {
  const fails = checks.filter((c) => statuses[c.id] === "fail").length
  const manuals = checks.filter((c) => statuses[c.id] === "manual").length

  return (
    <div className="mb-7">
      <div className="flex items-center gap-2 mb-3">
        {CAT_ICONS[category]}
        <h2 className="text-sm font-semibold text-foreground">{category}</h2>
        {fails > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">{fails} to fix</span>
        )}
        {manuals > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium">{manuals} to review</span>
        )}
      </div>
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {checks.map((check, i) => (
          <CheckRow
            key={check.id}
            check={check}
            status={statuses[check.id] ?? "manual"}
            value={values[check.id]}
            isFirst={i === 0}
            forceOpen={openCheckId === check.id ? true : undefined}
            onToggle={onCheckToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─── ClientDomain type ────────────────────────────────────────────────────────

interface ClientDomainRecord {
  id: string
  domain: string
  status: "pending" | "verified" | "failed"
  verificationToken: string
  verifiedAt: string | null
  lastCheckedAt: string | null
  createdAt: string
}

// ─── Add Domain Modal ─────────────────────────────────────────────────────────

function AddDomainModal({
  onClose,
  onAdded,
  existingRecord,
}: {
  onClose: () => void
  onAdded: (record: ClientDomainRecord) => void
  existingRecord?: ClientDomainRecord
}) {
  const [step, setStep] = useState<1 | 2>(existingRecord ? 2 : 1)
  const [domainInput, setDomainInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")
  const [record, setRecord] = useState<ClientDomainRecord | null>(existingRecord ?? null)
  const [verified, setVerified] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const res = await fetch("/api/client-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domainInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        // If already added, let them proceed to verify
        if (res.status === 409 && data.domain) {
          setRecord(data.domain)
          setStep(2)
        } else {
          setError(data.error ?? "Something went wrong")
        }
        return
      }
      setRecord(data.domain)
      setStep(2)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleVerify() {
    if (!record) return
    setVerifying(true)
    setError("")
    try {
      const res = await fetch(`/api/client-domains/${record.id}/verify`, { method: "POST" })
      const data = await res.json()
      if (data.verified) {
        setVerified(true)
        onAdded({ ...record, status: "verified" })
      } else {
        setError(data.message ?? "Token not found yet — DNS can take up to 48 hours to propagate.")
      }
    } finally {
      setVerifying(false)
    }
  }

  function copyToken() {
    if (!record) return
    navigator.clipboard.writeText(record.verificationToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-sm font-semibold text-foreground">
              {step === 1 ? "Add a domain" : "Verify ownership"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {step === 1 ? "Enter your sending domain to monitor its health." : `Add a DNS TXT record to prove you own ${record?.domain}.`}
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {step === 1 ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Domain</label>
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="email.yourdomain.com"
                  className="font-mono text-sm"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Enter the exact domain your campaigns send from — including subdomains (e.g. <span className="font-mono">email.gop.com</span>).
                </p>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button type="submit" size="sm" disabled={submitting || !domainInput.trim()}>
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Continue
                </Button>
              </div>
            </form>
          ) : verified ? (
            <div className="text-center py-4 space-y-3">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <div>
                <div className="font-semibold text-foreground">{record?.domain} is verified</div>
                <div className="text-xs text-muted-foreground mt-1">You can now monitor its compliance health.</div>
              </div>
              <Button size="sm" onClick={onClose}>Go to dashboard</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="text-xs text-muted-foreground">
                Add the following TXT record to your DNS provider for <span className="font-mono font-medium text-foreground">{record?.domain}</span>:
              </div>

              {/* DNS record table */}
              <div className="bg-muted/30 border border-border rounded-lg overflow-hidden text-xs font-mono">
                <div className="grid grid-cols-3 border-b border-border px-3 py-2 bg-muted/50 text-[10px] uppercase tracking-widest text-muted-foreground font-sans">
                  <span>Type</span>
                  <span>Host / Name</span>
                  <span>Value</span>
                </div>
                <div className="grid grid-cols-3 px-3 py-3 gap-2 items-center">
                  <span className="text-foreground">TXT</span>
                  <span className="text-foreground">@</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-foreground">{record?.verificationToken}</span>
                    <button
                      onClick={copyToken}
                      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy"
                    >
                      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground bg-amber-500/8 border border-amber-500/20 rounded-lg px-3 py-2.5 leading-relaxed">
                DNS changes can take up to 48 hours to propagate. Click <strong>Verify Now</strong> once you&apos;ve added the record — you can also verify later from the domain picker.
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex justify-between items-center pt-1">
                <Button variant="ghost" size="sm" onClick={onClose}>Verify later</Button>
                <Button size="sm" onClick={handleVerify} disabled={verifying}>
                  {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Verify Now
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DomainHealthContent() {
  const [clientDomains, setClientDomains] = useState<ClientDomainRecord[]>([])
  const [domainsLoading, setDomainsLoading] = useState(true)
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null)
  const [domainOpen, setDomainOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [pendingVerifyRecord, setPendingVerifyRecord] = useState<ClientDomainRecord | null>(null)
  const [scanning, setScanning] = useState(false)
  const [openCheckId, setOpenCheckId] = useState<string | null>(null)

  // Real scan results from API
  const [scanMeta, setScanMeta] = useState<{ scannedAt: string; seedEmailCount: number; ciRowCount: number } | null>(null)
  const [scanResults, setScanResults] = useState<Record<string, { status: string; value: string | null; note: string | null }>>({})
  const [emailSamples, setEmailSamples] = useState<EmailSample[]>([])

  // Active tab — "report" or "samples"
  const [activeTab, setActiveTab] = useState<"report" | "samples">("report")

  // Per-status cursors for cycling through issues
  const cursors = useRef<Record<CheckStatus, number>>({ pass: 0, fail: 0, manual: 0 })

  // Fetch real domains from API
  useEffect(() => {
    fetch("/api/client-domains")
      .then(async (r) => {
        const data = await r.json()
        const domains: ClientDomainRecord[] = data.domains ?? []
        setClientDomains(domains)
        if (domains.length > 0) setSelectedDomainId(domains[0].id)
      })
      .catch((err) => console.error("[domain-health] client-domains fetch error", err))
      .finally(() => setDomainsLoading(false))
  }, [])

  // Load latest scan results whenever the selected domain changes
  useEffect(() => {
    if (!selectedDomainId) return
    setScanResults({})
    setScanMeta(null)
    setEmailSamples([])
    fetch(`/api/domain-health/scan?clientDomainId=${selectedDomainId}`)
      .then(async (r) => {
        if (!r.ok) return
        const data = await r.json()
        if (data.scan) {
          setScanMeta({
            scannedAt: data.scan.scannedAt,
            seedEmailCount: data.scan.seedEmailCount,
            ciRowCount: data.scan.ciRowCount,
          })
        }
        if (data.results) setScanResults(data.results)
        if (data.emailSamples) setEmailSamples(data.emailSamples)
      })
      .catch((err) => console.error("[domain-health] scan results fetch error", err))
  }, [selectedDomainId])

  const selectedRecord = clientDomains.find((d) => d.id === selectedDomainId) ?? null
  const selectedDomain = selectedRecord?.domain ?? ""

  // True only when a domain is selected AND real scan results exist
  const hasData = !!selectedDomainId && Object.keys(scanResults).length > 0

  // Build statuses/values only from real scan results — no default fallbacks
  const statuses: Record<string, CheckStatus> = {}
  const values: Record<string, string> = {}
  if (hasData) {
    for (const [checkId, r] of Object.entries(scanResults)) {
      statuses[checkId] = r.status as CheckStatus
      if (r.value || r.note) values[checkId] = r.value ?? r.note ?? ""
    }
    // Checks not yet in scan results default to "manual"
    for (const check of CHECKS) {
      if (!(check.id in statuses)) statuses[check.id] = "manual"
    }
  }

  const autoChecks = hasData ? CHECKS.filter((c) => statuses[c.id] !== "manual") : []
  const pass = autoChecks.filter((c) => statuses[c.id] === "pass").length
  const fail = autoChecks.filter((c) => statuses[c.id] === "fail").length
  const manual = hasData ? CHECKS.filter((c) => statuses[c.id] === "manual").length : 0
  const pct = autoChecks.length > 0 ? Math.round((pass / autoChecks.length) * 100) : 0
  const grade = gradeFor(pct)

  const categories: Category[] = ["Authentication", "Google Bulk Sender Rules", "Sender Practices", "Sender Identity"]

  // Reset cursors when domain changes
  useEffect(() => {
    cursors.current = { pass: 0, fail: 0, manual: 0 }
    setOpenCheckId(null)
  }, [selectedDomain])

  async function handleRescan() {
    if (!selectedDomainId) return
    setScanning(true)
    try {
      const res = await fetch("/api/domain-health/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientDomainId: selectedDomainId }),
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        if (data.scan) {
          setScanMeta({
            scannedAt: data.scan.scannedAt,
            seedEmailCount: data.scan.seedEmailCount,
            ciRowCount: data.scan.ciRowCount,
          })
        }
        if (data.results) setScanResults(data.results)
        if (data.emailSamples) setEmailSamples(data.emailSamples)
      }
    } catch (err) {
      console.error("[domain-health] rescan error", err)
    } finally {
      setScanning(false)
    }
  }

  function cycleToStatus(target: CheckStatus) {
    const matches = CHECKS.filter((c) => statuses[c.id] === target)
    if (matches.length === 0) return

    const idx = cursors.current[target] % matches.length
    const check = matches[idx]
    cursors.current[target] = (idx + 1) % matches.length

    // Open this check row and close any previously opened one
    setOpenCheckId(check.id)

    // Scroll after a tick so the DOM reflects the open state
    requestAnimationFrame(() => {
      const el = document.getElementById(`check-${check.id}`)
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
    })
  }

  function handleDomainAdded(record: ClientDomainRecord) {
    setClientDomains((prev) => {
      const exists = prev.find((d) => d.id === record.id)
      if (exists) return prev.map((d) => d.id === record.id ? record : d)
      return [...prev, record]
    })
    setSelectedDomainId(record.id)
  }

  return (
    <>
    {(showAddModal || pendingVerifyRecord) && (
      <AddDomainModal
        onClose={() => { setShowAddModal(false); setPendingVerifyRecord(null) }}
        onAdded={(record) => { handleDomainAdded(record); setShowAddModal(false); setPendingVerifyRecord(null) }}
        existingRecord={pendingVerifyRecord ?? undefined}
      />
    )}
    <div className="p-6 max-w-4xl mx-auto flex flex-col min-h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">
          Domain Check
        </p>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          {/* Domain picker */}
          <div className="relative">
            <button
              onClick={() => setDomainOpen((v) => !v)}
              className="flex items-center gap-3 px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/30 transition-colors"
            >
              <span className="text-2xl font-semibold text-foreground tracking-tight">
                {domainsLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground text-base">
                    <Loader2 size={14} className="animate-spin" /> Loading…
                  </span>
                ) : selectedDomain}
              </span>
              <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", domainOpen && "rotate-180")} />
            </button>

            {domainOpen && (
              <div className="absolute top-[calc(100%+4px)] left-0 min-w-64 bg-card border border-border rounded-lg z-50 shadow-lg flex flex-col" style={{ maxHeight: "320px" }}>
                <div className="px-3 py-2 bg-muted/30 border-b border-border flex-shrink-0">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Switch domain</span>
                </div>

                {/* Scrollable domain list */}
                <div className="overflow-y-auto flex-1 min-h-0">
                  {clientDomains.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">No domains added yet.</div>
                  ) : clientDomains.map((d) => (
                    <div
                      key={d.id}
                      className={cn(
                        "flex items-center justify-between px-3 py-2.5 gap-3 hover:bg-muted/30 transition-colors",
                        d.id === selectedDomainId && "bg-muted/20"
                      )}
                    >
                      <button
                        onClick={() => { setSelectedDomainId(d.id); setDomainOpen(false) }}
                        className="flex-1 flex items-center gap-2 text-sm text-left min-w-0"
                      >
                        <span className={cn("truncate", d.id === selectedDomainId && "font-medium")}>{d.domain}</span>
                        {d.id === selectedDomainId && <Check size={13} className="text-rip-red flex-shrink-0" />}
                      </button>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {(d.status === "pending" || d.status === "failed") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setDomainOpen(false)
                              setPendingVerifyRecord(d)
                            }}
                            className="text-[10px] px-1.5 py-0.5 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 rounded font-medium transition-colors"
                          >
                            {d.status === "failed" ? "Retry" : "Verify"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pinned add button */}
                <div className="border-t border-border flex-shrink-0">
                  <button
                    onClick={() => { setDomainOpen(false); setShowAddModal(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <Plus size={14} />
                    New Domain
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Meta row — only when a domain is selected */}
        {selectedDomainId && (
          <div className="flex items-center gap-2 mt-2.5 text-xs text-muted-foreground flex-wrap">
            {scanMeta ? (
              <span>Last scanned {new Date(scanMeta.scannedAt).toLocaleString()}</span>
            ) : (
              <span>Not yet scanned</span>
            )}
            {scanMeta && (
              <>
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                <span>{scanMeta.seedEmailCount} seed email{scanMeta.seedEmailCount !== 1 ? "s" : ""} · {scanMeta.ciRowCount} CI row{scanMeta.ciRowCount !== 1 ? "s" : ""} used</span>
              </>
            )}
            <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
            <button
              onClick={handleRescan}
              disabled={scanning || selectedRecord?.status !== "verified"}
              className="flex items-center gap-1 text-foreground font-medium hover:text-rip-red transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={11} className={cn(scanning && "animate-spin")} />
              {scanning ? "Scanning..." : "Re-scan"}
            </button>
          </div>
        )}
      </div>

      {/* Pending verification banner */}
      {selectedRecord && selectedRecord.status === "pending" && (
        <div className="mb-5 flex items-center justify-between gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/25 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <HelpCircle size={15} className="flex-shrink-0" />
            <span>This domain is <strong>pending verification</strong>. Compliance data will be unavailable until you verify ownership via DNS.</span>
          </div>
          <button
            onClick={() => setPendingVerifyRecord(selectedRecord)}
            className="text-xs font-medium text-amber-500 hover:text-amber-400 transition-colors flex-shrink-0 underline underline-offset-2"
          >
            Verify now
          </button>
        </div>
      )}

      {/* Nothing to show when no domain is selected */}
      {!selectedDomainId && !domainsLoading && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
          <div className="w-14 h-14 rounded-full bg-muted/40 flex items-center justify-center mb-4">
            <Shield size={24} className="text-muted-foreground" />
          </div>
          <div className="text-base font-semibold text-foreground mb-1.5">No domain selected</div>
          <div className="text-sm text-muted-foreground max-w-xs mb-6">
            Add a domain to start monitoring its email health and compliance.
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rip-red text-white text-sm font-medium rounded-lg hover:bg-rip-red/90 transition-colors"
          >
            <Plus size={15} />
            Add Domain
          </button>
        </div>
      )}

      {/* Grade card — only when a domain is selected */}
      {selectedDomainId && (
        <div className="bg-card border border-border rounded-xl p-5 mb-7">
          {!hasData && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground">
              <RefreshCw size={13} className="flex-shrink-0" />
              <span>No scan data yet. Run a scan using the Re-scan button once your domain is verified and seed emails are assigned.</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-4">
              <div className={cn("flex items-center justify-center w-16 h-16 rounded-xl flex-shrink-0", !hasData && "bg-muted/30")}>
                {hasData ? (
                  <div className="flex items-center justify-center w-full h-full rounded-xl" style={{ background: `${grade.color}18` }}>
                    <span className="text-4xl font-bold leading-none" style={{ color: grade.color }}>{grade.letter}</span>
                  </div>
                ) : (
                  <span className="text-4xl font-bold leading-none text-muted-foreground/30">—</span>
                )}
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Compliance Grade</div>
                <div className="text-base font-semibold text-foreground">{hasData ? grade.label : "Awaiting scan"}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{hasData ? grade.tag : "Run a scan to see your compliance score"}</div>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-4xl font-bold tracking-tight", hasData ? "text-foreground" : "text-muted-foreground/30")}>{hasData ? `${pct}%` : "—"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{hasData ? `${pass} of ${autoChecks.length} auto-checks` : "No data"}</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            {hasData && (
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: grade.color }}
              />
            )}
          </div>

          {/* Summary pills */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => hasData && cycleToStatus("pass")}
              className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-background border border-border rounded-lg text-left transition-colors", hasData ? "hover:bg-muted/30 cursor-pointer" : "opacity-40 cursor-default")}
            >
              <StatusIcon status="pass" size={20} />
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight">{hasData ? `${pass} passing` : "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Auto-verified</div>
              </div>
            </button>
            <button
              onClick={() => hasData && cycleToStatus("fail")}
              className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-background rounded-lg text-left transition-colors border border-border", hasData ? "hover:bg-muted/30 cursor-pointer" : "opacity-40 cursor-default")}
            >
              <StatusIcon status="fail" size={20} />
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight">{hasData ? `${fail} needs attention` : "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Auto-detected fails</div>
              </div>
            </button>
            <button
              onClick={() => hasData && cycleToStatus("manual")}
              className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-background rounded-lg text-left transition-colors border border-border", hasData ? "hover:bg-muted/30 cursor-pointer" : "opacity-40 cursor-default")}
            >
              <StatusIcon status="manual" size={20} />
              <div>
                <div className="text-sm font-semibold text-foreground leading-tight">{hasData ? `${manual} to review` : "—"}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Self-verify</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Tab bar — only when a domain is selected */}
      {selectedDomainId && (
        <div className="flex items-center gap-1 mb-5 border-b border-border">
          <button
            onClick={() => setActiveTab("report")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "report"
                ? "border-rip-red text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Report
          </button>
          <button
            onClick={() => setActiveTab("samples")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "samples"
                ? "border-rip-red text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Email Samples
            {emailSamples.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                {emailSamples.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Report tab — check sections */}
      {selectedDomainId && activeTab === "report" && categories.map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          checks={CHECKS.filter((c) => c.category === cat)}
          statuses={statuses}
          values={values}
          openCheckId={openCheckId}
          onCheckToggle={(id, next) => {
            if (!next && id === openCheckId) setOpenCheckId(null)
          }}
        />
      ))}

      {/* Email Samples tab */}
      {selectedDomainId && activeTab === "samples" && (
        <div className="space-y-3">
          {!hasData || emailSamples.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mb-4">
                <Send size={20} className="text-muted-foreground" />
              </div>
              <div className="text-sm font-medium text-foreground mb-1">No email samples yet</div>
              <div className="text-xs text-muted-foreground max-w-xs">
                Send a test email from a rip-tool.com address to a domain health seed, then run a scan.
              </div>
            </div>
          ) : emailSamples.map((sample) => {
            const checkEntries = Object.entries(sample.checks)
            const passCount = checkEntries.filter(([, v]) => v === true).length
            const failCount = checkEntries.filter(([, v]) => v === false).length
            const placementColor =
              sample.placement === "inbox" ? "text-green-500 bg-green-500/10" :
              sample.placement === "spam" ? "text-red-500 bg-red-500/10" :
              "text-amber-500 bg-amber-500/10"

            return (
              <div key={sample.id} className="bg-card border border-border rounded-xl p-4">
                {/* Email header row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate mb-0.5">
                      {sample.subject ?? "(no subject)"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      From: <span className="text-foreground">{sample.fromAddress ?? "unknown"}</span>
                      {sample.seedEmail && (
                        <> &middot; To seed: <span className="text-foreground">{sample.seedEmail}</span></>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn("text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full", placementColor)}>
                      {sample.placement}
                    </span>
                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40 uppercase tracking-wide font-medium">
                      {sample.source === "seed" ? "Seed" : "CI"}
                    </span>
                  </div>
                </div>

                {/* Received time + pass/fail summary */}
                <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
                  {sample.receivedAt && (
                    <span>{new Date(sample.receivedAt).toLocaleString()}</span>
                  )}
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                  <span className="text-green-500 font-medium">{passCount} passed</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                  <span className="text-red-500 font-medium">{failCount} failed</span>
                </div>

                {/* Per-check chips */}
                <div className="flex flex-wrap gap-1.5">
                  {checkEntries.map(([checkId, passed]) => (
                    <span
                      key={checkId}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md uppercase tracking-wide",
                        passed
                          ? "bg-green-500/10 text-green-500"
                          : "bg-red-500/10 text-red-500"
                      )}
                    >
                      {passed ? <Check size={9} /> : <X size={9} />}
                      {checkId}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note — pinned to bottom, pushed down by content when report is present */}
      <div className="mt-auto pt-6">
      <div className="p-4 bg-card border border-border rounded-lg flex items-start gap-3">
        <Info size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Inbox.GOP analyzes emails received from monitored domains and verifies them against{" "}
          <a href="https://support.google.com/a/answer/81126" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline underline-offset-2">
            Google&apos;s Email Sender Guidelines
          </a>
          . Auto-checks come from received headers, content scans, and DNS lookups. Review items require sender-side verification and cannot be confirmed           remotely.
        </p>
      </div>
      </div>
    </div>
    </>
  )
}
