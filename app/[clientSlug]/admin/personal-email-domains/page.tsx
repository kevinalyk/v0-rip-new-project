"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, Globe } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

interface PersonalEmailDomain {
  id: string
  domain: string
  useSlug: boolean
  createdAt: string
  addedBy: string | null
  client: { id: string; name: string; slug: string }
}

interface Client {
  id: string
  name: string
  slug: string
}

export default function PersonalEmailDomainsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [domains, setDomains] = useState<PersonalEmailDomain[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)

  // Add form state
  const [newDomain, setNewDomain] = useState("")
  const [newClientId, setNewClientId] = useState("")
  const [newUseSlug, setNewUseSlug] = useState(true)
  const [isAdding, setIsAdding] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; domain: string } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Auth check
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

  const fetchDomains = async () => {
    setLoadingDomains(true)
    try {
      const [domainsRes, clientsRes] = await Promise.all([
        fetch("/api/admin/personal-email-domains", { credentials: "include" }),
        fetch("/api/clients", { credentials: "include" }),
      ])
      if (domainsRes.ok) {
        const data = await domainsRes.json()
        setDomains(data.domains)
      }
      if (clientsRes.ok) {
        const data = await clientsRes.json()
        setClients(data.clients ?? data)
      }
    } catch {
      toast.error("Failed to load domains")
    } finally {
      setLoadingDomains(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) fetchDomains()
  }, [isAuthorized])

  const handleAdd = async () => {
    if (!newDomain.trim() || !newClientId) {
      toast.error("Please enter a domain and select a client")
      return
    }
    setIsAdding(true)
    try {
      const res = await fetch("/api/admin/personal-email-domains", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim(), clientId: newClientId, useSlug: newUseSlug }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Domain "${data.domain.domain}" added`)
        setNewDomain("")
        setNewClientId("")
        setNewUseSlug(true)
        fetchDomains()
      } else {
        toast.error(data.error || "Failed to add domain")
      }
    } catch {
      toast.error("Failed to add domain")
    } finally {
      setIsAdding(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/admin/personal-email-domains?id=${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success(`Domain "${deleteTarget.domain}" removed`)
        setDeleteTarget(null)
        fetchDomains()
      } else {
        toast.error("Failed to remove domain")
      }
    } catch {
      toast.error("Failed to remove domain")
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-destructive" />
      </div>
    )
  }

  if (!isAuthorized) return null

  return (
    <AppLayout clientSlug="admin" isAdminView={true}>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Personal Email Domains</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage domains used for personal CI email addresses. Emails sent to{" "}
              <code className="text-xs bg-muted px-1 py-0.5 rounded">slug@domain.com</code> are attributed to the
              matching client.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Domains</div>
              <div className="text-3xl font-bold">{domains.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Slug-based</div>
              <div className="text-3xl font-bold">{domains.filter((d) => d.useSlug).length}</div>
              <div className="text-xs text-muted-foreground mt-1">All clients share domain, matched by slug</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Client-specific</div>
              <div className="text-3xl font-bold">{domains.filter((d) => !d.useSlug).length}</div>
              <div className="text-xs text-muted-foreground mt-1">Entire domain assigned to one client</div>
            </CardContent>
          </Card>
        </div>

        {/* Domains table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe size={18} />
              Assigned Domains
            </CardTitle>
            <CardDescription>
              Each domain can either use slug-based matching (e.g.{" "}
              <code className="text-xs bg-muted px-1 rounded">rip@realdailyreview.com</code> → client with slug "rip")
              or be assigned directly to one client.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Match Mode</TableHead>
                  <TableHead>Example Address</TableHead>
                  <TableHead>Added By</TableHead>
                  <TableHead>Date Added</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingDomains ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="flex justify-center">
                        <Loader2 size={24} className="animate-spin text-destructive" />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : domains.length > 0 ? (
                  domains.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono font-medium">{d.domain}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{d.client.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{d.client.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {d.useSlug ? (
                          <Badge variant="secondary">Match by slug</Badge>
                        ) : (
                          <Badge variant="outline">Single client</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm font-mono">
                        {d.useSlug ? `{slug}@${d.domain}` : `*@${d.domain}`}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">{d.addedBy || "-"}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(d.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ id: d.id, domain: d.domain })}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No domains configured yet. Add one below.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Add domain */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus size={18} />
              Add Domain
            </CardTitle>
            <CardDescription>
              Register a new domain for personal CI email addresses.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-3">
              <Input
                placeholder="e.g. realdailyreview.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
              />
              <select
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-[200px]"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="useSlug"
                checked={newUseSlug}
                onChange={(e) => setNewUseSlug(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="useSlug" className="text-muted-foreground cursor-pointer">
                Use slug — match local part of email to client slug (e.g.{" "}
                <code className="text-xs bg-muted px-1 rounded">rip@domain.com</code> → client with slug "rip").
                Uncheck to assign all emails on this domain to the selected client.
              </label>
            </div>
            <Button onClick={handleAdd} disabled={isAdding} className="gap-2 w-fit">
              {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Add Domain
            </Button>
          </CardContent>
        </Card>

        {/* Delete confirm dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Domain</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-mono font-medium">{deleteTarget?.domain}</span>? Emails sent to this domain will
                no longer be attributed to any client.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeleting ? "Removing..." : "Remove Domain"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  )
}
