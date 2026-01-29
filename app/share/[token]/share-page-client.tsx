"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Mail, Calendar, ExternalLink, Loader2, ZoomIn, ZoomOut, Smartphone, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Campaign {
  id: string
  type: "email" | "sms"
  senderName: string
  senderEmail?: string
  phoneNumber?: string
  toNumber?: string
  subject: string
  message?: string
  dateReceived: string
  inboxRate?: number
  ctaLinks: Array<{ url: string; finalUrl?: string; type: string }>
  emailContent?: string | null
  entity?: {
    id: string
    name: string
    type: string
    party?: string | null
    state?: string | null
  } | null
}

export default function SharePageClient() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [emailZoom, setEmailZoom] = useState(100)
  const [dialogOpen, setDialogOpen] = useState(true)

  useEffect(() => {
    checkAuth()
    fetchSharedCampaign()
  }, [token])

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" })
      setIsAuthenticated(response.ok)
    } catch {
      setIsAuthenticated(false)
    }
  }

  const fetchSharedCampaign = async () => {
    try {
      const response = await fetch(`/api/share/${token}`)

      if (!response.ok) {
        if (response.status === 404) {
          setError("This share link is invalid or has been removed.")
        } else if (response.status === 410) {
          setError("This share link has expired. Share links are valid for 7 days.")
        } else {
          setError("Failed to load campaign.")
        }
        setLoading(false)
        return
      }

      const data = await response.json()
      setCampaign(data.campaign)
    } catch (err) {
      setError("Failed to load campaign.")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setDialogOpen(false)
    setTimeout(() => {
      if (isAuthenticated) {
        router.push("/admin/ci/campaigns")
      } else {
        router.push("/login")
      }
    }, 100)
  }

  const prepareEmailHtml = (html: string) => {
    if (html.includes("<head>")) {
      return html.replace("<head>", '<head><base target="_blank">')
    } else if (html.includes("<html>")) {
      return html.replace("<html>", '<html><head><base target="_blank"></head>')
    } else {
      return `<head><base target="_blank"></head>${html}`
    }
  }

  const getPartyColor = (party: string | null | undefined) => {
    if (!party) return "secondary"
    switch (party.toLowerCase()) {
      case "republican":
        return "destructive"
      case "democrat":
        return "default"
      case "independent":
        return "secondary"
      default:
        return "secondary"
    }
  }

  const handleZoomIn = () => {
    setEmailZoom((prev) => Math.min(200, prev + 25))
  }

  const handleZoomOut = () => {
    setEmailZoom((prev) => Math.max(50, prev - 25))
  }

  const handleZoomReset = () => {
    setEmailZoom(100)
  }

  const renderMessageWithLinks = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(urlRegex)

    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-rip-red hover:underline break-all"
          >
            {part}
          </a>
        )
      }
      return part
    })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading shared campaign...</p>
        </div>
      </div>
    )
  }

  if (error || !campaign) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-6xl">🔗</div>
          <h1 className="text-2xl font-bold">{error || "Campaign not found"}</h1>
          <p className="text-muted-foreground">
            {error === "This share link has expired. Share links are valid for 7 days."
              ? "Share links expire after 7 days for security. Please request a new share link."
              : "The campaign you're looking for doesn't exist or the link is invalid."}
          </p>
          <Button onClick={handleClose}>{isAuthenticated ? "Go to Dashboard" : "Go to Login"}</Button>
          <div className="pt-4 border-t">
            <p className="text-xs text-muted-foreground">Powered by RIP Tool</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleClose()
          }
        }}
      >
        <DialogContent className="!max-w-[1400px] !w-[85vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle className="text-xl">{campaign.subject}</DialogTitle>
                <DialogDescription>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2">
                      {campaign.type === "sms" ? <Smartphone className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
                      {campaign.entity ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{campaign.entity.name}</span>
                          {(campaign.entity.party || campaign.entity.state) && (
                            <div className="flex gap-1">
                              {campaign.entity.party && (
                                <Badge variant={getPartyColor(campaign.entity.party)} className="text-xs capitalize">
                                  {campaign.entity.party}
                                </Badge>
                              )}
                              {campaign.entity.state && (
                                <Badge variant="outline" className="text-xs">
                                  {campaign.entity.state}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="font-medium">{campaign.senderName}</span>
                      )}
                      <span className="text-muted-foreground">
                        ({campaign.type === "sms" ? campaign.phoneNumber : campaign.senderEmail})
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="h-4 w-4" />
                      {new Date(campaign.dateReceived).toLocaleDateString()}
                    </div>
                  </div>
                </DialogDescription>
              </div>
              {campaign.type === "email" && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={emailZoom <= 50}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleZoomReset} disabled={emailZoom === 100}>
                    {emailZoom}%
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={emailZoom >= 200}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          <Tabs defaultValue="preview" className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="preview">{campaign.type === "sms" ? "Message" : "Email Preview"}</TabsTrigger>
              <TabsTrigger value="links">CTA Links ({campaign.ctaLinks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="mt-4">
              {campaign.type === "sms" ? (
                <div className="rounded-lg border bg-white p-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>From: {campaign.phoneNumber}</span>
                    </div>
                    <div className="text-base text-black whitespace-pre-wrap">
                      {renderMessageWithLinks(campaign.message || "No message content")}
                    </div>
                  </div>
                </div>
              ) : campaign.emailContent ? (
                <div className="rounded-lg border bg-white overflow-auto">
                  <div
                    style={{
                      transform: `scale(${emailZoom / 100})`,
                      transformOrigin: "top left",
                      width: `${10000 / emailZoom}%`,
                      height: `${60000 / emailZoom}px`,
                    }}
                  >
                    <iframe
                      srcDoc={prepareEmailHtml(campaign.emailContent)}
                      sandbox="allow-same-origin allow-popups"
                      className="w-full h-[600px] border-0"
                      title="Email Preview"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-sm text-muted-foreground text-center">No email content available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="links" className="mt-4">
              {campaign.ctaLinks.length > 0 ? (
                <div className="space-y-3">
                  {campaign.ctaLinks.map((link, idx) => {
                    const displayUrl = link.finalUrl || link.url

                    return (
                      <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <a
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-2 text-sm text-rip-red hover:underline break-all"
                            >
                              <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                              <span>{displayUrl}</span>
                            </a>
                          </div>
                          <Badge variant="secondary" className="capitalize flex-shrink-0">
                            {link.type}
                          </Badge>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">No CTA links found</div>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-4 pt-4 border-t text-center">
            <p className="text-xs text-muted-foreground">
              Shared via <span className="font-medium">RIP Tool</span> • Competitive Intelligence Platform
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
