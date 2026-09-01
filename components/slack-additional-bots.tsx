"use client"

// Additional (paid, $50/mo add-on) Slack bot channels, on top of the free primary bot managed
// by the integrations page itself. Fully wired against /api/slack/bots, but only ever rendered
// by the integrations page when SLACK_MULTI_BOT_ENABLED is true - see lib/feature-flags.ts.
// Until that flag flips, this component is dead code from the user's perspective: nothing
// imports it in a way that reaches the DOM.

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Loader2, Hash, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { SlackEntityPicker, type SlackPickerEntity } from "@/components/slack-entity-picker"

type Bot = {
  id: string
  label: string | null
  channelId: string | null
  channelName: string | null
  status: "awaiting_channel" | "connected" | "disconnected"
  notifyOnFollowedEntityMessages: boolean
  entityFilterConfigured: boolean
}

type SlackChannelOption = { id: string; name: string; isPrivate: boolean }

export function SlackAdditionalBots({ canManageSlack }: { canManageSlack: boolean }) {
  const [bots, setBots] = useState<Bot[]>([])
  const [loading, setLoading] = useState(true)
  const [pricePerBot, setPricePerBot] = useState(50)
  const [adding, setAdding] = useState(false)
  const [newBotLabel, setNewBotLabel] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  const [channelOptions, setChannelOptions] = useState<SlackChannelOption[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [selectingBotId, setSelectingBotId] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState("")
  const [savingChannelForBotId, setSavingChannelForBotId] = useState<string | null>(null)
  const [removingBotId, setRemovingBotId] = useState<string | null>(null)

  const [allEntities, setAllEntities] = useState<SlackPickerEntity[]>([])
  const [followedEntityIds, setFollowedEntityIds] = useState<Set<string>>(new Set())
  const [entitiesLoading, setEntitiesLoading] = useState(false)
  const [filterPanelBotId, setFilterPanelBotId] = useState<string | null>(null)
  const [draftEntityIds, setDraftEntityIds] = useState<Set<string>>(new Set())
  const [savingFilter, setSavingFilter] = useState(false)

  const fetchBots = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/slack/bots", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setBots(data.bots ?? [])
        setPricePerBot(data.pricePerBot ?? 50)
      }
    } catch (error) {
      console.error("[v0] Error fetching additional Slack bots:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBots()
  }, [fetchBots])

  const fetchChannelOptions = useCallback(async () => {
    setChannelsLoading(true)
    try {
      const response = await fetch("/api/slack/channels", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setChannelOptions(data.channels ?? [])
      }
    } catch (error) {
      console.error("[v0] Error fetching Slack channel options:", error)
    } finally {
      setChannelsLoading(false)
    }
  }, [])

  const fetchPickerEntities = useCallback(async () => {
    setEntitiesLoading(true)
    try {
      const [entitiesResponse, followedResponse] = await Promise.all([
        fetch("/api/competitive-insights/senders", { credentials: "include" }),
        fetch("/api/ci/subscriptions/check-all", { credentials: "include" }),
      ])
      if (entitiesResponse.ok) {
        const data = await entitiesResponse.json()
        setAllEntities(data.entities ?? [])
      }
      if (followedResponse.ok) {
        const data = await followedResponse.json()
        setFollowedEntityIds(new Set<string>(data.entityIds ?? []))
      }
    } catch (error) {
      console.error("[v0] Error fetching entities for additional bot filter:", error)
    } finally {
      setEntitiesLoading(false)
    }
  }, [])

  const handleAddBot = async () => {
    setAdding(true)
    try {
      const response = await fetch("/api/slack/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label: newBotLabel.trim() || undefined }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to add a new bot")
      }
      toast.success(`New bot added - $${pricePerBot}/month has been added to your subscription.`)
      setNewBotLabel("")
      setShowAddForm(false)
      await fetchBots()
    } catch (error) {
      console.error("[v0] Error adding Slack bot:", error)
      toast.error(error instanceof Error ? error.message : "Failed to add a new bot")
    } finally {
      setAdding(false)
    }
  }

  const handleStartSelectChannel = (botId: string) => {
    setSelectingBotId(botId)
    setSelectedChannelId("")
    fetchChannelOptions()
  }

  const handleSaveChannel = async (botId: string) => {
    const selected = channelOptions.find((c) => c.id === selectedChannelId)
    if (!selected) {
      toast.error("Please select a channel from the list.")
      return
    }
    setSavingChannelForBotId(botId)
    try {
      const response = await fetch(`/api/slack/bots/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ channelId: selected.id, channelName: selected.name }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to connect the channel")
      }
      toast.success(`Alerts will now post to #${selected.name}.`)
      setSelectingBotId(null)
      setSelectedChannelId("")
      await fetchBots()
    } catch (error) {
      console.error("[v0] Error selecting channel for additional bot:", error)
      toast.error(error instanceof Error ? error.message : "Failed to connect the channel")
    } finally {
      setSavingChannelForBotId(null)
    }
  }

  const handleToggleNotify = async (botId: string, checked: boolean) => {
    setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, notifyOnFollowedEntityMessages: checked } : b)))
    try {
      const response = await fetch(`/api/slack/bots/${botId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notifyOnFollowedEntityMessages: checked }),
      })
      if (!response.ok) throw new Error("Failed to update notification preferences")
    } catch (error) {
      console.error("[v0] Error toggling additional bot notifications:", error)
      toast.error("Failed to update notification preferences")
      setBots((prev) => prev.map((b) => (b.id === botId ? { ...b, notifyOnFollowedEntityMessages: !checked } : b)))
    }
  }

  const handleOpenFilterEditor = async (bot: Bot) => {
    setFilterPanelBotId(bot.id)
    if (allEntities.length === 0) fetchPickerEntities()
    try {
      const response = await fetch(`/api/slack/bots/${bot.id}/entity-filter`, { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setDraftEntityIds(new Set<string>(data.entityIds ?? []))
      }
    } catch (error) {
      console.error("[v0] Error loading entity filter for additional bot:", error)
    }
  }

  const handleSaveFilter = async (botId: string) => {
    setSavingFilter(true)
    try {
      const response = await fetch(`/api/slack/bots/${botId}/entity-filter`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ entityIds: Array.from(draftEntityIds) }),
      })
      if (!response.ok) throw new Error("Failed to save entity filter")
      toast.success("Entity filter saved.")
      setFilterPanelBotId(null)
      await fetchBots()
    } catch (error) {
      console.error("[v0] Error saving entity filter for additional bot:", error)
      toast.error("Failed to save entity filter")
    } finally {
      setSavingFilter(false)
    }
  }

  const handleRemoveBot = async (botId: string) => {
    setRemovingBotId(botId)
    try {
      const response = await fetch(`/api/slack/bots/${botId}`, { method: "DELETE", credentials: "include" })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error ?? "Failed to remove bot")
      }
      toast.success("Bot removed. Your subscription has been updated.")
      await fetchBots()
    } catch (error) {
      console.error("[v0] Error removing additional Slack bot:", error)
      toast.error(error instanceof Error ? error.message : "Failed to remove bot")
    } finally {
      setRemovingBotId(null)
    }
  }

  const activeBots = bots.filter((b) => b.status !== "disconnected")

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Additional Slack bots</CardTitle>
            <CardDescription>
              Add another bot posting to a different channel with its own entity filter, for ${pricePerBot}/month
              each.
            </CardDescription>
          </div>
          {canManageSlack && !showAddForm && (
            <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add another bot
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Loading additional bots...
          </div>
        ) : (
          <>
            {showAddForm && canManageSlack && (
              <div className="space-y-3 rounded-md border border-border p-4">
                <p className="text-sm font-medium">New bot</p>
                <Label htmlFor="new-bot-label" className="font-normal text-sm text-muted-foreground">
                  Optional label to tell this bot apart (e.g. &quot;State races&quot;)
                </Label>
                <Input
                  id="new-bot-label"
                  value={newBotLabel}
                  onChange={(e) => setNewBotLabel(e.target.value)}
                  placeholder="Bot 2"
                  className="sm:w-64"
                />
                <div className="flex items-center gap-2">
                  <Button onClick={handleAddBot} disabled={adding}>
                    {adding && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Add bot (${pricePerBot}/mo)
                  </Button>
                  <Button variant="ghost" onClick={() => setShowAddForm(false)} disabled={adding}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {activeBots.length === 0 && !showAddForm && (
              <p className="text-sm text-muted-foreground">No additional bots yet.</p>
            )}

            {activeBots.map((bot) => (
              <div key={bot.id} className="space-y-3 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{bot.label ?? "Additional bot"}</span>
                    {bot.status === "connected" ? (
                      <Badge variant="secondary">Connected</Badge>
                    ) : (
                      <Badge variant="outline">Awaiting channel</Badge>
                    )}
                  </div>
                  {canManageSlack && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveBot(bot.id)}
                      disabled={removingBotId === bot.id}
                    >
                      {removingBotId === bot.id ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1.5 h-4 w-4" />
                      )}
                      Remove
                    </Button>
                  )}
                </div>

                {bot.status === "connected" && bot.channelName && (
                  <div className="flex items-center gap-2 text-sm text-foreground">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{bot.channelName}</span>
                  </div>
                )}

                {bot.status !== "connected" && canManageSlack && (
                  <div className="space-y-2">
                    {selectingBotId === bot.id ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
                          <SelectTrigger className="sm:w-64">
                            <SelectValue
                              placeholder={channelsLoading ? "Loading channels..." : "Select a channel"}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {channelOptions.map((channel) => (
                              <SelectItem key={channel.id} value={channel.id}>
                                #{channel.name}
                                {channel.isPrivate ? " (private)" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          onClick={() => handleSaveChannel(bot.id)}
                          disabled={!selectedChannelId || savingChannelForBotId === bot.id || channelsLoading}
                        >
                          {savingChannelForBotId === bot.id && (
                            <Loader2 size={14} className="mr-2 animate-spin" />
                          )}
                          Connect channel
                        </Button>
                        <Button variant="ghost" onClick={() => setSelectingBotId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleStartSelectChannel(bot.id)}>
                        Choose a channel
                      </Button>
                    )}
                  </div>
                )}

                {bot.status === "connected" && (
                  <>
                    <div className="flex items-start justify-between gap-4 py-1">
                      <div className="space-y-0.5">
                        <Label className="font-normal">Followed entity activity</Label>
                        <p className="text-sm text-muted-foreground">
                          New emails or texts from entities your organization follows.
                        </p>
                      </div>
                      <Switch
                        checked={bot.notifyOnFollowedEntityMessages}
                        onCheckedChange={(checked) => handleToggleNotify(bot.id, checked)}
                        disabled={!canManageSlack}
                      />
                    </div>

                    <div className="space-y-3 border-t border-border pt-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="text-sm text-muted-foreground">
                          {bot.entityFilterConfigured
                            ? "Alerts are limited to a selection of entities."
                            : "Alerts post for every entity your organization follows."}
                        </p>
                        {canManageSlack && filterPanelBotId !== bot.id && (
                          <Button variant="outline" size="sm" onClick={() => handleOpenFilterEditor(bot)}>
                            {bot.entityFilterConfigured ? "Edit entities" : "Limit to specific entities"}
                          </Button>
                        )}
                      </div>

                      {filterPanelBotId === bot.id && (
                        <div className="space-y-3">
                          <SlackEntityPicker
                            entities={allEntities}
                            selectedIds={draftEntityIds}
                            onToggle={(entityId) =>
                              setDraftEntityIds((prev) => {
                                const next = new Set(prev)
                                next.has(entityId) ? next.delete(entityId) : next.add(entityId)
                                return next
                              })
                            }
                            onClearAll={() => setDraftEntityIds(new Set())}
                            followedEntityIds={followedEntityIds}
                            loading={entitiesLoading}
                          />
                          <div className="flex items-center gap-2">
                            <Button onClick={() => handleSaveFilter(bot.id)} disabled={savingFilter}>
                              {savingFilter && <Loader2 size={14} className="mr-2 animate-spin" />}
                              Save entities
                            </Button>
                            <Button variant="ghost" onClick={() => setFilterPanelBotId(null)} disabled={savingFilter}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  )
}
