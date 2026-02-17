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
import { Loader2, Plus, Trash2 } from "lucide-react"
import AppLayout from "@/components/app-layout"

export default function BlockedDomainsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  const [blockedDomains, setBlockedDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [reason, setReason] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; domain: string } | null>(null)

  // Authentication check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        // First check if clientSlug is 'rip'
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

  const fetchBlockedDomains = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/blocked-domains")
      if (response.ok) {
        const data = await response.json()
        setBlockedDomains(data)
      }
    } catch (error) {
      console.error("Error fetching blocked domains:", error)
      toast({
        title: "Error",
        description: "Failed to fetch blocked domains",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchBlockedDomains()
    }
  }, [isAuthorized])

  const handleAddDomain = async () => {
    if (!newDomain.trim()) {
      toast({
        title: "Error",
        description: "Please enter a domain",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/blocked-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain, reason }),
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Domain Blocked",
          description: `Blocked ${newDomain} and deleted ${data.deleted.domains} domains and ${data.deleted.campaigns} campaigns`,
        })
        setIsAddDialogOpen(false)
        setNewDomain("")
        setReason("")
        fetchBlockedDomains()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to block domain",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error blocking domain:", error)
      toast({
        title: "Error",
        description: "Failed to block domain",
        variant: "destructive",
      })
    }
  }

  const handleDeleteDomain = async (id: string) => {
    try {
      const response = await fetch(`/api/blocked-domains/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Blocked domain removed",
        })
        setDeleteConfirm(null)
        fetchBlockedDomains()
      } else {
        toast({
          title: "Error",
          description: "Failed to remove blocked domain",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting blocked domain:", error)
      toast({
        title: "Error",
        description: "Failed to remove blocked domain",
        variant: "destructive",
      })
    }
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Blocked Domains</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage domains that should be excluded from campaign detection and engagement
              </p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-rip-red hover:bg-rip-red/90 text-white">
                  <Plus size={16} className="mr-2" />
                  Block Domain
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Block Domain</DialogTitle>
                  <DialogDescription>
                    Add a domain to block from campaign detection. This will also delete all existing domains and
                    campaigns matching this domain.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="domain">Domain *</Label>
                    <Input
                      id="domain"
                      placeholder="e.g., gmail.com, microsoft.com"
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="reason">Reason (optional)</Label>
                    <Input
                      id="reason"
                      placeholder="e.g., System emails, Security notifications"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddDomain} className="bg-rip-red hover:bg-rip-red/90 text-white">
                    Block Domain
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Blocked On</TableHead>
                  <TableHead className="w-[100px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-12">
                      <div className="flex justify-center">
                        <Loader2 size={24} className="animate-spin text-rip-red" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : blockedDomains.length > 0 ? (
                  blockedDomains.map((domain) => (
                    <TableRow key={domain.id}>
                      <TableCell className="font-medium">{domain.domain}</TableCell>
                      <TableCell>{domain.reason || "-"}</TableCell>
                      <TableCell>{new Date(domain.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <AlertDialog
                          open={deleteConfirm?.id === domain.id}
                          onOpenChange={(open) => !open && setDeleteConfirm(null)}
                        >
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirm({ id: domain.id, domain: domain.domain })}
                            >
                              <Trash2 size={16} className="text-red-500" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Blocked Domain</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to unblock {deleteConfirm?.domain}? This will allow new campaigns
                                from this domain to be detected.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteDomain(domain.id)}
                                className="bg-red-500 hover:bg-red-600"
                              >
                                Remove
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
                      No blocked domains yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
