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
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "manual"
type TimeRange = "7d" | "30d" | "90d"
type Category = "Authentication" | "Google Bulk Sender Rules" | "Sender Practices" | "Sender Identity"

interface DomainCheck {
  id: string
  category: Category
  name: string
  summary: string
  why: string
  currentState?: string
  fix?: string[]
  manualSteps?: string[]
  isSenderCheck?: boolean
}

interface SenderRow {
  name: string
  address: string
  usage: string
  ok: boolean
  violation?: string
  suggested?: string
}

interface DomainData {
  lastScan: string
  sendersObserved: Record<TimeRange, number>
  checkStatuses: Record<string, CheckStatus>
  checkValues: Record<string, string>
  senders: SenderRow[]
}

// ─── Fake data ────────────────────────────────────────────────────────────────

const DOMAINS = ["email.gop.com", "donate.gop.com", "rnchq.org"]

const DOMAIN_DATA: Record<string, DomainData> = {
  "email.gop.com": {
    lastScan: "4 minutes ago",
    sendersObserved: { "7d": 8, "30d": 11, "90d": 15 },
    checkStatuses: {
      spf: "pass",
      dkim: "pass",
      dmarc: "fail",
      dmarc_align: "pass",
      rdns: "pass",
      one_click_unsub: "fail",
      unsub_link: "pass",
      unsub_7d: "pass",
      spam_rate: "manual",
      ip_rep: "manual",
      from_domain: "pass",
      sender_name: "fail",
      display_name: "manual",
      tls: "pass",
      arc: "pass",
    },
    checkValues: {
      spf: "v=spf1 include:_spf.google.com include:sendgrid.net ~all",
      dkim: "DKIM signature verified on d=email.gop.com, selector=gop2024",
      dmarc: "No DMARC record found at _dmarc.email.gop.com",
      dmarc_align: "From: email.gop.com aligns with SPF domain email.gop.com",
      rdns: "Sending IPs resolve to mail.email.gop.com — valid PTR record",
      one_click_unsub: "List-Unsubscribe header found, but List-Unsubscribe-Post: List-Unsubscribe=One-Click is missing",
      unsub_link: "Unsubscribe link found in body across 100% of observed emails",
      unsub_7d: "Average removal time: 2.1 days across last 30 emails",
      spam_rate: "Cannot be verified remotely — requires Google Postmaster Tools access",
      ip_rep: "Cannot be verified remotely — requires Google Postmaster Tools access",
      from_domain: "From: addresses use @email.gop.com consistently",
      tls: "TLS 1.3 observed on all inbound connections",
      arc: "ARC-Seal and ARC-Message-Signature headers present",
    },
    senders: [
      { name: "GOP HQ", address: "noreply@email.gop.com", usage: "92% of sends", ok: true },
      { name: "National Republican", address: "news@email.gop.com", usage: "5% of sends", ok: true },
      {
        name: "URGENT: Patriot",
        address: "alerts@email.gop.com",
        usage: "3% of sends",
        ok: false,
        violation: "Display name uses urgency language and does not match registered org identity.",
        suggested: "Republican National Committee",
      },
    ],
  },
  "donate.gop.com": {
    lastScan: "12 minutes ago",
    sendersObserved: { "7d": 3, "30d": 5, "90d": 6 },
    checkStatuses: {
      spf: "pass",
      dkim: "pass",
      dmarc: "pass",
      dmarc_align: "pass",
      rdns: "pass",
      one_click_unsub: "pass",
      unsub_link: "pass",
      unsub_7d: "pass",
      spam_rate: "manual",
      ip_rep: "manual",
      from_domain: "pass",
      sender_name: "pass",
      display_name: "manual",
      tls: "pass",
      arc: "pass",
    },
    checkValues: {
      spf: "v=spf1 include:_spf.google.com ~all",
      dkim: "DKIM signature verified on d=donate.gop.com, selector=dk1",
      dmarc: "v=DMARC1; p=quarantine; rua=mailto:dmarc@gop.com",
      dmarc_align: "From: donate.gop.com aligns with SPF domain donate.gop.com",
      rdns: "Sending IPs resolve to mail.donate.gop.com",
      one_click_unsub: "List-Unsubscribe-Post: List-Unsubscribe=One-Click present",
      unsub_link: "Unsubscribe link found in body across 100% of observed emails",
      unsub_7d: "Average removal time: 1.3 days across last 30 emails",
      spam_rate: "Cannot be verified remotely — requires Google Postmaster Tools access",
      ip_rep: "Cannot be verified remotely — requires Google Postmaster Tools access",
      from_domain: "From: addresses use @donate.gop.com consistently",
      tls: "TLS 1.3 observed on all inbound connections",
      arc: "ARC headers present",
    },
    senders: [
      { name: "Donate GOP", address: "giving@donate.gop.com", usage: "80% of sends", ok: true },
      { name: "RNC Fundraising", address: "fund@donate.gop.com", usage: "20% of sends", ok: true },
    ],
  },
  "rnchq.org": {
    lastScan: "2 hours ago",
    sendersObserved: { "7d": 2, "30d": 4, "90d": 7 },
    checkStatuses: {
      spf: "fail",
      dkim: "fail",
      dmarc: "fail",
      dmarc_align: "fail",
      rdns: "pass",
      one_click_unsub: "fail",
      unsub_link: "fail",
      unsub_7d: "manual",
      spam_rate: "manual",
      ip_rep: "manual",
      from_domain: "pass",
      sender_name: "fail",
      display_name: "manual",
      tls: "fail",
      arc: "fail",
    },
    checkValues: {
      spf: "No SPF record found at rnchq.org",
      dkim: "No DKIM signature detected on observed emails from this domain",
      dmarc: "No DMARC record found at _dmarc.rnchq.org",
      dmarc_align: "Unable to verify — SPF and DKIM are both missing",
      rdns: "Sending IPs resolve to mail.rnchq.org",
      one_click_unsub: "List-Unsubscribe header missing on observed emails",
      unsub_link: "No unsubscribe link detected in body on 60% of observed emails",
      unsub_7d: "Cannot verify — requires access to list management platform",
      spam_rate: "Cannot be verified remotely — requires Google Postmaster Tools access",
      ip_rep: "Cannot be verified remotely — requires Google Postmaster Tools access",
      from_domain: "From: addresses use @rnchq.org consistently",
      tls: "TLS 1.0 detected on some connections — upgrade recommended",
      arc: "ARC headers not present on observed emails",
    },
    senders: [
      {
        name: "RNCHQ Team",
        address: "team@rnchq.org",
        usage: "70% of sends",
        ok: false,
        violation: "Display name is generic and does not match registered org identity.",
        suggested: "Republican National Committee HQ",
      },
      {
        name: "ACTION REQUIRED",
        address: "alerts@rnchq.org",
        usage: "30% of sends",
        ok: false,
        violation: "Display name uses urgency language that may trigger spam filters.",
        suggested: "RNC Alerts",
      },
    ],
  },
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
    isSenderCheck: true,
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

function SenderTable({ senders }: { senders: SenderRow[] }) {
  const ok = senders.filter((s) => s.ok).length
  return (
    <div className="border border-border rounded-lg overflow-hidden mt-4">
      <div className="px-3 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          Senders observed &middot; {ok} of {senders.length} compliant
        </span>
      </div>
      {senders.map((s, i) => (
        <div key={i} className={cn("grid gap-3 px-3 py-3 items-start", i > 0 && "border-t border-border")} style={{ gridTemplateColumns: "20px 1fr auto" }}>
          <div className="mt-0.5">
            <StatusIcon status={s.ok ? "pass" : "fail"} size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground mb-0.5">&ldquo;{s.name}&rdquo;</div>
            <div className="text-xs text-muted-foreground font-mono">{s.address} &middot; {s.usage}</div>
            {!s.ok && (
              <>
                <div className="text-xs text-red-500 mt-1.5 leading-relaxed">{s.violation}</div>
                <div className="text-xs text-muted-foreground mt-1">Suggested: &ldquo;{s.suggested}&rdquo;</div>
              </>
            )}
          </div>
          <div className={cn("text-xs font-medium uppercase tracking-wider mt-0.5", s.ok ? "text-green-600" : "text-red-500")}>
            {s.ok ? "Compliant" : "Non-compliant"}
          </div>
        </div>
      ))}
    </div>
  )
}

function CheckRow({
  check,
  status,
  value,
  isFirst,
  senders,
  forceOpen,
  onToggle,
}: {
  check: DomainCheck
  status: CheckStatus
  value?: string
  isFirst: boolean
  senders: SenderRow[]
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

            {check.isSenderCheck && <SenderTable senders={senders} />}

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
  senders,
  openCheckId,
  onCheckToggle,
}: {
  category: Category
  checks: DomainCheck[]
  statuses: Record<string, CheckStatus>
  values: Record<string, string>
  senders: SenderRow[]
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
            senders={senders}
            forceOpen={openCheckId === check.id ? true : undefined}
            onToggle={onCheckToggle}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DomainHealthContent() {
  const [selectedDomain, setSelectedDomain] = useState(DOMAINS[0])
  const [domainOpen, setDomainOpen] = useState(false)
  const [range, setRange] = useState<TimeRange>("30d")
  const [scanning, setScanning] = useState(false)
  const [openCheckId, setOpenCheckId] = useState<string | null>(null)

  // Per-status cursors for cycling through issues
  const cursors = useRef<Record<CheckStatus, number>>({ pass: 0, fail: 0, manual: 0 })

  const data = DOMAIN_DATA[selectedDomain]
  const statuses = data.checkStatuses
  const values = data.checkValues
  const senders = data.senders

  const autoChecks = CHECKS.filter((c) => statuses[c.id] !== "manual")
  const pass = autoChecks.filter((c) => statuses[c.id] === "pass").length
  const fail = autoChecks.filter((c) => statuses[c.id] === "fail").length
  const manual = CHECKS.filter((c) => statuses[c.id] === "manual").length
  const pct = autoChecks.length > 0 ? Math.round((pass / autoChecks.length) * 100) : 100
  const grade = gradeFor(pct)

  const categories: Category[] = ["Authentication", "Google Bulk Sender Rules", "Sender Practices", "Sender Identity"]

  // Reset cursors when domain changes
  useEffect(() => {
    cursors.current = { pass: 0, fail: 0, manual: 0 }
    setOpenCheckId(null)
  }, [selectedDomain])

  function handleRescan() {
    setScanning(true)
    setTimeout(() => setScanning(false), 1800)
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
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
              <span className="text-2xl font-semibold text-foreground tracking-tight">{selectedDomain}</span>
              <ChevronDown size={14} className={cn("text-muted-foreground transition-transform", domainOpen && "rotate-180")} />
            </button>

            {domainOpen && (
              <div className="absolute top-[calc(100%+4px)] left-0 min-w-56 bg-card border border-border rounded-lg overflow-hidden z-50 shadow-lg">
                <div className="px-3 py-2 bg-muted/30 border-b border-border">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Switch domain</span>
                </div>
                {DOMAINS.map((d) => (
                  <button
                    key={d}
                    onClick={() => { setSelectedDomain(d); setDomainOpen(false) }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 text-sm text-left hover:bg-muted/30 transition-colors",
                      d === selectedDomain && "bg-muted/20 font-medium"
                    )}
                  >
                    {d}
                    {d === selectedDomain && <Check size={13} className="text-rip-red flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Time range */}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1.5 text-right">Window</div>
            <div className="flex bg-card border border-border rounded-lg p-0.5 gap-0.5">
              {(["7d", "30d", "90d"] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    "px-3 py-1 text-xs rounded-md transition-colors font-medium",
                    range === r
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {r === "7d" ? "7 days" : r === "30d" ? "30 days" : "90 days"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-2.5 text-xs text-muted-foreground flex-wrap">
          <span>Last scanned {data.lastScan}</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <span>{data.sendersObserved[range]} senders observed in window</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
          <button
            onClick={handleRescan}
            className="flex items-center gap-1 text-foreground font-medium hover:text-rip-red transition-colors"
          >
            <RefreshCw size={11} className={cn(scanning && "animate-spin")} />
            Re-scan
          </button>
        </div>
      </div>

      {/* Grade card */}
      <div className="bg-card border border-border rounded-xl p-5 mb-7">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-xl flex-shrink-0" style={{ background: `${grade.color}18` }}>
              <span className="text-4xl font-bold leading-none" style={{ color: grade.color }}>{grade.letter}</span>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-0.5">Compliance Grade</div>
              <div className="text-base font-semibold text-foreground">{grade.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{grade.tag}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-foreground tracking-tight">{pct}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">{pass} of {autoChecks.length} auto-checks</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: grade.color }}
          />
        </div>

        {/* Summary pills */}
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => cycleToStatus("pass")}
            className="flex items-center gap-2.5 px-3 py-2.5 bg-background border border-border rounded-lg text-left hover:bg-muted/30 transition-colors cursor-pointer"
          >
            <StatusIcon status="pass" size={20} />
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">{pass} passing</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Auto-verified</div>
            </div>
          </button>
          <button
            onClick={() => cycleToStatus("fail")}
            className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-background rounded-lg text-left hover:bg-muted/30 transition-colors cursor-pointer", fail > 0 ? "border border-red-500/30" : "border border-border")}
          >
            <StatusIcon status="fail" size={20} />
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">{fail} needs attention</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Auto-detected fails</div>
            </div>
          </button>
          <button
            onClick={() => cycleToStatus("manual")}
            className={cn("flex items-center gap-2.5 px-3 py-2.5 bg-background rounded-lg text-left hover:bg-muted/30 transition-colors cursor-pointer", manual > 0 ? "border border-amber-500/30" : "border border-border")}
          >
            <StatusIcon status="manual" size={20} />
            <div>
              <div className="text-sm font-semibold text-foreground leading-tight">{manual} to review</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Self-verify</div>
            </div>
          </button>
        </div>
      </div>

      {/* Check sections */}
      {categories.map((cat) => (
        <CategorySection
          key={cat}
          category={cat}
          checks={CHECKS.filter((c) => c.category === cat)}
          statuses={statuses}
          values={values}
          senders={senders}
          openCheckId={openCheckId}
          onCheckToggle={(id, next) => {
            // If the user manually closes a row, clear the forced-open state
            if (!next && id === openCheckId) setOpenCheckId(null)
          }}
        />
      ))}

      {/* Footer note */}
      <div className="mt-2 p-4 bg-card border border-border rounded-lg flex items-start gap-3">
        <Info size={14} className="text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Inbox.GOP analyzes emails received from monitored domains and verifies them against{" "}
          <a href="https://support.google.com/a/answer/81126" target="_blank" rel="noopener noreferrer" className="text-foreground font-medium underline underline-offset-2">
            Google&apos;s Email Sender Guidelines
          </a>
          . Auto-checks come from received headers, content scans, and DNS lookups. Review items require sender-side verification and cannot be confirmed remotely.
        </p>
      </div>
    </div>
  )
}
