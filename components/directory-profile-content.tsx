"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/app-layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Lock, Mail, MessageSquare, Building2, User, Users, ArrowLeft, Calendar, Smartphone, ExternalLink } from "lucide-react"
import { CiEntitySubscribeButton } from "@/components/ci-entity-subscribe-button"
import { nameToSlug } from "@/lib/directory-utils"
import { RelatedEntities } from "@/components/related-entities"

interface Mapping {
  id: string
  senderEmail: string | null
  senderDomain: string | null
  senderPhone: string | null
}

interface RecentCampaign {
  id: string
  subject: string | null
  dateReceived: string | null
  senderEmail: string | null
}

interface RecentSms {
  id: string
  message: string | null
  createdAt: string | null
  phoneNumber: string | null
}

interface EntityData {
  hasFullAccess: boolean
  cutoffAt: string
  entity: {
    id: string
    name: string
    type: string
    description: string | null
    party: string | null
    state: string | null
    slug: string
    mappings: Mapping[]
    imageUrl: string | null
    bio: string | null
    office: string | null
    ballotpediaUrl: string | null
    donationIdentifiers: Record<string, string[]> | null
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
    case "independent":
    case "third party": return "bg-zinc-500 text-white"
    default: return "bg-muted text-muted-foreground"
  }
}

function getPartyBorderColor(party: string | null) {
  if (!party) return "border-l-border"
  switch (party.toLowerCase()) {
    case "republican": return "border-l-red-600"
    case "democrat": return "border-l-blue-600"
    case "independent":
    case "third party": return "border-l-zinc-500"
    default: return "border-l-border"
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

interface CtaLink {
  url: string
  finalUrl?: string
  strippedFinalUrl?: string
  type?: string
}

interface PreviewItem {
  id: string
  type: "email" | "sms"
  subject: string | null
  senderEmail: string | null
  phoneNumber: string | null
  dateReceived: string | null
  emailContent: string | null
  emailPreview: string | null
  ctaLinks: CtaLink[]
}

function prepareEmailHtml(html: string) {
  const noLinkStyle = `<style>a { pointer-events: none !important; cursor: default !important; text-decoration: none !important; color: inherit !important; }</style>`
  if (html.includes("<head>")) return html.replace("<head>", `<head><base target="_blank">${noLinkStyle}`)
  if (html.includes("<html>")) return html.replace("<html>", `<html><head><base target="_blank">${noLinkStyle}</head>`)
  return `<head><base target="_blank">${noLinkStyle}</head>${html}`
}

export function DirectoryProfileContent({ slug, initialData }: { slug: string; initialData?: EntityData | null }) {
  const [clientSlug, setClientSlug] = useState<string>("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [imageIsWide, setImageIsWide] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  // If server pre-fetched the data, use it directly — no client fetch needed.
  const [data, setData] = useState<EntityData | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [notFound, setNotFound] = useState(false)
  const [selectedPreview, setSelectedPreview] = useState<PreviewItem | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Check auth — non-blocking, page works for unauthenticated visitors too
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const user = await res.json()
          setClientSlug(user.client?.slug || "")
          setIsAuthenticated(true)
        }
      } catch {
        // Unauthenticated visitors can still view the profile
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  // Only fetch entity data on the client if it was not pre-fetched server-side.
  useEffect(() => {
    if (initialData || authLoading) return
    const fetchEntity = async () => {
      try {
        const res = await fetch(`/api/public/directory/${slug}`)
        if (res.status === 404) { setNotFound(true); return }
        if (res.ok) setData(await res.json())
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchEntity()
  }, [authLoading, slug, initialData])

  const handlePreviewClick = async (id: string, type: "email" | "sms") => {
    if (!isAuthenticated) return
    setPreviewLoading(true)
    setSelectedPreview(null)
    try {
      const res = await fetch(
        `/api/competitive-insights/preview?id=${encodeURIComponent(id)}&type=${type}`,
        { credentials: "include" }
      )
      if (res.ok) {
        const item = await res.json()
        setSelectedPreview({
          id: item.id,
          type: item.type,
          subject: item.subject,
          senderEmail: item.senderEmail ?? null,
          phoneNumber: item.phoneNumber ?? null,
          dateReceived: item.dateReceived,
          emailContent: item.emailContent,
          emailPreview: item.emailPreview,
          ctaLinks: Array.isArray(item.ctaLinks) ? item.ctaLinks : [],
        })
      }
    } catch {
      // silently fail
    } finally {
      setPreviewLoading(false)
    }
  }

  // If data was server-rendered, skip the full-page loading spinner — auth
  // check still runs in the background and hydrates interactive controls.
  if ((authLoading && !initialData) || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-[#dc2a28]" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-lg font-medium">Entity not found.</p>
          <Link href={clientSlug ? `/${clientSlug}/ci/directory` : "/login"}>
            <Button variant="outline" className="gap-2">
              <ArrowLeft size={14} />
              Back to Directory
            </Button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  const { entity, recentCampaigns, recentSms, hasFullAccess, cutoffAt } = data
  // For each email mapping, prefer the full senderEmail if available, otherwise fall back to senderDomain
  const emailIdentifiers = [
    ...new Set(
      entity.mappings
        .filter((m) => m.senderEmail || m.senderDomain)
        .map((m) => m.senderEmail ?? m.senderDomain!)
    ),
  ]
  const shortCodes = [...new Set(entity.mappings.filter((m) => m.senderPhone).map((m) => m.senderPhone!))]

  return (
    <>
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="container mx-auto py-8 px-4 max-w-3xl">

        {/* Back navigation */}
        <div className="mb-6">
          <Link href="/directory">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft size={14} />
              Back to Directory
            </Button>
          </Link>
        </div>

        {/* Profile hero */}
        <div className={imageIsWide ? "flex flex-col gap-6 mb-8" : "flex items-start gap-6 mb-8"}>
          {entity.imageUrl && (
            <div className={`flex-shrink-0 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground overflow-hidden
              ${imageIsWide ? "w-full max-w-md" : "w-32 h-40"}`}
            >
              <img
                src={entity.imageUrl}
                alt={entity.name}
                className={imageIsWide ? "w-full h-auto" : "w-full h-full object-cover object-top"}
                crossOrigin="anonymous"
                onLoad={(e) => {
                  const img = e.currentTarget
                  const aspectRatio = img.naturalWidth / img.naturalHeight
                  if (aspectRatio > 1.8) setImageIsWide(true)
                }}
              />
            </div>
          )}
          {!entity.imageUrl && (
            <div className="flex-shrink-0 w-32 h-40 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
              {getEntityIcon(entity.type)}
            </div>
          )}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h1 className="text-2xl font-bold tracking-tight text-balance">{entity.name}</h1>
              {isAuthenticated && imageIsWide && (
                <div className="flex-shrink-0">
                  <CiEntitySubscribeButton entityId={entity.id} entityName={entity.name} />
                </div>
              )}
            </div>
            {entity.office && (
              <p className="text-sm text-muted-foreground mb-2">{entity.office}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {entity.party && (
                <Badge className={getPartyColor(entity.party)}>
                  {entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}
                </Badge>
              )}
              {entity.state && <Badge variant="outline">{entity.state}</Badge>}
              <Badge variant="secondary" className="capitalize">{entity.type}</Badge>
            </div>
            {/* Donation links — WinRed for Republicans only */}
            {entity.donationIdentifiers &&
              entity.party?.toLowerCase() === "republican" &&
              (entity.donationIdentifiers.winred ?? []).length > 0 && (
                <div className="flex flex-col gap-1 mt-3">
                  <span className="text-xs font-semibold text-muted-foreground mb-0.5">
                    WinRed Donation Page
                  </span>
                  {(entity.donationIdentifiers.winred ?? []).map((slug) => (
                    <a
                      key={slug}
                      href={`https://secure.winred.com/${slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      {`secure.winred.com/${slug}`}
                    </a>
                  ))}
                </div>
              )}
          </div>
          {isAuthenticated && !imageIsWide && (
            <div className="flex-shrink-0">
              <CiEntitySubscribeButton entityId={entity.id} entityName={entity.name} />
            </div>
          )}
        </div>

        {/* Inline stats row with related entities */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 px-1">
          {/* Stats */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{entity.counts.emails.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">Email{entity.counts.emails !== 1 ? "s" : ""}</span>
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-2xl font-bold">{entity.counts.sms.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">SMS</span>
            </div>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{entity.counts.total.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
          </div>

          {/* Related entities inline */}
          <RelatedEntities
            entityId={entity.id}
            entityName={entity.name}
            party={entity.party}
            state={entity.state}
            inline={true}
          />
        </div>

        {/* Bio */}
        {entity.bio && (
          <div className={`rounded-lg border border-border border-l-4 ${getPartyBorderColor(entity.party)} bg-card p-5 mb-8`}>
            <p className="text-sm text-muted-foreground leading-relaxed">{entity.bio}</p>
            {entity.ballotpediaUrl && (
              <a
                href={entity.ballotpediaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                View on Ballotpedia
              </a>
            )}
          </div>
        )}

        {/* Domains & Short Codes */}
        {(emailIdentifiers.length > 0 || shortCodes.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            {emailIdentifiers.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2 mb-3 border-b border-border">Email Senders</h2>
                <div className="flex flex-wrap gap-2">
                  {emailIdentifiers.map((identifier) => (
                    <Badge key={identifier} variant="secondary" className="font-mono text-xs">{identifier}</Badge>
                  ))}
                </div>
              </div>
            )}
            {shortCodes.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-2 mb-3 border-b border-border">SMS Numbers</h2>
                <div className="flex flex-wrap gap-2">
                  {shortCodes.map((code) => (
                    <Badge key={code} variant="secondary" className="font-mono text-xs">{code}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent communications */}
        {(() => {
          // Merge emails and SMS into a single chronological feed (newest first), capped at 10.
          // Items missing a date are pushed to the bottom by treating them as 0.
          type CommItem =
            | { kind: "email"; id: string; title: string; date: string | null; sortTs: number }
            | { kind: "sms"; id: string; title: string; date: string | null; sortTs: number }

          const emailItems: CommItem[] = recentCampaigns.map((c) => ({
            kind: "email",
            id: c.id,
            title: c.subject || "No subject",
            date: c.dateReceived,
            sortTs: c.dateReceived ? new Date(c.dateReceived).getTime() : 0,
          }))
          const smsItems: CommItem[] = recentSms.map((s) => ({
            kind: "sms",
            id: s.id,
            title: s.message?.substring(0, 80) || "SMS message",
            date: s.createdAt,
            sortTs: s.createdAt ? new Date(s.createdAt).getTime() : 0,
          }))
          const combined = [...emailItems, ...smsItems]
            .sort((a, b) => b.sortTs - a.sortTs)
            .slice(0, 10)

          // Cutoff timestamp from the API — items older than this are blurred
          // for unauthenticated and free-tier users.
          const cutoffTs = cutoffAt ? new Date(cutoffAt).getTime() : 0

          // First index that falls outside the 3-hour window — everything from
          // here onward gets blurred. Full-access users never hit this condition.
          const firstLockedIdx = hasFullAccess
            ? combined.length
            : combined.findIndex((item) => item.sortTs < cutoffTs)
          const hasLockedItems = firstLockedIdx !== -1 && firstLockedIdx < combined.length

          // Whether this restricted user has any comms at all in the entity's history
          const entityHasHistory = entity.counts.total > 0

          // Whether the overlay is shown depends on auth state and access level.
          // Two cases trigger the gate:
          // 1. hasLockedItems — some items visible, rest are outside 3hr window
          // 2. combined is empty but entity has history — nothing in 3hr window at all
          const isRestricted = !hasFullAccess
          const nothingInWindow = isRestricted && combined.length === 0 && entityHasHistory
          const showSignInOverlay = !isAuthenticated && (hasLockedItems || nothingInWindow)
          const showUpgradeOverlay = isAuthenticated && isRestricted && (hasLockedItems || nothingInWindow)

          // Inline "see more" upgrade banner shown below visible items (when there
          // are some visible but more exist outside the window)
          const showUpgradeBanner = isAuthenticated && isRestricted && combined.length > 0 && entityHasHistory

          return (
            <div className="rounded-lg border border-border bg-card overflow-hidden mb-8">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-sm">Recent Communications</h2>
                <span className="text-xs text-muted-foreground">
                  {combined.length} previewed of {entity.counts.total}
                </span>
              </div>

              <div className={`divide-y divide-border relative${(showSignInOverlay || showUpgradeOverlay) && nothingInWindow ? " min-h-[200px]" : ""}`}>
                {combined.map((item, index) => {
                  const isLocked = isRestricted && index >= firstLockedIdx && firstLockedIdx !== -1
                  return (
                    <div
                      key={`${item.kind}-${item.id}`}
                      className={`px-4 py-3 flex items-center justify-between gap-4 transition-colors
                        ${isLocked ? "blur-sm select-none pointer-events-none" : ""}
                        ${!isLocked && isAuthenticated ? "cursor-pointer hover:bg-accent/50" : ""}
                      `}
                      onClick={() => !isLocked && isAuthenticated && handlePreviewClick(item.id, item.kind)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.kind === "email" ? (
                          <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-sm truncate">{item.title}</span>
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(item.date)}</span>
                    </div>
                  )
                })}

                {/* Sign-in gate — unauthenticated visitors */}
                {showSignInOverlay && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-3 text-center px-6">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="font-semibold text-sm">Sign in to view communications</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        Free accounts see the last 3 hours of activity. Sign in to access recent messages from {entity.name}.
                      </p>
                      <div className="flex gap-3 mt-1">
                        <Button asChild size="sm" className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white">
                          <Link href="/login">Sign In</Link>
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/signup">Create Account</Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Full upgrade gate — signed-in free user, nothing in 3hr window */}
                {showUpgradeOverlay && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px]">
                    <div className="flex flex-col items-center gap-3 text-center px-6">
                      <div className="w-10 h-10 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                        <Lock className="h-5 w-5 text-[#dc2a28]" />
                      </div>
                      <p className="font-semibold text-sm">No activity in the last 3 hours</p>
                      <p className="text-xs text-muted-foreground max-w-xs">
                        {entity.name} has {entity.counts.total.toLocaleString()} messages on record. Upgrade to access the full history.
                      </p>
                      <Button
                        size="sm"
                        className="bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white mt-1"
                        onClick={() => {
                          window.location.href = clientSlug ? `/${clientSlug}/billing` : "/login"
                        }}
                      >
                        Upgrade to Unlock
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Inline "see more" banner — some items visible but full history is locked */}
              {showUpgradeBanner && (
                <div className="px-4 py-3 border-t border-border flex items-center justify-between bg-muted/30">
                  <p className="text-xs text-muted-foreground">
                    Showing the last 3 hours only. {entity.name} has {entity.counts.total.toLocaleString()} total messages on record.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 border-[#dc2a28] text-[#dc2a28] hover:bg-[#dc2a28]/10 flex-shrink-0 ml-4"
                    onClick={() => {
                      window.location.href = clientSlug ? `/${clientSlug}/billing` : "/login"
                    }}
                  >
                    Unlock Full History
                  </Button>
                </div>
              )}
            </div>
          )
        })()}

        {/* Preview loading indicator */}
        {previewLoading && (
          <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preview...
          </div>
        )}

      </div>
    </AppLayout>

      {/* Campaign/SMS Preview Dialog */}
      <Dialog open={!!selectedPreview} onOpenChange={() => setSelectedPreview(null)}>
        <DialogContent className="!max-w-[1100px] !w-[85vw] max-h-[90vh] overflow-y-auto">
          {selectedPreview && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selectedPreview.type === "sms" ? "SMS Message" : selectedPreview.subject || "Email Preview"}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-col gap-1 mt-1">
                    {/* Entity information */}
                    {data?.entity && (
                      <div className="flex flex-col gap-1 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {data.entity.name}
                          </span>
                          <span className="text-muted-foreground">
                            ({data.entity.type?.replace(/_/g, " ")})
                          </span>
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            onClick={() => window.open(`/directory/${nameToSlug(data.entity.name)}`, "_blank")}
                          >
                            [View Profile]
                          </Button>
                        </div>
                        {data.entity.party && (
                          <div>
                            <Badge className={`text-xs capitalize ${getPartyColor(data.entity.party)}`}>
                              {data.entity.party}
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-sm">
                      {selectedPreview.type === "sms"
                        ? <Smartphone className="h-3.5 w-3.5" />
                        : <Mail className="h-3.5 w-3.5" />}
                      <span>{selectedPreview.type === "sms" ? selectedPreview.phoneNumber : selectedPreview.senderEmail}</span>
                    </div>
                    {selectedPreview.dateReceived && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(selectedPreview.dateReceived).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                      </div>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              <Tabs defaultValue="preview" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">
                    {selectedPreview.type === "sms" ? "Message" : "Email Preview"}
                  </TabsTrigger>
                  <TabsTrigger value="links">
                    CTA Links ({selectedPreview.ctaLinks.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="preview" className="mt-4">
                  {selectedPreview.type === "sms" ? (
                    <div className="rounded-lg border bg-white p-6">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                        <Smartphone className="h-4 w-4" />
                        <span>From: {selectedPreview.phoneNumber}</span>
                      </div>
                      <div className="text-black whitespace-pre-wrap break-words text-sm">
                        {selectedPreview.emailPreview || selectedPreview.emailContent || "No message content."}
                      </div>
                    </div>
                  ) : selectedPreview.emailContent ? (
                    <div className="rounded-lg border bg-white overflow-auto">
                      <iframe
                        srcDoc={prepareEmailHtml(selectedPreview.emailContent)}
                        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        className="w-full border-0"
                        style={{ height: "60vh" }}
                        title="Email Preview"
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground text-center">No email content available</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="links" className="mt-4">
                  {selectedPreview.ctaLinks.length > 0 ? (
                    <div className="space-y-3">
                      {selectedPreview.ctaLinks.map((link, idx) => {
                        const url = typeof link === "string" ? link : link.url
                        const finalUrl = typeof link === "string" ? null : link.finalUrl
                        const strippedFinalUrl = typeof link === "string" ? null : link.strippedFinalUrl
                        const type = typeof link === "string" ? null : link.type
                        const displayUrl = strippedFinalUrl || finalUrl || url
                        return (
                          <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <a
                                  href={displayUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-start gap-2 text-[#dc2a28] hover:underline break-all text-sm"
                                >
                                  <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                  <span>{displayUrl}</span>
                                </a>
                              </div>
                              {type && (
                                <Badge variant="secondary" className="capitalize flex-shrink-0">
                                  {type}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">No CTA links found</div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
