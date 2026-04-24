"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Pencil, Trash2, RefreshCw } from "lucide-react"
import AppLayout from "@/components/app-layout"

// ── Types ──────────────────────────────────────────────────────────────────

type DkimMapping = {
  id: string
  selectorValue: string
  friendlyName: string
  notes: string | null
  createdAt: string
}

type UnsubMapping = {
  id: string
  domain: string
  friendlyName: string | null
  notes: string | null
  createdAt: string
}

type IpMapping = {
  id: string
  ip: string
  cidr: string | null
  orgName: string | null
  friendlyName: string | null
  reverseDns: string | null
  rdapChecked: boolean
  lastLookedUpAt: string | null
  notes: string | null
  createdAt: string
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function SenderProvidersPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  // ── DKIM state ────────────────────────────────────────────────────────
  const [dkimMappings, setDkimMappings] = useState<DkimMapping[]>([])
  const [dkimTableLoading, setDkimTableLoading] = useState(true)
  const [dkimDialogOpen, setDkimDialogOpen] = useState(false)
  const [dkimEditTarget, setDkimEditTarget] = useState<DkimMapping | null>(null)
  const [dkimSelectorValue, setDkimSelectorValue] = useState("")
  const [dkimFriendlyName, setDkimFriendlyName] = useState("")
  const [dkimNotes, setDkimNotes] = useState("")
  const [dkimSaving, setDkimSaving] = useState(false)
  const [dkimDeleteTarget, setDkimDeleteTarget] = useState<DkimMapping | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  // ── Unsub Domain state ────────────────────────────────────────────────
  const [unsubMappings, setUnsubMappings] = useState<UnsubMapping[]>([])
  const [unsubTableLoading, setUnsubTableLoading] = useState(true)
  const [unsubDialogOpen, setUnsubDialogOpen] = useState(false)
  const [unsubEditTarget, setUnsubEditTarget] = useState<UnsubMapping | null>(null)
  const [unsubDomain, setUnsubDomain] = useState("")
  const [unsubFriendlyName, setUnsubFriendlyName] = useState("")
  const [unsubNotes, setUnsubNotes] = useState("")
  const [unsubSaving, setUnsubSaving] = useState(false)
  const [unsubDeleteTarget, setUnsubDeleteTarget] = useState<UnsubMapping | null>(null)

  // ── IP state ──────────────────────────────────────────────────────────
  const [ipMappings, setIpMappings] = useState<IpMapping[]>([])
  const [ipTableLoading, setIpTableLoading] = useState(true)
  const [ipDialogOpen, setIpDialogOpen] = useState(false)
  const [ipEditTarget, setIpEditTarget] = useState<IpMapping | null>(null)
  const [ipAddress, setIpAddress] = useState("")
  const [ipFriendlyName, setIpFriendlyName] = useState("")
  const [ipOrgName, setIpOrgName] = useState("")
  const [ipCidr, setIpCidr] = useState("")
  const [ipReverseDns, setIpReverseDns] = useState("")
  const [ipNotes, setIpNotes] = useState("")
  const [ipSaving, setIpSaving] = useState(false)
  const [ipDeleteTarget, setIpDeleteTarget] = useState<IpMapping | null>(null)
  const [reResolving, setReResolving] = useState(false)

  // ── Auth check ────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (clientSlug !== "rip") { router.push(`/${clientSlug}/ci/campaigns`); return }
        const response = await fetch("/api/auth/me")
        if (!response.ok) { router.push("/login"); return }
        const user = await response.json()
        if (user.role !== "super_admin") { router.push(`/${user.clientSlug}`); return }
        setIsAuthorized(true)
      } catch {
        router.push("/login")
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [router, clientSlug])

  // ── Fetch functions ───────────────────────────────────────────────────
  const fetchDkimMappings = async () => {
    try {
      setDkimTableLoading(true)
      const res = await fetch("/api/admin/dkim-mappings")
      if (res.ok) setDkimMappings(await res.json())
    } catch {
      toast({ title: "Error", description: "Failed to fetch DKIM mappings", variant: "destructive" })
    } finally {
      setDkimTableLoading(false)
    }
  }

  const fetchIpMappings = async () => {
    try {
      setIpTableLoading(true)
      const res = await fetch("/api/admin/ip-sender-mappings")
      if (res.ok) setIpMappings(await res.json())
    } catch {
      toast({ title: "Error", description: "Failed to fetch IP mappings", variant: "destructive" })
    } finally {
      setIpTableLoading(false)
    }
  }

  const fetchUnsubMappings = async () => {
    try {
      setUnsubTableLoading(true)
      const res = await fetch("/api/admin/unsub-domain-mappings")
      if (res.ok) setUnsubMappings(await res.json())
    } catch {
      toast({ title: "Error", description: "Failed to fetch unsub domain mappings", variant: "destructive" })
    } finally {
      setUnsubTableLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchDkimMappings()
      fetchIpMappings()
      fetchUnsubMappings()
    }
  }, [isAuthorized])

  // ── DKIM handlers ─────────────────────────────────────────────────────
  const handleBackfill = async () => {
    setBackfilling(true)
    try {
      const res = await fetch("/api/admin/dkim-mappings/backfill", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        toast({ title: "Backfill complete", description: data.message })
      } else {
        toast({ title: "Backfill failed", description: data.error || "Something went wrong", variant: "destructive" })
      }
    } catch {
      toast({ title: "Backfill failed", description: "Something went wrong", variant: "destructive" })
    } finally {
      setBackfilling(false)
    }
  }

  const openDkimAddDialog = () => {
    setDkimEditTarget(null)
    setDkimSelectorValue("")
    setDkimFriendlyName("")
    setDkimNotes("")
    setDkimDialogOpen(true)
  }

  const openDkimEditDialog = (m: DkimMapping) => {
    setDkimEditTarget(m)
    setDkimSelectorValue(m.selectorValue)
    setDkimFriendlyName(m.friendlyName)
    setDkimNotes(m.notes ?? "")
    setDkimDialogOpen(true)
  }

  const handleDkimSave = async () => {
    if (!dkimSelectorValue.trim() || !dkimFriendlyName.trim()) {
      toast({ title: "Error", description: "Selector value and provider name are required", variant: "destructive" })
      return
    }
    setDkimSaving(true)
    try {
      const url = dkimEditTarget ? `/api/admin/dkim-mappings/${dkimEditTarget.id}` : "/api/admin/dkim-mappings"
      const method = dkimEditTarget ? "PATCH" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectorValue: dkimSelectorValue, friendlyName: dkimFriendlyName, notes: dkimNotes }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: dkimEditTarget ? "Mapping updated" : "Mapping added", description: `${dkimSelectorValue} → ${dkimFriendlyName}` })
        setDkimDialogOpen(false)
        fetchDkimMappings()
      } else {
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save mapping", variant: "destructive" })
    } finally {
      setDkimSaving(false)
    }
  }

  const handleDkimDelete = async () => {
    if (!dkimDeleteTarget) return
    try {
      const res = await fetch(`/api/admin/dkim-mappings/${dkimDeleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Mapping deleted", description: `Removed ${dkimDeleteTarget.selectorValue}` })
        setDkimDeleteTarget(null)
        fetchDkimMappings()
      } else {
        toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
    }
  }

  // ── IP handlers ───────────────────────────────────────────────────────
  const openIpAddDialog = () => {
    setIpEditTarget(null)
    setIpAddress("")
    setIpFriendlyName("")
    setIpOrgName("")
    setIpCidr("")
    setIpReverseDns("")
    setIpNotes("")
    setIpDialogOpen(true)
  }

  const openIpEditDialog = (m: IpMapping) => {
    setIpEditTarget(m)
    setIpAddress(m.ip)
    setIpFriendlyName(m.friendlyName ?? "")
    setIpOrgName(m.orgName ?? "")
    setIpCidr(m.cidr ?? "")
    setIpReverseDns(m.reverseDns ?? "")
    setIpNotes(m.notes ?? "")
    setIpDialogOpen(true)
  }

  const handleIpSave = async () => {
    if (!ipAddress.trim()) {
      toast({ title: "Error", description: "IP address is required", variant: "destructive" })
      return
    }
    setIpSaving(true)
    try {
      const url = ipEditTarget ? `/api/admin/ip-sender-mappings/${ipEditTarget.id}` : "/api/admin/ip-sender-mappings"
      const method = ipEditTarget ? "PATCH" : "POST"
      const body = ipEditTarget
        ? { friendlyName: ipFriendlyName, orgName: ipOrgName, cidr: ipCidr, reverseDns: ipReverseDns, notes: ipNotes }
        : { ip: ipAddress, friendlyName: ipFriendlyName, orgName: ipOrgName, cidr: ipCidr, reverseDns: ipReverseDns, notes: ipNotes }
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        toast({ title: ipEditTarget ? "Mapping updated" : "Mapping added", description: `${ipAddress} saved` })
        setIpDialogOpen(false)
        fetchIpMappings()
      } else {
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save mapping", variant: "destructive" })
    } finally {
      setIpSaving(false)
    }
  }

  const handleReResolve = async () => {
    setReResolving(true)
    try {
      const res = await fetch("/api/admin/ip-sender-mappings/re-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      })
      const data = await res.json()
      if (res.ok) {
        toast({
          title: "Full reset complete",
          description: data.message,
        })
        fetchIpMappings()
      } else {
        toast({ title: "Reset failed", description: data.error || "Something went wrong", variant: "destructive" })
      }
    } catch {
      toast({ title: "Reset failed", description: "Something went wrong", variant: "destructive" })
    } finally {
      setReResolving(false)
    }
  }

  const handleIpDelete = async () => {
    if (!ipDeleteTarget) return
    try {
      const res = await fetch(`/api/admin/ip-sender-mappings/${ipDeleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Mapping deleted", description: `Removed ${ipDeleteTarget.ip}` })
        setIpDeleteTarget(null)
        fetchIpMappings()
      } else {
        toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
    }
  }

  // ── Unsub Domain handlers ─────────────────────────────────────────────
  const openUnsubAddDialog = () => {
    setUnsubEditTarget(null)
    setUnsubDomain("")
    setUnsubFriendlyName("")
    setUnsubNotes("")
    setUnsubDialogOpen(true)
  }

  const openUnsubEditDialog = (m: UnsubMapping) => {
    setUnsubEditTarget(m)
    setUnsubDomain(m.domain)
    setUnsubFriendlyName(m.friendlyName ?? "")
    setUnsubNotes(m.notes ?? "")
    setUnsubDialogOpen(true)
  }

  const handleUnsubSave = async () => {
    if (!unsubEditTarget && !unsubDomain.trim()) {
      toast({ title: "Error", description: "Domain is required", variant: "destructive" })
      return
    }
    setUnsubSaving(true)
    try {
      const url = unsubEditTarget ? `/api/admin/unsub-domain-mappings/${unsubEditTarget.id}` : "/api/admin/unsub-domain-mappings"
      const method = unsubEditTarget ? "PATCH" : "POST"
      const body = unsubEditTarget
        ? { friendlyName: unsubFriendlyName, notes: unsubNotes }
        : { domain: unsubDomain, friendlyName: unsubFriendlyName, notes: unsubNotes }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()
      if (res.ok) {
        toast({ title: unsubEditTarget ? "Mapping updated" : "Mapping added", description: `${unsubEditTarget?.domain ?? unsubDomain} saved` })
        setUnsubDialogOpen(false)
        fetchUnsubMappings()
      } else {
        toast({ title: "Error", description: data.error || "Failed to save", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save mapping", variant: "destructive" })
    } finally {
      setUnsubSaving(false)
    }
  }

  const handleUnsubDelete = async () => {
    if (!unsubDeleteTarget) return
    try {
      const res = await fetch(`/api/admin/unsub-domain-mappings/${unsubDeleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Mapping deleted", description: `Removed ${unsubDeleteTarget.domain}` })
        setUnsubDeleteTarget(null)
        fetchUnsubMappings()
      } else {
        toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rip-red" />
      </div>
    )
  }

  if (!isAuthorized) return null

  return (
    <AppLayout clientSlug="admin" isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Sender Providers</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Map sending IPs and DKIM selectors to friendly provider names shown on emails.
            </p>
          </div>

          <Tabs defaultValue="ip">
            <TabsList>
              <TabsTrigger value="ip">IP Mappings</TabsTrigger>
              <TabsTrigger value="dkim">DKIM Selectors</TabsTrigger>
              <TabsTrigger value="unsub">Unsub Domains</TabsTrigger>
            </TabsList>

            {/* ── IP Tab ──────────────────────────────────────────────── */}
            <TabsContent value="ip" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Map sending IPs (auto-resolved by the hourly cron via ARIN RDAP) to friendly provider names.
                  IPs already discovered automatically appear here — manually add any you need to override or pre-populate.
                </p>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button variant="outline" onClick={handleReResolve} disabled={reResolving}>
                    {reResolving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                    {reResolving ? "Resetting..." : "Full Reset & Backfill All"}
                  </Button>
                  <Button className="bg-rip-red hover:bg-rip-red/90 text-white" onClick={openIpAddDialog}>
                    <Plus size={16} className="mr-2" />
                    Add IP Mapping
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Friendly Name</TableHead>
                      <TableHead>Org Name (RDAP)</TableHead>
                      <TableHead>CIDR</TableHead>
                      <TableHead>Reverse DNS</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ipTableLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex justify-center">
                            <Loader2 size={24} className="animate-spin text-rip-red" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : ipMappings.length > 0 ? (
                      ipMappings.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-sm">{m.ip}</TableCell>
                          <TableCell className="font-medium">{m.friendlyName || <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.orgName || "—"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{m.cidr || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{m.reverseDns || "—"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{m.notes || "—"}</TableCell>
                          <TableCell className="text-sm">{new Date(m.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openIpEditDialog(m)}>
                                <Pencil size={15} className="text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setIpDeleteTarget(m)}>
                                <Trash2 size={15} className="text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                          No IP mappings yet. The hourly cron will auto-populate these as emails come in.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── DKIM Tab ─────────────────────────────────────────────── */}
            <TabsContent value="dkim" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Map DKIM <code className="text-xs bg-muted px-1 py-0.5 rounded">.s=</code> selector values to friendly provider names.
                </p>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button variant="outline" onClick={handleBackfill} disabled={backfilling}>
                    {backfilling ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                    Backfill Providers
                  </Button>
                  <Button className="bg-rip-red hover:bg-rip-red/90 text-white" onClick={openDkimAddDialog}>
                    <Plus size={16} className="mr-2" />
                    Add Mapping
                  </Button>
                </div>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Selector (.s= value)</TableHead>
                      <TableHead>Provider Name</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dkimTableLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex justify-center">
                            <Loader2 size={24} className="animate-spin text-rip-red" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : dkimMappings.length > 0 ? (
                      dkimMappings.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-sm">{m.selectorValue}</TableCell>
                          <TableCell className="font-medium">{m.friendlyName}</TableCell>
                          <TableCell className="text-muted-foreground">{m.notes || "—"}</TableCell>
                          <TableCell>{new Date(m.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openDkimEditDialog(m)}>
                                <Pencil size={15} className="text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setDkimDeleteTarget(m)}>
                                <Trash2 size={15} className="text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          No DKIM mappings yet. Add one to start identifying email providers.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Unsub Domains Tab ──────────────────────────────────────── */}
            <TabsContent value="unsub" className="space-y-4 mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Unsub domains are auto-collected from{" "}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">List-Unsubscribe</code> headers.
                  Assign a provider name to use them for Tier 2 resolution.
                </p>
                <Button className="bg-rip-red hover:bg-rip-red/90 text-white shrink-0 ml-4" onClick={openUnsubAddDialog}>
                  <Plus size={16} className="mr-2" />
                  Add Mapping
                </Button>
              </div>

              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Provider Name</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>First Seen</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unsubTableLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex justify-center">
                            <Loader2 size={24} className="animate-spin text-rip-red" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : unsubMappings.length > 0 ? (
                      unsubMappings.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-sm">{m.domain}</TableCell>
                          <TableCell className="font-medium">
                            {m.friendlyName ?? <span className="text-muted-foreground italic">Unassigned</span>}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{m.notes || "—"}</TableCell>
                          <TableCell className="text-sm">{new Date(m.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openUnsubEditDialog(m)}>
                                <Pencil size={15} className="text-muted-foreground" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setUnsubDeleteTarget(m)}>
                                <Trash2 size={15} className="text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          No unsub domains collected yet. They will appear here automatically as emails are processed.
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

      {/* ── IP Add/Edit Dialog ─────────────────────────────────────────── */}
      <Dialog open={ipDialogOpen} onOpenChange={setIpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ipEditTarget ? "Edit IP Mapping" : "Add IP Mapping"}</DialogTitle>
            <DialogDescription>
              Manually add or override a sending IP. The hourly cron auto-populates org names via ARIN RDAP — use the friendly name to override generic entries like &quot;Amazon.com, Inc.&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ip">IP Address *</Label>
              <Input
                id="ip"
                placeholder="e.g. 63.143.59.236"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                disabled={!!ipEditTarget}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ipFriendlyName">Friendly Name <span className="text-muted-foreground text-xs">(override)</span></Label>
              <Input
                id="ipFriendlyName"
                placeholder="e.g. MessageGears, Acoustic, Sailthru"
                value={ipFriendlyName}
                onChange={(e) => setIpFriendlyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ipOrgName">Org Name <span className="text-muted-foreground text-xs">(from RDAP)</span></Label>
              <Input
                id="ipOrgName"
                placeholder="e.g. MessageGears, LLC"
                value={ipOrgName}
                onChange={(e) => setIpOrgName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ipCidr">CIDR Block</Label>
                <Input
                  id="ipCidr"
                  placeholder="e.g. 63.143.59.128/25"
                  value={ipCidr}
                  onChange={(e) => setIpCidr(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ipReverseDns">Reverse DNS (PTR)</Label>
                <Input
                  id="ipReverseDns"
                  placeholder="e.g. mail.messagegears.net"
                  value={ipReverseDns}
                  onChange={(e) => setIpReverseDns(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ipNotes">Notes</Label>
              <Input
                id="ipNotes"
                placeholder="Any internal notes"
                value={ipNotes}
                onChange={(e) => setIpNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIpDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleIpSave} disabled={ipSaving} className="bg-rip-red hover:bg-rip-red/90 text-white">
              {ipSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {ipEditTarget ? "Save Changes" : "Add Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── DKIM Add/Edit Dialog ───────────────────────────────────────── */}
      <Dialog open={dkimDialogOpen} onOpenChange={setDkimDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dkimEditTarget ? "Edit DKIM Mapping" : "Add DKIM Mapping"}</DialogTitle>
            <DialogDescription>
              The selector value comes from the <code className="text-xs bg-muted px-1 py-0.5 rounded">s=</code> field in the DKIM-Signature header (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">gears</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">s1</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">k1</code>).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="dkimSelector">Selector value *</Label>
              <Input
                id="dkimSelector"
                placeholder="e.g. gears, s1, k1"
                value={dkimSelectorValue}
                onChange={(e) => setDkimSelectorValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dkimFriendlyName">Provider name *</Label>
              <Input
                id="dkimFriendlyName"
                placeholder="e.g. Message Gears, SendGrid, Klaviyo"
                value={dkimFriendlyName}
                onChange={(e) => setDkimFriendlyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="dkimNotes">Notes (optional)</Label>
              <Input
                id="dkimNotes"
                placeholder="Any internal notes about this provider"
                value={dkimNotes}
                onChange={(e) => setDkimNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDkimDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleDkimSave} disabled={dkimSaving} className="bg-rip-red hover:bg-rip-red/90 text-white">
              {dkimSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {dkimEditTarget ? "Save Changes" : "Add Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── IP Delete Confirmation ─────────────────────────────────────── */}
      <AlertDialog open={!!ipDeleteTarget} onOpenChange={(open) => !open && setIpDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete IP Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for <strong>{ipDeleteTarget?.ip}</strong>? The cron will re-create it automatically on the next run if emails from this IP are still coming in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleIpDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── DKIM Delete Confirmation ───────────────────────────────────── */}
      <AlertDialog open={!!dkimDeleteTarget} onOpenChange={(open) => !open && setDkimDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DKIM Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for <strong>{dkimDeleteTarget?.selectorValue}</strong>? Emails with this selector will no longer show a provider name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDkimDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* ── Unsub Add/Edit Dialog ──────────────────────────────────────── */}
      <Dialog open={unsubDialogOpen} onOpenChange={setUnsubDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{unsubEditTarget ? "Edit Unsub Domain Mapping" : "Add Unsub Domain Mapping"}</DialogTitle>
            <DialogDescription>
              {unsubEditTarget
                ? "Assign or update the provider name for this unsub domain."
                : "Manually add an unsub domain. Domains are also auto-collected by the cron from List-Unsubscribe headers."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="unsubDomain">Domain *</Label>
              <Input
                id="unsubDomain"
                placeholder="e.g. nucleusemail.com"
                value={unsubDomain}
                onChange={(e) => setUnsubDomain(e.target.value)}
                disabled={!!unsubEditTarget}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unsubFriendlyName">Provider Name</Label>
              <Input
                id="unsubFriendlyName"
                placeholder="e.g. Nucleus, Sailthru, Klaviyo"
                value={unsubFriendlyName}
                onChange={(e) => setUnsubFriendlyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unsubNotes">Notes (optional)</Label>
              <Input
                id="unsubNotes"
                placeholder="Any internal notes"
                value={unsubNotes}
                onChange={(e) => setUnsubNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnsubDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleUnsubSave} disabled={unsubSaving} className="bg-rip-red hover:bg-rip-red/90 text-white">
              {unsubSaving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {unsubEditTarget ? "Save Changes" : "Add Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Unsub Delete Confirmation ──────────────────────────────────── */}
      <AlertDialog open={!!unsubDeleteTarget} onOpenChange={(open) => !open && setUnsubDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Unsub Domain Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for <strong>{unsubDeleteTarget?.domain}</strong>?
              The domain will be re-collected automatically on the next cron run if emails with this unsub URL come in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnsubDelete} className="bg-red-500 hover:bg-red-600">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  )
}
