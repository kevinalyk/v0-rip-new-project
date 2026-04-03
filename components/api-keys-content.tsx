"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Key, Plus, Copy, Check, Trash2, Ban, Eye, EyeOff } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  rateLimit: number
  expiresAt: string | null
  lastUsedAt: string | null
  requestCount: number
  isActive: boolean
  revokedAt: string | null
  createdAt: string
}

export function ApiKeysContent() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [creating, setCreating] = useState(false)
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null)
  const [showNewKey, setShowNewKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revokeKeyId, setRevokeKeyId] = useState<string | null>(null)
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    try {
      const response = await fetch("/api/admin/api-keys/list", {
        credentials: "include",
      })
      if (response.ok) {
        const result = await response.json()
        setKeys(result.data || [])
      } else {
        // API returned error - could be due to Prisma not being generated yet
        setKeys([])
      }
    } catch (error) {
      console.error("Error fetching API keys:", error)
      setKeys([])
      toast({
        title: "Error",
        description: "Failed to fetch API keys. Make sure the database migration has been run.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const createKey = async () => {
    if (!newKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the API key",
        variant: "destructive",
      })
      return
    }

    setCreating(true)
    try {
      const response = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newKeyName,
          scopes: ["campaigns:read", "sms:read", "entities:read"],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setNewlyCreatedKey(data.key)
        setShowNewKey(true)
        setNewKeyName("")
        fetchKeys()
        toast({
          title: "API Key Created",
          description: "Make sure to copy your key now. You won't be able to see it again!",
        })
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to create API key",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating API key:", error)
      toast({
        title: "Error",
        description: "Failed to create API key",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/api-keys/${id}/revoke`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        fetchKeys()
        toast({
          title: "API Key Revoked",
          description: "The API key has been revoked and can no longer be used",
        })
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to revoke API key",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error revoking API key:", error)
      toast({
        title: "Error",
        description: "Failed to revoke API key",
        variant: "destructive",
      })
    }
    setRevokeKeyId(null)
  }

  const deleteKey = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/api-keys/${id}/delete`, {
        method: "DELETE",
        credentials: "include",
      })

      if (response.ok) {
        fetchKeys()
        toast({
          title: "API Key Deleted",
          description: "The API key has been permanently deleted",
        })
      } else {
        const error = await response.json()
        toast({
          title: "Error",
          description: error.error || "Failed to delete API key",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting API key:", error)
      toast({
        title: "Error",
        description: "Failed to delete API key",
        variant: "destructive",
      })
    }
    setDeleteKeyId(null)
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never"
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const closeNewKeyDialog = () => {
    setCreateDialogOpen(false)
    setNewlyCreatedKey(null)
    setShowNewKey(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Keys</h1>
          <p className="text-muted-foreground mt-1">
            Manage API keys for accessing the public API endpoints
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={(open) => {
          if (!open) closeNewKeyDialog()
          else setCreateDialogOpen(true)
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create API Key
            </Button>
          </DialogTrigger>
          <DialogContent>
            {newlyCreatedKey ? (
              <>
                <DialogHeader>
                  <DialogTitle>API Key Created</DialogTitle>
                  <DialogDescription>
                    Copy your API key now. You won&apos;t be able to see it again!
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Your API Key</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type={showNewKey ? "text" : "password"}
                        value={newlyCreatedKey}
                        readOnly
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowNewKey(!showNewKey)}
                      >
                        {showNewKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(newlyCreatedKey)}
                      >
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm text-amber-800 dark:text-amber-200">
                    <strong>Important:</strong> Store this key securely. It will not be shown again.
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={closeNewKeyDialog}>Done</Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for accessing the public API endpoints.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Key Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Production Key, Dev Testing"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Scopes</Label>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">campaigns:read</Badge>
                      <Badge variant="secondary">sms:read</Badge>
                      <Badge variant="secondary">entities:read</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      All keys currently have read access to campaigns, SMS, and entities.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createKey} disabled={creating}>
                    {creating ? "Creating..." : "Create Key"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Active Keys
          </CardTitle>
          <CardDescription>
            Keys used to authenticate requests to the public API
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No API keys created yet</p>
              <p className="text-sm">Create your first API key to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{key.name}</span>
                      {key.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : !key.isActive ? (
                        <Badge variant="secondary">Inactive</Badge>
                      ) : (
                        <Badge variant="default" className="bg-green-600">Active</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground font-mono">
                      {key.keyPrefix}...
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Created: {formatDate(key.createdAt)}</span>
                      <span>Last used: {formatDate(key.lastUsedAt)}</span>
                      <span>Requests: {key.requestCount.toLocaleString()}</span>
                      <span>Rate limit: {key.rateLimit}/min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!key.revokedAt && key.isActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setRevokeKeyId(key.id)}
                      >
                        <Ban className="h-4 w-4 mr-1" />
                        Revoke
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteKeyId(key.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Usage</CardTitle>
          <CardDescription>
            How to use your API key to access the public endpoints
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Authentication</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Include your API key in the Authorization header:
            </p>
            <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto">
              Authorization: Bearer rip_pk_your_api_key_here
            </pre>
          </div>
          <div>
            <h4 className="font-medium mb-2">Available Endpoints</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><code className="bg-muted px-1 rounded">GET /api/v1/campaigns</code> - List email campaigns</li>
              <li><code className="bg-muted px-1 rounded">GET /api/v1/campaigns/:id</code> - Get a single campaign</li>
              <li><code className="bg-muted px-1 rounded">GET /api/v1/sms</code> - List SMS messages</li>
              <li><code className="bg-muted px-1 rounded">GET /api/v1/sms/:id</code> - Get a single SMS message</li>
              <li><code className="bg-muted px-1 rounded">GET /api/v1/entities</code> - List entities</li>
              <li><code className="bg-muted px-1 rounded">GET /api/v1/entities/:id</code> - Get a single entity</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Query Parameters</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><code className="bg-muted px-1 rounded">limit</code> - Number of results (default: 20, max: 100)</li>
              <li><code className="bg-muted px-1 rounded">offset</code> - Skip results for pagination</li>
              <li><code className="bg-muted px-1 rounded">from</code> - Filter by start date (ISO format: 2026-01-01)</li>
              <li><code className="bg-muted px-1 rounded">to</code> - Filter by end date (ISO format: 2026-03-31)</li>
              <li><code className="bg-muted px-1 rounded">entityId</code> - Filter by entity ID</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Example Requests</h4>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Get all campaigns:</p>
                <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap">
{`curl "https://app.rip-tool.com/api/v1/campaigns" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Filter campaigns by date range:</p>
                <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap">
{`curl "https://app.rip-tool.com/api/v1/campaigns?from=2026-03-01&to=2026-03-31" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Get SMS messages with pagination:</p>
                <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap">
{`curl "https://app.rip-tool.com/api/v1/sms?limit=50&offset=100" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Filter by entity:</p>
                <pre className="bg-muted p-3 rounded-md text-sm font-mono overflow-x-auto whitespace-pre-wrap">
{`curl "https://app.rip-tool.com/api/v1/campaigns?entityId=abc123" \\
  -H "Authorization: Bearer YOUR_API_KEY"`}
                </pre>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={!!revokeKeyId} onOpenChange={() => setRevokeKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately disable the API key. Any applications using this key will no longer be able to authenticate. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeKeyId && revokeKey(revokeKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteKeyId} onOpenChange={() => setDeleteKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the API key and all its usage data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteKeyId && deleteKey(deleteKeyId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
