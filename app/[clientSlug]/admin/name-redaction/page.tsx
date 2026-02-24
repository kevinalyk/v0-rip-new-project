"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Plus, Trash2, ShieldAlert, Search, Play } from "lucide-react"
import AppLayout from "@/components/app-layout"

interface RedactedName {
  id: string
  name: string
  addedBy: string | null
  createdAt: string
}

interface PreviewStats {
  emailCampaigns: { total: number; affected: number; instances: number }
  smsMessages: { total: number; affected: number; instances: number }
}

interface RedactionResults {
  success: boolean
  emailCampaigns: { processed: number; modified: number; instances: number }
  smsMessages: { processed: number; modified: number; instances: number }
}

export default function NameRedactionPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [redactedNames, setRedactedNames] = useState<RedactedName[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  // Batch redaction state
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null)
  const [isRedacting, setIsRedacting] = useState(false)
  const [redactionResults, setRedactionResults] = useState<RedactionResults | null>(null)
  const [showConfirmRedact, setShowConfirmRedact] = useState(false)

  // Authentication check
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
          router.push(`/${user.clientSlug}`)
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

  const fetchRedactedNames = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/redacted-names")
      if (response.ok) {
        const data = await response.json()
        setRedactedNames(data)
      }
    } catch (error) {
      console.error("Error fetching redacted names:", error)
      toast.error("Failed to fetch redacted names")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchRedactedNames()
    }
  }, [isAuthorized])

  const handleAddName = async () => {
    if (!newName.trim()) {
      toast.error("Please enter a name")
      return
    }

    setIsAdding(true)
    try {
      const response = await fetch("/api/admin/redacted-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(`Added "${newName.trim()}" to redaction list`)
        setIsAddDialogOpen(false)
        setNewName("")
        fetchRedactedNames()
        // Reset preview stats since they're now stale
        setPreviewStats(null)
        setRedactionResults(null)
      } else {
        toast.error(data.error || "Failed to add name")
      }
    } catch (error) {
      console.error("Error adding name:", error)
      toast.error("Failed to add name")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDeleteName = async (id: string) => {
    setIsDeleting(true)
    try {
      const response = await fetch(`/api/admin/redacted-names/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Name removed from redaction list")
        setDeleteConfirm(null)
        fetchRedactedNames()
        setPreviewStats(null)
        setRedactionResults(null)
      } else {
        toast.error("Failed to remove name")
      }
    } catch (error) {
      console.error("Error deleting name:", error)
      toast.error("Failed to remove name")
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePreview = async () => {
    if (redactedNames.length === 0) {
      toast.error("Add at least one name to the redaction list first")
      return
    }

    setIsPreviewing(true)
    setPreviewStats(null)
    setRedactionResults(null)
    try {
      const response = await fetch("/api/admin/redacted-names/batch-redact", {
        method: "POST",
      })

      if (response.ok) {
        const stats = await response.json()
        setPreviewStats(stats)
      } else {
        toast.error("Failed to preview redaction")
      }
    } catch (error) {
      console.error("Error previewing redaction:", error)
      toast.error("Failed to preview redaction")
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleExecuteRedaction = async () => {
    setIsRedacting(true)
    setShowConfirmRedact(false)
    try {
      const response = await fetch("/api/admin/redacted-names/batch-redact", {
        method: "PUT",
      })

      if (response.ok) {
        const results = await response.json()
        setRedactionResults(results)
        setPreviewStats(null)
        toast.success(
          `Redaction complete: ${results.emailCampaigns.modified} emails and ${results.smsMessages.modified} SMS messages modified`,
        )
      } else {
        toast.error("Failed to execute redaction")
      }
    } catch (error) {
      console.error("Error executing redaction:", error)
      toast.error("Failed to execute redaction")
    } finally {
      setIsRedacting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-destructive" />
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <AppLayout clientSlug="admin" isAdminView={true}>
      <div className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Name Redaction</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Protect seed identities by redacting names from email and SMS content. Names are permanently replaced
                with [Omitted].
              </p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-destructive hover:bg-destructive/90 text-white">
                  <Plus size={16} className="mr-2" />
                  Add Name
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Name to Redaction List</DialogTitle>
                  <DialogDescription>
                    This name will be replaced with [Omitted] in all future emails and SMS messages. Use the batch scan
                    to apply to existing content. Matching is case-sensitive and whole-word only.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="name">Name / Term *</Label>
                    <Input
                      id="name"
                      placeholder="e.g., Isaac, Red, Wolfgang, Sal"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddName()
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Case-sensitive. &quot;Red&quot; will match &quot;Red&quot; but not &quot;red&quot; or
                      &quot;Reduced&quot;.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddName}
                    disabled={isAdding}
                    className="bg-destructive hover:bg-destructive/90 text-white"
                  >
                    {isAdding ? <Loader2 size={16} className="mr-2 animate-spin" /> : null}
                    Add Name
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Redacted Names Table */}
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Term</TableHead>
                  <TableHead>Added By</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12">
                      <div className="flex justify-center">
                        <Loader2 size={24} className="animate-spin text-destructive" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : redactedNames.length > 0 ? (
                  redactedNames.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground">{item.addedBy || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog
                          open={deleteConfirm?.id === item.id}
                          onOpenChange={(open) => !open && setDeleteConfirm(null)}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                            >
                              <Trash2 size={16} className="text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove from Redaction List</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to remove &quot;{deleteConfirm?.name}&quot;? This will stop
                                redacting this name in future content, but already redacted content will remain as
                                [Omitted].
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteName(item.id)}
                                disabled={isDeleting}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                {isDeleting ? "Removing..." : "Remove"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                      No names in redaction list. Add names above to start protecting seed identities.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Batch Redaction Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert size={20} />
                Batch Redaction Scanner
              </CardTitle>
              <CardDescription>
                Scan all existing emails and SMS messages for names in the redaction list. Preview first to see how many
                records would be affected, then execute to permanently redact.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button
                  onClick={handlePreview}
                  disabled={isPreviewing || isRedacting || redactedNames.length === 0}
                  variant="outline"
                >
                  {isPreviewing ? (
                    <Loader2 size={16} className="mr-2 animate-spin" />
                  ) : (
                    <Search size={16} className="mr-2" />
                  )}
                  {isPreviewing ? "Scanning..." : "Preview Scan"}
                </Button>

                {previewStats && (previewStats.emailCampaigns.affected > 0 || previewStats.smsMessages.affected > 0) && (
                  <AlertDialog open={showConfirmRedact} onOpenChange={setShowConfirmRedact}>
                    <AlertDialogTrigger asChild>
                      <Button className="bg-destructive hover:bg-destructive/90 text-white" disabled={isRedacting}>
                        {isRedacting ? (
                          <Loader2 size={16} className="mr-2 animate-spin" />
                        ) : (
                          <Play size={16} className="mr-2" />
                        )}
                        {isRedacting ? "Redacting..." : "Execute Redaction"}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Batch Redaction</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action is irreversible. It will permanently replace{" "}
                          {previewStats.emailCampaigns.instances + previewStats.smsMessages.instances} name instances
                          across {previewStats.emailCampaigns.affected + previewStats.smsMessages.affected} records with
                          [Omitted]. Are you sure?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleExecuteRedaction}
                          className="bg-destructive hover:bg-destructive/90"
                        >
                          Yes, Redact All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>

              {/* Preview Results */}
              {previewStats && (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-muted-foreground">Email Campaigns</div>
                      <div className="text-2xl font-bold">{previewStats.emailCampaigns.affected}</div>
                      <div className="text-xs text-muted-foreground">
                        records affected ({previewStats.emailCampaigns.instances} instances) out of{" "}
                        {previewStats.emailCampaigns.total} total
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-sm text-muted-foreground">SMS Messages</div>
                      <div className="text-2xl font-bold">{previewStats.smsMessages.affected}</div>
                      <div className="text-xs text-muted-foreground">
                        records affected ({previewStats.smsMessages.instances} instances) out of{" "}
                        {previewStats.smsMessages.total} total
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Execution Results */}
              {redactionResults && (
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-green-500/50">
                    <CardContent className="pt-6">
                      <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                        Emails Redacted
                      </div>
                      <div className="text-2xl font-bold">{redactionResults.emailCampaigns.modified}</div>
                      <div className="text-xs text-muted-foreground">
                        {redactionResults.emailCampaigns.instances} instances replaced across{" "}
                        {redactionResults.emailCampaigns.processed} processed
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-green-500/50">
                    <CardContent className="pt-6">
                      <div className="text-sm text-green-600 dark:text-green-400 font-medium">
                        SMS Redacted
                      </div>
                      <div className="text-2xl font-bold">{redactionResults.smsMessages.modified}</div>
                      <div className="text-xs text-muted-foreground">
                        {redactionResults.smsMessages.instances} instances replaced across{" "}
                        {redactionResults.smsMessages.processed} processed
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
