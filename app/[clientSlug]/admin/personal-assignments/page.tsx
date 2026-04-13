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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Plus, Trash2, Globe, Mail, Phone } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"
import SeedListContent from "@/components/seed-list-content"

interface PersonalEmailDomain {
  id: string
  domain: string
  useSlug: boolean
  createdAt: string
  addedBy: string | null
  client: { id: string; name: string; slug: string }
}

interface PersonalPhoneNumber {
  id: string
  phoneNumber: string
  clientId: string
  assignedBy: string | null
  createdAt: string
  client: { id: string; name: string; slug: string }
}

interface Client {
  id: string
  name: string
  slug: string
}

export default function PersonalAssignmentsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string

  const [isLoading, setIsLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [clients, setClients] = useState<Client[]>([])

  // Domains state
  const [domains, setDomains] = useState<PersonalEmailDomain[]>([])
  const [loadingDomains, setLoadingDomains] = useState(true)
  const [newDomain, setNewDomain] = useState("")
  const [newDomainClientId, setNewDomainClientId] = useState("")
  const [newUseSlug, setNewUseSlug] = useState(true)
  const [isAddingDomain, setIsAddingDomain] = useState(false)
  const [deleteDomainTarget, setDeleteDomainTarget] = useState<{ id: string; domain: string } | null>(null)
  const [isDeletingDomain, setIsDeletingDomain] = useState(false)

  // Phone numbers state
  const [phoneNumbers, setPhoneNumbers] = useState<PersonalPhoneNumber[]>([])
  const [loadingPhones, setLoadingPhones] = useState(true)
  const [newPhoneNumber, setNewPhoneNumber] = useState("")
  const [newPhoneClientId, setNewPhoneClientId] = useState("")
  const [isAddingPhone, setIsAddingPhone] = useState(false)
  const [deletePhoneTarget, setDeletePhoneTarget] = useState<{ id: string; phoneNumber: string } | null>(null)
  const [isDeletingPhone, setIsDeletingPhone] = useState(false)

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
        setCurrentUser(user)
        setIsAuthorized(true)
      } catch {
        router.push("/login")
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [router, clientSlug])

  // Fetch clients
  useEffect(() => {
    if (isAuthorized) {
      fetch("/api/clients", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => setClients(data.clients ?? data))
        .catch(() => toast.error("Failed to load clients"))
    }
  }, [isAuthorized])

  // Fetch domains
  const fetchDomains = async () => {
    setLoadingDomains(true)
    try {
      const res = await fetch("/api/admin/personal-email-domains", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setDomains(data.domains)
      }
    } catch {
      toast.error("Failed to load domains")
    } finally {
      setLoadingDomains(false)
    }
  }

  // Fetch phone numbers
  const fetchPhoneNumbers = async () => {
    setLoadingPhones(true)
    try {
      const res = await fetch("/api/admin/personal-phone-numbers", { credentials: "include" })
      if (res.ok) {
        const data = await res.json()
        setPhoneNumbers(data.phoneNumbers)
      }
    } catch {
      toast.error("Failed to load phone numbers")
    } finally {
      setLoadingPhones(false)
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      fetchDomains()
      fetchPhoneNumbers()
    }
  }, [isAuthorized])

  // Domain handlers
  const handleAddDomain = async () => {
    if (!newDomain.trim() || !newDomainClientId) {
      toast.error("Please enter a domain and select a client")
      return
    }
    setIsAddingDomain(true)
    try {
      const res = await fetch("/api/admin/personal-email-domains", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: newDomain.trim(), clientId: newDomainClientId, useSlug: newUseSlug }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Domain "${data.domain.domain}" added`)
        setNewDomain("")
        setNewDomainClientId("")
        setNewUseSlug(true)
        fetchDomains()
      } else {
        toast.error(data.error || "Failed to add domain")
      }
    } catch {
      toast.error("Failed to add domain")
    } finally {
      setIsAddingDomain(false)
    }
  }

  const handleDeleteDomain = async () => {
    if (!deleteDomainTarget) return
    setIsDeletingDomain(true)
    try {
      const res = await fetch(`/api/admin/personal-email-domains?id=${deleteDomainTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success(`Domain "${deleteDomainTarget.domain}" removed`)
        setDeleteDomainTarget(null)
        fetchDomains()
      } else {
        toast.error("Failed to remove domain")
      }
    } catch {
      toast.error("Failed to remove domain")
    } finally {
      setIsDeletingDomain(false)
    }
  }

  // Phone handlers
  const handleAddPhone = async () => {
    if (!newPhoneNumber.trim() || !newPhoneClientId) {
      toast.error("Please enter a phone number and select a client")
      return
    }
    setIsAddingPhone(true)
    try {
      const res = await fetch("/api/admin/personal-phone-numbers", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: newPhoneNumber.trim(), clientId: newPhoneClientId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Phone number added`)
        setNewPhoneNumber("")
        setNewPhoneClientId("")
        fetchPhoneNumbers()
      } else {
        toast.error(data.error || "Failed to add phone number")
      }
    } catch {
      toast.error("Failed to add phone number")
    } finally {
      setIsAddingPhone(false)
    }
  }

  const handleDeletePhone = async () => {
    if (!deletePhoneTarget) return
    setIsDeletingPhone(true)
    try {
      const res = await fetch(`/api/admin/personal-phone-numbers?id=${deletePhoneTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (res.ok) {
        toast.success(`Phone number removed`)
        setDeletePhoneTarget(null)
        fetchPhoneNumbers()
      } else {
        toast.error("Failed to remove phone number")
      }
    } catch {
      toast.error("Failed to remove phone number")
    } finally {
      setIsDeletingPhone(false)
    }
  }

  // Format phone number for display
  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, "")
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
    } else if (cleaned.length === 11 && cleaned.startsWith("1")) {
      return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`
    }
    return phone
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
            <h2 className="text-2xl font-bold">Personal Assignments</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage personal email seeds, phone numbers, and domains for client-specific CI feeds.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="emails" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="emails" className="flex items-center gap-2">
              <Mail size={16} />
              Seed Emails
            </TabsTrigger>
            <TabsTrigger value="phones" className="flex items-center gap-2">
              <Phone size={16} />
              Phone Numbers
            </TabsTrigger>
            <TabsTrigger value="domains" className="flex items-center gap-2">
              <Globe size={16} />
              Domains
            </TabsTrigger>
          </TabsList>

          {/* Seed Emails Tab - Uses existing SeedListContent component */}
          <TabsContent value="emails" className="mt-6">
            <SeedListContent isAdminView={true} clientSlug={clientSlug} currentUser={currentUser} />
          </TabsContent>

          {/* Phone Numbers Tab */}
          <TabsContent value="phones" className="mt-6 space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Total Phone Numbers</div>
                  <div className="text-3xl font-bold">{phoneNumbers.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Assigned Clients</div>
                  <div className="text-3xl font-bold">
                    {new Set(phoneNumbers.map((p) => p.clientId)).size}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Phone numbers table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone size={18} />
                  Assigned Phone Numbers
                </CardTitle>
                <CardDescription>
                  SMS messages received on these numbers will be attributed to their assigned client and appear in their personal CI feed.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Phone Number</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Assigned By</TableHead>
                      <TableHead>Date Added</TableHead>
                      <TableHead className="w-[60px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPhones ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex justify-center">
                            <Loader2 size={24} className="animate-spin text-destructive" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : phoneNumbers.length > 0 ? (
                      phoneNumbers.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono font-medium">{formatPhoneNumber(p.phoneNumber)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium">{p.client.name}</span>
                              <span className="text-xs text-muted-foreground font-mono">{p.client.slug}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{p.assignedBy || "-"}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(p.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeletePhoneTarget({ id: p.id, phoneNumber: p.phoneNumber })}
                            >
                              <Trash2 size={15} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          No phone numbers configured yet. Add one below.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Add phone number */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus size={18} />
                  Add Phone Number
                </CardTitle>
                <CardDescription>
                  Register a phone number for personal SMS tracking. Enter the number without the country code.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex gap-3">
                  <Input
                    placeholder="e.g. 5551234567"
                    value={newPhoneNumber}
                    onChange={(e) => setNewPhoneNumber(e.target.value)}
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddPhone() }}
                  />
                  <select
                    value={newPhoneClientId}
                    onChange={(e) => setNewPhoneClientId(e.target.value)}
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
                <Button onClick={handleAddPhone} disabled={isAddingPhone} className="gap-2 w-fit">
                  {isAddingPhone ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add Phone Number
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains" className="mt-6 space-y-6">
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
                              onClick={() => setDeleteDomainTarget({ id: d.id, domain: d.domain })}
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
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddDomain() }}
                  />
                  <select
                    value={newDomainClientId}
                    onChange={(e) => setNewDomainClientId(e.target.value)}
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
                <Button onClick={handleAddDomain} disabled={isAddingDomain} className="gap-2 w-fit">
                  {isAddingDomain ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  Add Domain
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete domain confirm dialog */}
        <AlertDialog open={!!deleteDomainTarget} onOpenChange={(open) => !open && setDeleteDomainTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Domain</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-mono font-medium">{deleteDomainTarget?.domain}</span>? Emails sent to this domain will
                no longer be attributed to any client.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteDomain}
                disabled={isDeletingDomain}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeletingDomain ? "Removing..." : "Remove Domain"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete phone confirm dialog */}
        <AlertDialog open={!!deletePhoneTarget} onOpenChange={(open) => !open && setDeletePhoneTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Phone Number</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove{" "}
                <span className="font-mono font-medium">{deletePhoneTarget?.phoneNumber}</span>? SMS messages to this number will
                no longer be attributed to any client.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeletePhone}
                disabled={isDeletingPhone}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeletingPhone ? "Removing..." : "Remove Phone Number"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  )
}
