"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, MessageSquare, Building2, Hash, Info } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

const MANAGER_ROLES = ["owner", "admin", "super_admin"]

type SlackChannel = {
  id: string
  name: string
  isPrivate: boolean
}

type SlackStatus = {
  connected: boolean
  status: "pending" | "awaiting_channel" | "connected" | "disconnected" | null
  teamName: string | null
  channelName: string | null
  connectedByName: string | null
  connectedAt: string | null
}

export default function AccountIntegrationsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const clientSlug = params.clientSlug as string
  const isAdminRoute = clientSlug === "admin"

  const [loading, setLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [slackStatus, setSlackStatus] = useState<SlackStatus | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [channels, setChannels] = useState<SlackChannel[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [selectedChannelId, setSelectedChannelId] = useState<string>("")
  const [savingChannel, setSavingChannel] = useState(false)

  const canManageSlack = currentUserRole !== null && MANAGER_ROLES.includes(currentUserRole)

  const fetchSlackStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/slack/status", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setSlackStatus(data)
      }
    } catch (error) {
      console.error("[v0] Error fetching Slack status:", error)
    }
  }, [])

  const fetchChannels = useCallback(async () => {
    setChannelsLoading(true)
    try {
      const response = await fetch("/api/slack/channels", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setChannels(data.channels ?? [])
      } else {
        toast.error("Failed to load Slack channels")
      }
    } catch (error) {
      console.error("[v0] Error fetching Slack channels:", error)
      toast.error("Failed to load Slack channels")
    } finally {
      setChannelsLoading(false)
    }
  }, [])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (!response.ok) {
          router.push("/login")
          return
        }
        const userData = await response.json()

        if (!isAdminRoute) {
          const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
            credentials: "include",
          })
          if (!verifyResponse.ok) {
            if (userData.role === "super_admin") {
              router.push("/rip/ci/campaigns")
            } else if (userData.clientSlug) {
              router.push(`/${userData.clientSlug}`)
            } else {
              router.push("/login")
            }
            return
          }
        }

        setCurrentUserRole(userData.role ?? null)
        await fetchSlackStatus()
      } catch (error) {
        console.error("[v0] Auth check failed:", error)
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [clientSlug, isAdminRoute, router, fetchSlackStatus])

  // Handle redirect back from the Slack OAuth flow
  useEffect(() => {
    const connected = searchParams.get("slack_connected")
    const error = searchParams.get("slack_error")

    if (connected) {
      toast.success("Slack authorized. Choose a channel to finish setup.")
      fetchSlackStatus()
      fetchChannels()
    } else if (error) {
      const messages: Record<string, string> = {
        authorization_failed: "Slack authorization was cancelled or failed.",
        missing_state: "Something went wrong starting the Slack connection. Please try again.",
        invalid_state: "This Slack connection link expired. Please try again.",
        missing_team: "Slack did not return a workspace. Please try again.",
        token_exchange_failed: "Could not complete the Slack connection. Please try again.",
      }
      toast.error(messages[error] ?? "Could not connect Slack. Please try again.")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  useEffect(() => {
    if (slackStatus?.status === "awaiting_channel") {
      fetchChannels()
    }
  }, [slackStatus?.status, fetchChannels])

  const handleConnect = async () => {
    setConnecting(true)
    try {
      const response = await fetch("/api/slack/connect", { credentials: "include" })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to start Slack connection")
      }
      const data = await response.json()
      if (typeof window !== "undefined" && window.self !== window.top) {
        window.open(data.url, "_blank", "noopener,noreferrer")
      } else {
        window.location.href = data.url
      }
    } catch (error) {
      console.error("[v0] Error starting Slack connect:", error)
      toast.error(error instanceof Error ? error.message : "Failed to start Slack connection")
      setConnecting(false)
    }
  }

  const handleSelectChannel = async () => {
    if (!selectedChannelId) return
    setSavingChannel(true)
    try {
      const response = await fetch("/api/slack/select-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channelId: selectedChannelId }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to connect the channel")
      }
      toast.success("Slack is connected. Alerts will post to that channel.")
      await fetchSlackStatus()
    } catch (error) {
      console.error("[v0] Error selecting Slack channel:", error)
      toast.error(error instanceof Error ? error.message : "Failed to connect the channel")
    } finally {
      setSavingChannel(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const response = await fetch("/api/slack/disconnect", {
        method: "POST",
        credentials: "include",
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to disconnect Slack")
      }
      toast.success("Slack disconnected")
      setChannels([])
      setSelectedChannelId("")
      await fetchSlackStatus()
    } catch (error) {
      console.error("[v0] Error disconnecting Slack:", error)
      toast.error(error instanceof Error ? error.message : "Failed to disconnect Slack")
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading integrations...</p>
        </div>
      </div>
    )
  }

  const isConnected = slackStatus?.status === "connected"
  const isAwaitingChannel = slackStatus?.status === "awaiting_channel"

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminRoute}>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium">Integrations</h2>
            <p className="text-muted-foreground">
              Connect third-party tools to your organization.
            </p>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                    <MessageSquare className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle>Slack</CardTitle>
                    <CardDescription>
                      Get alerted in Slack the moment an entity your organization follows sends an email or text.
                    </CardDescription>
                  </div>
                </div>
                {isConnected && <Badge variant="secondary">Connected</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  This connects Slack for your entire organization, not just your own account. Once
                  connected, every teammate in the chosen channel will see alerts. Only Owners and
                  Admins can connect or disconnect Slack.
                </p>
              </div>

              {isConnected && slackStatus && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <div className="flex items-center gap-2 text-foreground">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{slackStatus.teamName ?? "Slack workspace"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{slackStatus.channelName ?? "unknown channel"}</span>
                    </div>
                  </div>
                  {slackStatus.connectedByName && (
                    <p className="text-sm text-muted-foreground">
                      Connected by {slackStatus.connectedByName}
                      {slackStatus.connectedAt
                        ? ` on ${new Date(slackStatus.connectedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  )}
                  {canManageSlack ? (
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting && <Loader2 size={14} className="mr-2 animate-spin" />}
                      Disconnect Slack
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Ask an Owner or Admin on your team to make changes to this connection.
                    </p>
                  )}
                </div>
              )}

              {isAwaitingChannel && canManageSlack && (
                <div className="space-y-3 rounded-md border border-border p-4">
                  <p className="text-sm font-medium">Choose a channel for alerts</p>
                  <p className="text-sm text-muted-foreground">
                    Pick the channel where your organization&apos;s alerts should be posted. The bot
                    will join it automatically.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                      <SelectTrigger className="sm:w-64">
                        <SelectValue
                          placeholder={channelsLoading ? "Loading channels..." : "Select a channel"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((channel) => (
                          <SelectItem key={channel.id} value={channel.id}>
                            #{channel.name}
                            {channel.isPrivate ? " (private)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleSelectChannel}
                      disabled={!selectedChannelId || savingChannel || channelsLoading}
                    >
                      {savingChannel && <Loader2 size={14} className="mr-2 animate-spin" />}
                      Connect channel
                    </Button>
                  </div>
                </div>
              )}

              {isAwaitingChannel && !canManageSlack && (
                <p className="text-sm text-muted-foreground">
                  Slack setup is in progress. Ask an Owner or Admin on your team to finish choosing a
                  channel.
                </p>
              )}

              {!isConnected && !isAwaitingChannel && (
                <div>
                  {canManageSlack ? (
                    <Button onClick={handleConnect} disabled={connecting}>
                      {connecting && <Loader2 size={14} className="mr-2 animate-spin" />}
                      Connect Slack
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Slack is not connected yet. Ask an Owner or Admin on your team to set it up.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
