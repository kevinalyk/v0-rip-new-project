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
    case "independent":
    case "third party": return "bg-zinc-500 text-white"
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

export function DirectoryProfileContent({ slug }: { slug: string }) {
  const [clientSlug, setClientSlug] = useState<string>("")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [data, setData] = useState<EntityData | null>(null)
  const [loading, setLoading] = useState(true)
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
          setClientSlug(user.clientId || "rip")
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

  // Fetch entity data — wait for auth so clientSlug is ready before rendering AppLayout
  useEffect(() => {
    if (authLoading) return
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
  }, [authLoading, slug])

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

  if (authLoading || loading) {
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

  const { entity, recentCampaigns, recentSms } = data
  const emailDomains = [...new Set(entity.mappings.filter((m) => m.senderDomain).map((m) => m.senderDomain!))]
  const shortCodes = [...new Set(entity.mappings.filter((m) => m.senderPhone).map((m) => m.senderPhone!))]

  return (
    <>
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="container mx-auto py-8 px-4 max-w-3xl">

        {/* Profile hero */}
        <div className="flex items-start gap-5 mb-8">
          <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
            {getEntityIcon(entity.type)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-balance mb-2">{entity.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {entity.party && (
                <Badge className={getPartyColor(entity.party)}>
                  {entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}
                </Badge>
              )}
              {entity.state && <Badge variant="outline">{entity.state}</Badge>}
              <Badge variant="secondary" className="capitalize">{entity.type}</Badge>
            </div>
          </div>
          {isAuthenticated && (
            <div className="flex-shrink-0">
              <CiEntitySubscribeButton entityId={entity.id} entityName={entity.name} />
            </div>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Mail className="h-3.5 w-3.5" />
              Emails
            </div>
            <div className="text-2xl font-bold">{entity.counts.emails.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <MessageSquare className="h-3.5 w-3.5" />
              SMS
            </div>
            <div className="text-2xl font-bold">{entity.counts.sms.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-muted-foreground text-xs mb-1">Total</div>
            <div className="text-2xl font-bold">{entity.counts.total.toLocaleString()}</div>
          </div>
        </div>

        {/* Domains & Short Codes */}
        {(emailDomains.length > 0 || shortCodes.length > 0) && (
          <div className="grid gap-4 md:grid-cols-2 mb-8">
            {emailDomains.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Email Domains</h2>
                <div className="flex flex-wrap gap-2">
                  {emailDomains.map((domain) => (
                    <Badge key={domain} variant="secondary" className="font-mono text-xs">{domain}</Badge>
                  ))}
                </div>
              </div>
            )}
            {shortCodes.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">SMS Numbers</h2>
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
        <div className="rounded-lg border border-border bg-card overflow-hidden mb-8">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm">Recent Communications</h2>
            <span className="text-xs text-muted-foreground">
              {recentCampaigns.length + recentSms.length} previewed of {entity.counts.total}
            </span>
          </div>

          <div className="divide-y divide-border relative">
            {recentCampaigns.slice(0, 5).map((campaign) => (
              <div
                key={campaign.id}
                className={`px-4 py-3 flex items-center justify-between gap-4 ${isAuthenticated ? "cursor-pointer hover:bg-accent/50 transition-colors" : "blur-sm select-none pointer-events-none"}`}
                onClick={() => isAuthenticated && handlePreviewClick(campaign.id, "email")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{campaign.subject || "No subject"}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(campaign.dateReceived)}</span>
              </div>
            ))}
            {recentSms.slice(0, 3).map((sms) => (
              <div
                key={sms.id}
                className={`px-4 py-3 flex items-center justify-between gap-4 ${isAuthenticated ? "cursor-pointer hover:bg-accent/50 transition-colors" : "blur-sm select-none pointer-events-none"}`}
                onClick={() => isAuthenticated && handlePreviewClick(sms.id, "sms")}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{sms.message?.substring(0, 80) || "SMS message"}</span>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatDate(sms.createdAt)}</span>
              </div>
            ))}

            {/* Login gate overlay — only shown when not authenticated */}
            {!isAuthenticated && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px]">
                <div className="flex flex-col items-center gap-3 text-center px-6">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-sm">Sign in to view full communications</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Access the complete feed of emails and SMS messages captured from {entity.name}.
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
          </div>
        </div>

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
