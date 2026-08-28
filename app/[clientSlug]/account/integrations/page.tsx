"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
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
  channelId: string | null
  channelName: string | null
  connectedByName: string | null
  connectedAt: string | null
  notifyOnFollowedEntityMessages: boolean
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
  // Lets an already-connected workspace switch its posting channel without a
  // full disconnect/reconnect - reuses the same channel list + select-channel
  // endpoint as initial setup, since that endpoint works regardless of status.
  const [changingChannel, setChangingChannel] = useState(false)
  const [savingPreferences, setSavingPreferences] = useState(false)

  const canManageSlack = currentUserRole !== null && MANAGER_ROLES.includes(currentUserRole)

  const fetchSlackStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/slack/status", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        // /api/slack/status returns { integration, canManage } with the
        // connector's status nested inside `integration` and the connector
        // user surfaced as `connectedByUser` - flatten that into the shape
        // this page's UI checks (slackStatus.status, .connectedByName, etc).
        const integration = data.integration
        const connectedByUser = integration?.connectedByUser
        const connectedByName = connectedByUser
          ? [connectedByUser.firstName, connectedByUser.lastName].filter(Boolean).join(" ") ||
            connectedByUser.email
          : null
        setSlackStatus({
          connected: integration?.status === "connected",
          status: integration?.status ?? null,
          teamName: integration?.teamName ?? null,
          channelId: integration?.channelId ?? null,
          channelName: integration?.channelName ?? null,
          connectedByName,
          connectedAt: integration?.connectedAt ?? null,
          notifyOnFollowedEntityMessages: integration?.notifyOnFollowedEntityMessages ?? true,
        })
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
            } else if (clientSlug) {
              router.push(`/${clientSlug}`)
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
      const response = await fetch("/api/slack/connect", { method: "POST", credentials: "include" })
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
    const selectedChannel = channels.find((channel) => channel.id === selectedChannelId)
    if (!selectedChannel) {
      toast.error("Please select a channel from the list.")
      return
    }
    setSavingChannel(true)
    try {
      const response = await fetch("/api/slack/select-channel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channelId: selectedChannel.id, channelName: selectedChannel.name }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to connect the channel")
      }
      toast.success(
        changingChannel
          ? `Alerts will now post to #${selectedChannel.name}.`
          : "Slack is connected. Alerts will post to that channel.",
      )
      setChangingChannel(false)
      setSelectedChannelId("")
      await fetchSlackStatus()
    } catch (error) {
      console.error("[v0] Error selecting Slack channel:", error)
      toast.error(error instanceof Error ? error.message : "Failed to connect the channel")
    } finally {
      setSavingChannel(false)
    }
  }

  const handleStartChangeChannel = () => {
    setChangingChannel(true)
    setSelectedChannelId(slackStatus?.channelId ?? "")
    fetchChannels()
  }

  const handleCancelChangeChannel = () => {
    setChangingChannel(false)
    setSelectedChannelId("")
  }

  const handleToggleFollowedEntityAlerts = async (checked: boolean) => {
    if (!slackStatus) return
    // Optimistic update so the switch feels immediate; rolled back on failure.
    setSlackStatus({ ...slackStatus, notifyOnFollowedEntityMessages: checked })
    setSavingPreferences(true)
    try {
      const response = await fetch("/api/slack/notification-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notifyOnFollowedEntityMessages: checked }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to update notification preferences")
      }
      toast.success(checked ? "Followed entity alerts turned on" : "Followed entity alerts turned off")
    } catch (error) {
      console.error("[v0] Error updating Slack notification preferences:", error)
      toast.error(error instanceof Error ? error.message : "Failed to update notification preferences")
      setSlackStatus({ ...slackStatus, notifyOnFollowedEntityMessages: !checked })
    } finally {
      setSavingPreferences(false)
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
      setChangingChannel(false)
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
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                    {canManageSlack && !changingChannel && (
                      <Button variant="outline" size="sm" onClick={handleStartChangeChannel}>
                        Change channel
                      </Button>
                    )}
                  </div>

                  {changingChannel && (
                    <div className="space-y-3 rounded-md border border-border p-4">
                      <p className="text-sm font-medium">Move alerts to a different channel</p>
                      <p className="text-sm text-muted-foreground">
                        Pick a new channel and the bot will join it automatically. Alerts will stop
                        posting to #{slackStatus.channelName ?? "the current channel"} once this is
                        saved.
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
                          disabled={
                            !selectedChannelId || selectedChannelId === slackStatus.channelId || savingChannel || channelsLoading
                          }
                        >
                          {savingChannel && <Loader2 size={14} className="mr-2 animate-spin" />}
                          Save channel
                        </Button>
                        <Button variant="ghost" onClick={handleCancelChangeChannel} disabled={savingChannel}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {slackStatus.connectedByName && (
                    <p className="text-sm text-muted-foreground">
                      Connected by {slackStatus.connectedByName}
                      {slackStatus.connectedAt
                        ? ` on ${new Date(slackStatus.connectedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  )}

                  <div className="space-y-3 rounded-md border border-border p-4">
                    <p className="text-sm font-medium">Alert types</p>
                    <p className="text-sm text-muted-foreground">
                      Choose which alerts post to this channel. More alert types will show up
                      here as we add them, so your team can opt in or out of each on its own.
                    </p>
                    <div className="flex items-start justify-between gap-4 py-1">
                      <div className="space-y-0.5">
                        <Label htmlFor="notify-followed-entities" className="font-normal">
                          Followed entity activity
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          New emails or texts from entities your organization follows.
                        </p>
                      </div>
                      <Switch
                        id="notify-followed-entities"
                        checked={slackStatus.notifyOnFollowedEntityMessages}
                        onCheckedChange={handleToggleFollowedEntityAlerts}
                        disabled={!canManageSlack || savingPreferences}
                      />
                    </div>
                    {!canManageSlack && (
                      <p className="text-sm text-muted-foreground">
                        Only Owners and Admins can change alert preferences.
                      </p>
                    )}
                  </div>

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
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting || savingChannel}
                  >
                    {disconnecting && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Disconnect Slack
                  </Button>
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
