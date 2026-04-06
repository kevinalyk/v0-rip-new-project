"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Lock, Mail, MessageSquare, Building2, User, Users, ArrowLeft, ExternalLink } from "lucide-react"
import Link from "next/link"

interface Mapping {
  id: string
  emailDomain: string | null
  shortCode: string | null
  platform: string | null
}

interface RecentCampaign {
  id: string
  subject: string | null
  sentAt: string | null
  fromEmail: string | null
}

interface RecentSms {
  id: string
  body: string | null
  receivedAt: string | null
  shortCode: string | null
}

interface EntityData {
  entity: {
    id: string
    name: string
    type: string
    description: string | null
    party: string | null
    state: string | null
    slug: string
    mappings: Mapping[]
    counts: {
      emails: number
      sms: number
      total: number
    }
  }
  recentCampaigns: RecentCampaign[]
  recentSms: RecentSms[]
}

function getPartyColor(party: string | null) {
  if (!party) return "bg-muted text-muted-foreground"
  switch (party.toLowerCase()) {
    case "republican": return "bg-red-600 text-white"
    case "democrat": return "bg-blue-600 text-white"
    case "independent": return "bg-zinc-500 text-white"
    default: return "bg-muted text-muted-foreground"
  }
}

function getEntityIcon(type: string) {
  switch (type) {
    case "organization": return <Building2 className="h-6 w-6" />
    case "pac": return <Users className="h-6 w-6" />
    default: return <User className="h-6 w-6" />
  }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export function DirectoryProfileContent({ data, slug }: { data: EntityData; slug: string }) {
  const { entity, recentCampaigns, recentSms } = data

  const emailDomains = entity.mappings.filter((m) => m.emailDomain).map((m) => m.emailDomain!)
  const shortCodes = entity.mappings.filter((m) => m.shortCode).map((m) => m.shortCode!)

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Header bar */}
      <header className="border-b border-border/60">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/directory" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Directory
          </Link>
          <span className="text-sm font-semibold tracking-tight">RIP Tool</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Profile hero */}
        <div className="flex items-start gap-6 mb-10">
          <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
            {getEntityIcon(entity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold tracking-tight text-balance mb-2">{entity.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {entity.party && (
                <Badge className={getPartyColor(entity.party)}>
                  {entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}
                </Badge>
              )}
              {entity.state && <Badge variant="outline">{entity.state}</Badge>}
              <Badge variant="secondary" className="capitalize">{entity.type}</Badge>
            </div>
            {entity.description && (
              <p className="mt-3 text-muted-foreground leading-relaxed">{entity.description}</p>
            )}
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <Mail className="h-4 w-4" />
              Emails Captured
            </div>
            <div className="text-3xl font-bold">{entity.counts.emails.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              <MessageSquare className="h-4 w-4" />
              SMS Captured
            </div>
            <div className="text-3xl font-bold">{entity.counts.sms.toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-2">
              Total Communications
            </div>
            <div className="text-3xl font-bold">{entity.counts.total.toLocaleString()}</div>
          </div>
        </div>

        {/* Domains & Short Codes */}
        {(emailDomains.length > 0 || shortCodes.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2 mb-10">
            {emailDomains.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Email Domains</h2>
                <div className="flex flex-wrap gap-2">
                  {emailDomains.map((domain) => (
                    <Badge key={domain} variant="secondary" className="font-mono text-xs">
                      {domain}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {shortCodes.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">SMS Short Codes</h2>
                <div className="flex flex-wrap gap-2">
                  {shortCodes.map((code) => (
                    <Badge key={code} variant="secondary" className="font-mono text-xs">
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent communications - login gate */}
        <div className="rounded-xl border border-border bg-card overflow-hidden mb-10">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Recent Communications</h2>
            <span className="text-sm text-muted-foreground">
              {recentCampaigns.length + recentSms.length} previewed of {entity.counts.total}
            </span>
          </div>

          {/* Blurred preview rows */}
          <div className="divide-y divide-border relative">
            {recentCampaigns.slice(0, 5).map((campaign) => (
              <div key={campaign.id} className="px-5 py-3 flex items-center justify-between gap-4 blur-sm select-none pointer-events-none">
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{campaign.subject || "No subject"}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(campaign.sentAt)}</span>
              </div>
            ))}
            {recentSms.slice(0, 3).map((sms) => (
              <div key={sms.id} className="px-5 py-3 flex items-center justify-between gap-4 blur-sm select-none pointer-events-none">
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{sms.body?.substring(0, 80) || "SMS message"}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(sms.receivedAt)}</span>
              </div>
            ))}

            {/* Overlay gate */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3 text-center px-6">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="font-semibold">Sign in to view full communications</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Access the complete feed of emails and SMS messages captured from {entity.name}.
                </p>
                <div className="flex gap-3 mt-1">
                  <Button asChild size="sm">
                    <Link href="/login">Sign In</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/signup">Create Account</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Data provided by RIP Tool</span>
          <Link
            href={`${APP_URL}/login`}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            View full profile <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </main>
    </div>
  )
}
