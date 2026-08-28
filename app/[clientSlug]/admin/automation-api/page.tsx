"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Loader2, Plus, Trash2, Copy, Check, ShieldAlert, Undo2 } from "lucide-react"
import AppLayout from "@/components/app-layout"

const ALL_SCOPES = [
  { value: "ci:read", label: "Read unassigned messages & entities" },
  { value: "ci:assign", label: "Assign messages to entities" },
  { value: "ci:create_entity", label: "Create new entities" },
  { value: "ci:update_entity", label: "Update entity donation identifiers" },
]

interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  isActive: boolean
  revokedAt: string | null
  createdAt: string
  lastUsedAt: string | null
  requestCount: number
}

interface ActivityLogRow {
  id: string
  action: string
  reasoning: string | null
  targetType: string | null
  targetIds: string[] | null
  entityId: string | null
  undone: boolean
  createdAt: string
  apiKey: { name: string; keyPrefix: string }
}

export default function AutomationApiPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [keysLoading, setKeysLoading] = useState(true)
  const [logs, setLogs] = useState<ActivityLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [automationEnabled, setAutomationEnabled] = useState(true)
  const [togglingAutomation, setTogglingAutomation] = useState(false)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(ALL_SCOPES.map((s) => s.value))
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (clientSlug !== "rip") {
          router.push(`/${clientSlug}/ci/campaigns`)
          return
        }

        const response = await fetch("/api/auth/me")
        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        if (user.role !== "super_admin") {
          router.push("/login")
          return
        }

        setIsAuthorized(true)
      } catch (error) {
        console.error("Auth check failed:", error)
        router.push("/login")
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router, clientSlug])

  const fetchKeys = useCallback(async () => {
    try {
      setKeysLoading(true)
      const res = await fetch("/api/admin/ci-automation/api-keys")
      if (res.ok) {
        const data = await res.json()
        setKeys(data.keys)
      }
    } catch (error) {
      console.error("Error fetching keys:", error)
    } finally {
      setKeysLoading(false)
    }
  }, [])

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true)
      const res = await fetch("/api/admin/ci-automation/activity")
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs)
      }
    } catch (error) {
      console.error("Error fetching activity logs:", error)
    } finally {
      setLogsLoading(false)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ci-automation/settings")
      if (res.ok) {
        const data = await res.json()
        setAutomationEnabled(data.ciAssignmentEnabled)
      }
    } catch (error) {
      console.error("Error fetching automation settings:", error)
    }
  }, [])

  useEffect(() => {
    if (isAuthorized) {
      fetchKeys()
      fetchLogs()
      fetchSettings()
    }
  }, [isAuthorized, fetchKeys, fetchLogs, fetchSettings])

  const handleToggleAutomation = async (enabled: boolean) => {
    setTogglingAutomation(true)
    try {
      const res = await fetch("/api/admin/ci-automation/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ciAssignmentEnabled: enabled }),
      })
      if (res.ok) {
        setAutomationEnabled(enabled)
        toast({
          title: enabled ? "Automation enabled" : "Automation paused",
          description: enabled
            ? "Claude can now assign messages and create/update entities."
            : "Claude can still browse unassigned messages and entities, but all write actions are blocked.",
        })
      } else {
        toast({ title: "Error", description: "Failed to update the kill switch", variant: "destructive" })
      }
    } finally {
      setTogglingAutomation(false)
    }
  }

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast({ title: "Error", description: "Please enter a name for the key", variant: "destructive" })
      return
    }
    if (newKeyScopes.length === 0) {
      toast({ title: "Error", description: "Select at least one scope", variant: "destructive" })
      return
    }

    try {
      const res = await fetch("/api/admin/ci-automation/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName, scopes: newKeyScopes }),
      })
      const data = await res.json()
      if (res.ok) {
        setCreatedKey(data.key)
        fetchKeys()
      } else {
        toast({ title: "Error", description: data.error || "Failed to create key", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error creating key:", error)
      toast({ title: "Error", description: "Failed to create key", variant: "destructive" })
    }
  }

  const handleCloseCreateDialog = () => {
    setIsCreateOpen(false)
    setNewKeyName("")
    setNewKeyScopes(ALL_SCOPES.map((s) => s.value))
    setCreatedKey(null)
    setCopied(false)
  }

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/ci-automation/api-keys/${id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Key revoked", description: "This key can no longer be used." })
        setRevokeConfirm(null)
        fetchKeys()
      } else {
        toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error revoking key:", error)
      toast({ title: "Error", description: "Failed to revoke key", variant: "destructive" })
    }
  }

  const handleUndo = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/ci-automation/activity/${id}/undo`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        toast({ title: "Undone", description: "This action has been reverted." })
        fetchLogs()
      } else {
        toast({ title: "Cannot undo", description: data.error || "Failed to undo action", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error undoing action:", error)
      toast({ title: "Error", description: "Failed to undo action", variant: "destructive" })
    }
  }

  const copyKey = () => {
    if (!createdKey) return
    navigator.clipboard.writeText(createdKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rip-red" />
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <AppLayout clientSlug="admin" isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Automation API</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage the credentials and audit trail for the Claude CI Assignment MCP server. This connector can
              list unassigned messages, assign them to entities, create new entities, and update donation
              identifiers on existing entities. Nothing else - see the tool descriptions in the connector itself for
              exact scope.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert size={20} className={automationEnabled ? "text-muted-foreground" : "text-red-500"} />
              <div>
                <div className="font-medium">Automation kill switch</div>
                <div className="text-sm text-muted-foreground">
                  {automationEnabled
                    ? "Claude can currently assign messages and create/update entities."
                    : "Paused - Claude can still browse data, but all writes are blocked."}
                </div>
              </div>
            </div>
            <Switch checked={automationEnabled} disabled={togglingAutomation} onCheckedChange={handleToggleAutomation} />
          </div>

          <Tabs defaultValue="keys">
            <TabsList>
              <TabsTrigger value="keys">API Keys</TabsTrigger>
              <TabsTrigger value="activity">API Activity ({logs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="keys" className="space-y-4">
              <div className="flex justify-end">
                <Dialog open={isCreateOpen} onOpenChange={(open) => (open ? setIsCreateOpen(true) : handleCloseCreateDialog())}>
                  <DialogTrigger asChild>
                    <Button className="bg-rip-red hover:bg-rip-red/90 text-white">
                      <Plus size={16} className="mr-2" />
                      Create Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    {createdKey ? (
                      <>
                        <DialogHeader>
                          <DialogTitle>Key created</DialogTitle>
                          <DialogDescription>
                            Copy this key now - it will not be shown again. Paste it as the bearer token when
                            connecting Claude to this MCP server.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex items-center gap-2 rounded-md border bg-muted p-3 font-mono text-sm break-all">
                          <span className="flex-1">{createdKey}</span>
                          <Button size="sm" variant="outline" onClick={copyKey}>
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                          </Button>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCloseCreateDialog}>Done</Button>
                        </DialogFooter>
                      </>
                    ) : (
                      <>
                        <DialogHeader>
                          <DialogTitle>Create Automation API Key</DialogTitle>
                          <DialogDescription>
                            This key authenticates a Claude connector to the CI Assignment MCP server. Grant only the
                            scopes it needs.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="key-name">Name *</Label>
                            <Input
                              id="key-name"
                              placeholder='e.g. "Claude - CI Assignment"'
                              value={newKeyName}
                              onChange={(e) => setNewKeyName(e.target.value)}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Scopes *</Label>
                            {ALL_SCOPES.map((scope) => (
                              <label key={scope.value} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={newKeyScopes.includes(scope.value)}
                                  onChange={(e) =>
                                    setNewKeyScopes((prev) =>
                                      e.target.checked ? [...prev, scope.value] : prev.filter((s) => s !== scope.value),
                                    )
                                  }
                                />
                                {scope.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={handleCloseCreateDialog}>
                            Cancel
                          </Button>
                          <Button onClick={handleCreateKey} className="bg-rip-red hover:bg-rip-red/90 text-white">
                            Create Key
                          </Button>
                        </DialogFooter>
                      </>
                    )}
                  </DialogContent>
                </Dialog>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Prefix</TableHead>
                      <TableHead>Scopes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Requests</TableHead>
                      <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keysLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12">
                          <Loader2 size={24} className="animate-spin text-rip-red mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : keys.length > 0 ? (
                      keys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell className="font-medium">{key.name}</TableCell>
                          <TableCell className="font-mono text-xs">{key.keyPrefix}...</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {key.scopes
                                .filter((s) => s.startsWith("ci:"))
                                .map((s) => (
                                  <Badge key={s} variant="secondary" className="text-xs">
                                    {s}
                                  </Badge>
                                ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            {key.isActive && !key.revokedAt ? (
                              <Badge className="bg-green-100 text-green-800">Active</Badge>
                            ) : (
                              <Badge variant="secondary">Revoked</Badge>
                            )}
                          </TableCell>
                          <TableCell>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</TableCell>
                          <TableCell>{key.requestCount}</TableCell>
                          <TableCell className="text-right">
                            {key.isActive && !key.revokedAt && (
                              <AlertDialog
                                open={revokeConfirm?.id === key.id}
                                onOpenChange={(open) => !open && setRevokeConfirm(null)}
                              >
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRevokeConfirm({ id: key.id, name: key.name })}
                                  >
                                    <Trash2 size={16} className="text-red-500" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to revoke &quot;{revokeConfirm?.name}&quot;? Any connector
                                      using this key will immediately lose access. This cannot be undone - you would
                                      need to create a new key.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleRevokeKey(key.id)}
                                      className="bg-red-500 hover:bg-red-600"
                                    >
                                      Revoke
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No automation keys yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Reasoning</TableHead>
                      <TableHead>Targets</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12">
                          <Loader2 size={24} className="animate-spin text-rip-red mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : logs.length > 0 ? (
                      logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="whitespace-nowrap text-sm">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-sm">{log.apiKey?.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {log.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">{log.reasoning}</TableCell>
                          <TableCell className="text-sm">
                            {log.targetIds && log.targetIds.length > 0
                              ? `${log.targetIds.length} message(s)`
                              : log.entityId
                                ? `entity ${log.entityId.slice(0, 8)}...`
                                : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {log.undone ? (
                              <Badge variant="outline" className="text-xs">
                                Undone
                              </Badge>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => handleUndo(log.id)}>
                                <Undo2 size={14} className="mr-1" />
                                Undo
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                          No API activity yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  )
}
