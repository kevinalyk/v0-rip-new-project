"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import { Bot, Check, Copy, Key, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { CLIENT_MCP_TERMS_SECTIONS } from "@/lib/client-mcp-terms"

interface McpStatus {
  eligible: boolean
  reason: string | null
  plan: string
  termsAccepted: boolean
  termsVersion: string
  usage: { resultsUsed: number; resultsLimit: number }
  limits: { requestsPerMinute: number; maxPageSize: number; maxResultDepth: number }
}

interface McpKey {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  requestCount: number
  isActive: boolean
  revokedAt: string | null
  createdAt: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed")
  return res.json()
}

export function ClientMcpContent({ clientSlug }: { clientSlug: string }) {
  const { toast } = useToast()
  const qs = `clientSlug=${encodeURIComponent(clientSlug)}`
  const { data: status, mutate: refreshStatus, isLoading } = useSWR<McpStatus>(`/api/client-mcp/status?${qs}`, fetcher)
  const { data: keysData, mutate: refreshKeys } = useSWR<{ data: McpKey[] }>(
    status?.eligible && status.termsAccepted ? `/api/client-mcp/keys?${qs}` : null,
    fetcher,
  )

  const [origin, setOrigin] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => setOrigin(window.location.origin), [])

  const mcpUrl = `${origin}/api/mcp/client`

  const copy = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const post = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, clientSlug }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || "Request failed")
    return json
  }

  const acceptTerms = async () => {
    setAccepting(true)
    try {
      await post("/api/client-mcp/terms", { agree: true })
      await refreshStatus()
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAccepting(false)
    }
  }

  const createKey = async () => {
    setCreating(true)
    try {
      const json = await post("/api/client-mcp/keys", { name: keyName })
      setNewKey(json.key)
      setKeyName("")
      refreshKeys()
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const revokeKey = async (id: string) => {
    const res = await fetch(`/api/client-mcp/keys?${qs}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (res.ok) refreshKeys()
    else toast({ title: "Error", description: "Could not revoke key", variant: "destructive" })
  }

  const closeCreate = () => {
    setCreateOpen(false)
    setNewKey(null)
    setKeyName("")
  }

  if (isLoading || !status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const keys = keysData?.data ?? []
  const activeKeys = keys.filter((k) => k.isActive && !k.revokedAt)
  const usagePct = Math.min(100, Math.round((status.usage.resultsUsed / status.usage.resultsLimit) * 100))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6" /> MCP Access
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect your AI assistant to the competitive intelligence feed. Read-only access to emails, text messages and
          entities.
        </p>
      </div>

      {!status.eligible && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>MCP access is not available</AlertTitle>
          <AlertDescription>{status.reason}</AlertDescription>
        </Alert>
      )}

      {status.eligible && !status.termsAccepted && (
        <Card>
          <CardHeader>
            <CardTitle>Terms of Use</CardTitle>
            <CardDescription>You must accept these terms before creating a key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CLIENT_MCP_TERMS_SECTIONS.map((section) => (
              <div key={section.heading}>
                <h3 className="text-sm font-semibold">{section.heading}</h3>
                <p className="text-sm text-muted-foreground">{section.body}</p>
              </div>
            ))}
            <div className="flex items-start gap-2 pt-2">
              <Checkbox id="mcp-terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} />
              <Label htmlFor="mcp-terms" className="text-sm leading-snug">
                I have read and agree to the MCP Terms of Use on behalf of my organization, including that RIP data may
                not be scraped, stored, resold or redistributed.
              </Label>
            </div>
            <Button onClick={acceptTerms} disabled={!agreed || accepting}>
              {accepting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Accept and continue
            </Button>
          </CardContent>
        </Card>
      )}

      {status.eligible && status.termsAccepted && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Connect your assistant</CardTitle>
              <CardDescription>
                Add this as a remote MCP server (streamable HTTP) and send your key as a Bearer token.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 text-sm">{mcpUrl}</code>
                <Button variant="outline" size="icon" aria-label="Copy MCP URL" onClick={() => copy(mcpUrl, "url")}>
                  {copied === "url" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <code className="block rounded bg-muted px-3 py-2 text-sm">Authorization: Bearer rip_cm_...</code>
              <p className="text-xs text-muted-foreground">
                Tools: search_content, get_message, list_entities, get_entity, list_new_campaigns. Up to {status.limits.requestsPerMinute}{" "}
                requests per minute per key, {status.limits.maxPageSize} results per page, and{" "}
                {status.limits.maxResultDepth} results deep per query.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly usage</CardTitle>
              <CardDescription>Results returned over the last 30 days, across all keys.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${usagePct}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">
                {status.usage.resultsUsed.toLocaleString()} of {status.usage.resultsLimit.toLocaleString()} results
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>API keys</CardTitle>
                <CardDescription>{activeKeys.length} of 5 active keys used.</CardDescription>
              </div>
              <Button onClick={() => setCreateOpen(true)} disabled={activeKeys.length >= 5}>
                <Plus className="mr-2 h-4 w-4" /> New key
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {keys.length === 0 && <p className="text-sm text-muted-foreground">No keys yet.</p>}
              {keys.map((k) => (
                <div key={k.id} className="flex items-center justify-between rounded border p-3">
                  <div className="flex items-center gap-3">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {k.name}
                        {k.revokedAt || !k.isActive ? (
                          <Badge variant="secondary">Revoked</Badge>
                        ) : (
                          <Badge>Active</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {k.keyPrefix}... · {k.requestCount} requests ·{" "}
                        {k.lastUsedAt ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                      </div>
                    </div>
                  </div>
                  {k.isActive && !k.revokedAt && (
                    <Button variant="ghost" size="icon" aria-label={`Revoke ${k.name}`} onClick={() => revokeKey(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => (open ? setCreateOpen(true) : closeCreate())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newKey ? "Copy your key" : "Create MCP key"}</DialogTitle>
            <DialogDescription>
              {newKey ? "This is the only time the full key is shown." : "Give the key a name so you can recognize it later."}
            </DialogDescription>
          </DialogHeader>
          {newKey ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-muted px-3 py-2 text-sm">{newKey}</code>
              <Button variant="outline" size="icon" aria-label="Copy key" onClick={() => copy(newKey, "key")}>
                {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="mcp-key-name">Name</Label>
              <Input
                id="mcp-key-name"
                value={keyName}
                placeholder="e.g. Claude research"
                onChange={(e) => setKeyName(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            {newKey ? (
              <Button onClick={closeCreate}>Done</Button>
            ) : (
              <Button onClick={createKey} disabled={!keyName.trim() || creating}>
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
