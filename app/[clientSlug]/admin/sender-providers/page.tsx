"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
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

type Mapping = {
  id: string
  selectorValue: string
  friendlyName: string
  notes: string | null
  createdAt: string
  updatedAt: string
}

export default function SenderProvidersPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const { toast } = useToast()

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [tableLoading, setTableLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Mapping | null>(null)
  const [selectorValue, setSelectorValue] = useState("")
  const [friendlyName, setFriendlyName] = useState("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Mapping | null>(null)
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (clientSlug !== "rip") {
          router.push(`/${clientSlug}/ci/campaigns`)
          return
        }
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

  const fetchMappings = async () => {
    try {
      setTableLoading(true)
      const res = await fetch("/api/admin/dkim-mappings")
      if (res.ok) setMappings(await res.json())
    } catch (error) {
      console.error("Error fetching DKIM mappings:", error)
      toast({ title: "Error", description: "Failed to fetch mappings", variant: "destructive" })
    } finally {
      setTableLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) fetchMappings()
  }, [isAuthorized])

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

  const openAddDialog = () => {
    setEditTarget(null)
    setSelectorValue("")
    setFriendlyName("")
    setNotes("")
    setDialogOpen(true)
  }

  const openEditDialog = (mapping: Mapping) => {
    setEditTarget(mapping)
    setSelectorValue(mapping.selectorValue)
    setFriendlyName(mapping.friendlyName)
    setNotes(mapping.notes ?? "")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!selectorValue.trim() || !friendlyName.trim()) {
      toast({ title: "Error", description: "Selector value and friendly name are required", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const url = editTarget
        ? `/api/admin/dkim-mappings/${editTarget.id}`
        : "/api/admin/dkim-mappings"
      const method = editTarget ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectorValue, friendlyName, notes }),
      })
      const data = await res.json()

      if (res.ok) {
        toast({ title: editTarget ? "Mapping updated" : "Mapping added", description: `${selectorValue} → ${friendlyName}` })
        setDialogOpen(false)
        fetchMappings()
      } else {
        toast({ title: "Error", description: data.error || "Failed to save mapping", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to save mapping", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(`/api/admin/dkim-mappings/${deleteTarget.id}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "Mapping deleted", description: `Removed ${deleteTarget.selectorValue}` })
        setDeleteTarget(null)
        fetchMappings()
      } else {
        toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete mapping", variant: "destructive" })
    }
  }

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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Sender Providers</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Map DKIM selector values (the <code className="text-xs bg-muted px-1 py-0.5 rounded">.s=</code> field) to friendly provider names shown on emails.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleBackfill} disabled={backfilling}>
                {backfilling ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                Backfill Providers
              </Button>
              <Button className="bg-rip-red hover:bg-rip-red/90 text-white" onClick={openAddDialog}>
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
                {tableLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex justify-center">
                        <Loader2 size={24} className="animate-spin text-rip-red" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : mappings.length > 0 ? (
                  mappings.map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell className="font-mono text-sm">{mapping.selectorValue}</TableCell>
                      <TableCell className="font-medium">{mapping.friendlyName}</TableCell>
                      <TableCell className="text-muted-foreground">{mapping.notes || "—"}</TableCell>
                      <TableCell>{new Date(mapping.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditDialog(mapping)}>
                            <Pencil size={15} className="text-muted-foreground" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(mapping)}>
                            <Trash2 size={15} className="text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      No mappings yet. Add one to start identifying email providers.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Mapping" : "Add Mapping"}</DialogTitle>
            <DialogDescription>
              The selector value comes from the <code className="text-xs bg-muted px-1 py-0.5 rounded">s=</code> field in the DKIM-Signature header of a raw email (e.g. <code className="text-xs bg-muted px-1 py-0.5 rounded">gears</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">s1</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">k1</code>).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="selector">Selector value *</Label>
              <Input
                id="selector"
                placeholder="e.g. gears, s1, k1"
                value={selectorValue}
                onChange={(e) => setSelectorValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="friendlyName">Provider name *</Label>
              <Input
                id="friendlyName"
                placeholder="e.g. Message Gears, SendGrid, Klaviyo"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Input
                id="notes"
                placeholder="Any internal notes about this provider"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-rip-red hover:bg-rip-red/90 text-white">
              {saving && <Loader2 size={14} className="mr-2 animate-spin" />}
              {editTarget ? "Save Changes" : "Add Mapping"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the mapping for <strong>{deleteTarget?.selectorValue}</strong>? Emails with this selector will no longer show a provider name.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  )
}
