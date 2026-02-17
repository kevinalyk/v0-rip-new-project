"use client"
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

import type React from "react"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"

// Add the import for useDomain at the top with other imports
import { useDomain } from "@/lib/domain-context"

// Import necessary components for each content section
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  DownloadCloud,
  RefreshCw,
  Search,
  UserPlus,
  MoreHorizontal,
  Trash,
  Moon,
  Sun,
  Save,
  Info,
  Calendar,
  Filter,
  X,
  Plus,
  Loader2,
  Upload,
  Users,
  ChevronDown,
  Check,
  XCircle,
  Shuffle,
  Edit,
  Lock,
  Trash2,
  Unlock,
  Download,
  KeyRound,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useTheme } from "next-themes"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { format } from "date-fns"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { toast } from "sonner"
import { CheckCircle2, Wifi, Eye, FolderOpen, CheckCircle } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox" // Added for random assignment
import { useToast } from "@/components/ui/use-toast" // Added for BlockedDomainsContent
import { ReportingContent } from "@/components/reporting-content"
import { Footer } from "@/components/footer"
import { Alert, AlertDescription } from "@/components/ui/alert" // Added for UserSettingsContent

import { BillingContent } from "./billing-content"
// Import AdminContent
import { AdminContent } from "@/components/admin-content"

const getRoleDisplay = (role: string) => {
  const roleMap: { [key: string]: string } = {
    owner: "Owner",
    admin: "Administrator",
    editor: "Editor",
    viewer: "Viewer",
    user: "User",
    super_admin: "Super Administrator",
  }
  return roleMap[role] || role
}

interface MainContentProps {
  collapsed: boolean
  activeTab: string
  clientSlug?: string
  isAdminView?: boolean
}

export function MainContent({ collapsed, activeTab, clientSlug, isAdminView = false }: MainContentProps) {
  const router = useRouter()
  const [clients, setClients] = useState<{ id: string; name: string; slug: string | null }[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    const fetchUserAndClients = async () => {
      try {
        // Fetch current user
        const userResponse = await fetch("/api/auth/me", {
          credentials: "include",
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setCurrentUser(userData)

          // If super-admin, fetch all clients
          if (userData.role === "super_admin") {
            setLoadingClients(true)
            const clientsResponse = await fetch("/api/clients", {
              credentials: "include",
            })
            if (clientsResponse.ok) {
              const clientsData = await clientsResponse.json()
              setClients(clientsData)
            }
            setLoadingClients(false)
          }
        }
      } catch (error) {
        console.error("Error fetching user/clients:", error)
      }
    }

    fetchUserAndClients()
  }, [])

  const handleClientSwitch = (client: { id: string; name: string; slug: string | null }) => {
    // Special case: RIP client goes to /rip/admin/tools
    if (client.id === "RIP" || client.slug === "rip") {
      router.push("/rip/admin/tools")
    } else if (client.slug) {
      router.push(`/${client.slug}`)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden">
      <header className="h-16 border-b border-border flex items-center px-6 justify-between">
        <h1 className="text-xl font-semibold capitalize">
          {activeTab === "usersettings" ? "User Settings" : activeTab}
        </h1>

        {currentUser?.role === "super_admin" && clients.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 bg-transparent" disabled={loadingClients}>
                {loadingClients ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Users size={16} />
                    {isAdminView ? "RIP" : clients.find((c) => c.slug === clientSlug)?.name || "Switch Client"}
                    <ChevronDown size={16} />
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* RIP option to go back to admin */}
              <DropdownMenuItem onClick={() => router.push("/rip/admin/tools")} className="flex items-center justify-between">
                <span>RIP (Admin)</span>
                {isAdminView && <Check size={16} />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {clients.map((client) => (
                <DropdownMenuItem
                  key={client.id}
                  onClick={() => handleClientSwitch(client)}
                  className="flex items-center justify-between"
                >
                  <span>{client.name}</span>
                  {!isAdminView && clientSlug === client.slug && <Check size={16} />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <main className="flex-1 p-6 overflow-hidden">
        <div className="rounded-lg border border-border p-6 h-full overflow-auto">
          {activeTab === "overview" && <OverviewContent />}
          {activeTab === "campaigns" && <CampaignsContent isAdminView={isAdminView} clientSlug={clientSlug} />}
          {activeTab === "reporting" && <ReportingContent isAdminView={isAdminView} clientSlug={clientSlug} />}
          {activeTab === "analytics" && <AnalyticsContent />}
          {activeTab === "reports" && <ReportsContent />}
          {activeTab === "seedlist" && (
            <SeedListContent isAdminView={isAdminView} clientSlug={clientSlug} currentUser={currentUser} />
          )}
          {activeTab === "billing" && <BillingContent clientSlug={clientSlug} />}
          {activeTab === "settings" && <SettingsContent />}
          {activeTab === "users" && <UsersContent clientSlug={clientSlug} currentUser={currentUser} />}
          {activeTab === "usersettings" && <UserSettingsContent />}
          {activeTab === "clients" && <ClientsContent />}
          {activeTab === "blockeddomains" && <BlockedDomainsContent />}
          {activeTab === "admin" && <AdminContent />}
        </div>
      </main>
      <Footer />
    </div>
  )
}

function BlockedDomainsContent() {
  const [blockedDomains, setBlockedDomains] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [newDomain, setNewDomain] = useState("")
  const [reason, setReason] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; domain: string } | null>(null)
  const { toast } = useToast()

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
    fetchBlockedDomains()
  }, [])

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

  return (
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
                Add a domain to block from campaign detection. This will also delete all existing domains and campaigns
                matching this domain.
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
                            Are you sure you want to unblock {deleteConfirm?.domain}? This will allow new campaigns from
                            this domain to be detected.
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
  )
}

// Update the SeedListContent component to include the domain ID in API calls
function SeedListContent({
  isAdminView = false,
  clientSlug,
  currentUser,
}: { isAdminView?: boolean; clientSlug?: string; currentUser?: any }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString())
  const [seedEmails, setSeedEmails] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [testingConnection, setTestingConnection] = useState<string | null>(null)
  const [connectionResult, setConnectionResult] = useState<any>(null)
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false)
  const [showPasswordStates, setShowPasswordStates] = useState<{ [key: string]: boolean }>({})
  const [decryptedPasswords, setDecryptedPasswords] = useState<{ [key: string]: string }>({})
  const [encryptedPasswords, setEncryptedPasswords] = useState<{ [key: string]: string }>({})
  const [decryptingStates, setDecryptingStates] = useState<{ [key: string]: boolean }>({})
  const [isDebugDialogOpen, setIsDebugDialogOpen] = useState(false)
  const [debuggingId, setDebuggingId] = useState<string | null>(null)
  const [debugResult, setDebugResult] = useState<any>(null)

  const [isBoxesDialogOpen, setIsBoxesDialogOpen] = useState(false)
  const [debuggingBoxesId, setDebuggingBoxesId] = useState<string | null>(null)
  const [boxesResult, setBoxesResult] = useState<any>(null)

  const [clients, setClients] = useState<any[]>([])
  const [updatingClientId, setUpdatingClientId] = useState<string | null>(null)

  const [togglingLockId, setTogglingLockId] = useState<string | null>(null)
  const [animatingLockId, setAnimatingLockId] = useState<string | null>(null)

  const [bulkUnassignLoading, setBulkUnassignLoading] = useState(false)

  const [isRandomAssignDialogOpen, setIsRandomAssignDialogOpen] = useState(false)
  const [randomAssignLoading, setRandomAssignLoading] = useState(false)
  const [randomAmountType, setRandomAmountType] = useState<"all" | "number" | "percentage">("all")
  const [randomAmount, setRandomAmount] = useState("")
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [assignmentPreview, setAssignmentPreview] = useState<{
    emailsToAssign: number
    totalAvailable: number
    clients: string[]
  } | null>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 20

  const { selectedDomain } = useDomain()

  const [showSeedGuideDialog, setShowSeedGuideDialog] = useState(false)
  const [hasDownloadedGuide, setHasDownloadedGuide] = useState(false)

  const handleDownloadGuide = async () => {
    try {
      // Fetch the Blob URL from the API
      const response = await fetch("/api/guides/seed-setup-guide")
      const data = await response.json()

      if (!response.ok || !data.url) {
        throw new Error("Failed to get guide URL")
      }

      // Trigger download using the Blob URL
      const link = document.createElement("a")
      link.href = data.url
      link.download = "RIP-Seed-Email-Setup-Guide.txt"
      link.target = "_blank"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setHasDownloadedGuide(true)
      toast.success("Guide downloaded successfully!")
    } catch (error) {
      console.error("Error downloading guide:", error)
      toast.error("Failed to download guide. Please try again.")
    }
  }

  const handleImportClick = () => {
    setShowSeedGuideDialog(true)
  }

  const handleProceedToUpload = () => {
    setShowSeedGuideDialog(false)
    document.getElementById("import-seed-file")?.click()
  }

  useEffect(() => {
    if (isAdminView) {
      fetchClients()
    }
  }, [isAdminView])

  // Fetch seed emails on mount and when selectedDomain changes
  useEffect(() => {
    if (selectedDomain) {
      fetchSeedEmails()
    }
  }, [selectedDomain])

  const fetchClients = async () => {
    try {
      const response = await fetch("/api/clients", {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch clients")
      }

      const data = await response.json()
      setClients(data.filter((client: any) => client.name !== "RIP"))
    } catch (error) {
      console.error("Error fetching clients:", error)
      toast.error("Failed to fetch clients")
    }
  }

  // Function to fetch seed emails
  const fetchSeedEmails = async () => {
    if (!selectedDomain) return

    try {
      setLoading(true)
      // const url = clientSlug
      //   ? `/api/seedlist?domainId=${selectedDomain.id}&clientSlug=${clientSlug}`
      //   : `/api/seedlist?domainId=${selectedDomain.id}`

      // Refactored to use URLSearchParams for cleaner parameter handling
      const params = new URLSearchParams()
      if (selectedDomain.id !== "all") {
        params.append("domainId", selectedDomain.id)
      }
      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }

      const url = `/api/seedlist?${params.toString()}`

      const response = await fetch(url, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch seed emails")
      }

      const data = await response.json()
      setSeedEmails(data)
      setLastUpdated(new Date().toLocaleString())
    } catch (error) {
      console.error("Error fetching seed emails:", error)
      toast.error("Failed to fetch seed emails")
    } finally {
      setLoading(false)
    }
  }

  // Update handleImportFile to include domainId
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    const file = e.target.files?.[0]
    if (!file) return

    try {
      setLoading(true)

      const formData = new FormData()
      formData.append("file", file)
      formData.append("domainId", selectedDomain.id)

      const response = await fetch("/api/seedlist/import", {
        method: "POST",
        body: formData,
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Failed to import seed emails")
      }

      if (result.errors && result.errors.length > 0) {
        toast.error(`Import completed with ${result.errors.length} errors`)
        console.error("Import errors:", result.errors)
      } else {
        toast.success(`Successfully imported ${result.imported} seed emails`)
      }

      // Refresh the list
      fetchSeedEmails()
    } catch (error) {
      console.error("Error importing seed emails:", error)
      toast.error(error instanceof Error ? error.message : "Failed to import seed emails")
    } finally {
      setLoading(false)
      // Reset the file input
      e.target.value = ""
    }
  }

  // Function to export emails as CSV
  const exportToCSV = async () => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setLoading(true)

      // Use the new email-only export endpoint
      const params = new URLSearchParams()
      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }

      const url = `/api/seedlist/export-emails?${params.toString()}`

      const response = await fetch(url, {
        credentials: "include",
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to export seed emails")
      }

      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition")
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch
        ? filenameMatch[1]
        : `seed-emails-${clientSlug}-${new Date().toISOString().split("T")[0]}.txt`

      // Create a blob from the response
      const blob = await response.blob()

      // Create a download link and trigger the download
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = downloadUrl
      link.setAttribute("download", filename)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success("Seed emails exported successfully")
    } catch (error) {
      console.error("Error exporting seed emails:", error)
      toast.error(error instanceof Error ? error.message : "Failed to export seed emails")
    } finally {
      setLoading(false)
    }
  }

  // Handle deleting a seed email
  const handleDeleteSeed = async (id: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setDeletingId(id)
      const response = await fetch(`/api/seedlist/${id}?domainId=${selectedDomain.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to delete seed email")
      }

      // Remove the deleted email from the list
      setSeedEmails((prev) => prev.filter((email) => email.id !== id))
      toast.success("Seed email deleted successfully")
    } catch (error) {
      console.error("Error deleting seed email:", error)
      toast.error("Failed to delete seed email")
    } finally {
      setDeletingId(null)
    }
  }

  const testConnection = async (id: string, email: string, provider: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setTestingConnection(id)
      setConnectionResult(null)
      setIsTestDialogOpen(true)

      const response = await fetch("/api/seedlist/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, email, provider, domainId: selectedDomain.id }),
        credentials: "include",
      })

      const result = await response.json()
      setConnectionResult(result)
    } catch (error) {
      setConnectionResult({
        success: false,
        error: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setTestingConnection(null)
    }
  }

  const debugConnection = async (id: string, email: string, provider: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setDebuggingId(id)
      setDebugResult(null)
      setIsDebugDialogOpen(true)

      const response = await fetch("/api/seedlist/debug-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, email, provider, domainId: selectedDomain.id }),
        credentials: "include",
      })

      const result = await response.json()
      setDebugResult(result)
      console.log("Debug result:", result)
    } catch (error) {
      setDebugResult({
        error: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setDebuggingId(null)
    }
  }

  const debugBoxes = async (id: string, email: string, provider: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setDebuggingBoxesId(id)
      setBoxesResult(null)
      setIsBoxesDialogOpen(true)

      const response = await fetch("/api/seedlist/debug-boxes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id, email, provider, domainId: selectedDomain.id }),
        credentials: "include",
      })

      const result = await response.json()
      setBoxesResult(result)
      console.log("Debug result:", result)
    } catch (error) {
      setBoxesResult({
        error: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setDebuggingBoxesId(null)
    }
  }

  const togglePassword = async (emailId: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    if (showPasswordStates[emailId]) {
      setShowPasswordStates((prev) => ({ ...prev, [emailId]: false }))
      return
    }

    setDecryptingStates((prev) => ({ ...prev, [emailId]: true }))
    try {
      const response = await fetch(`/api/seedlist/${emailId}/password?domainId=${selectedDomain.id}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch password")
      }

      const data = await response.json()
      setDecryptedPasswords((prev) => ({ ...prev, [emailId]: data.decrypted }))
      setEncryptedPasswords((prev) => ({ ...prev, [emailId]: data.encrypted }))
      setShowPasswordStates((prev) => ({ ...prev, [emailId]: true }))
    } catch (error) {
      console.error("Error fetching password:", error)
      toast.error("Failed to decrypt password")
    } finally {
      setDecryptingStates((prev) => ({ ...prev, [emailId]: false }))
    }
  }

  const handleClientChange = async (seedId: string, clientId: string) => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setUpdatingClientId(seedId)
      const response = await fetch(`/api/seedlist/${seedId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assignedToClient: clientId, domainId: selectedDomain.id }),
        credentials: "include",
      })

      if (response.status === 403) {
        const error = await response.json()
        toast.error(error.error || "This seed email cannot be reassigned")
        return
      }

      if (!response.ok) {
        throw new Error("Failed to update client assignment")
      }

      // Update the local state
      setSeedEmails((prev) =>
        prev.map((email) => (email.id === seedId ? { ...email, assignedToClient: clientId } : email)),
      )

      toast.success("Client assignment updated successfully")
    } catch (error) {
      console.error("Error updating client assignment:", error)
      toast.error("Failed to update client assignment")
    } finally {
      setUpdatingClientId(null)
    }
  }

  const handleBulkUnassign = async () => {
    setBulkUnassignLoading(true)
    try {
      const response = await fetch("/api/seedlist/bulk-unassign", {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to unassign seed emails")
      }

      const data = await response.json()
      toast.success(data.message || "All seed emails have been unassigned")

      // Refresh the seed list
      await fetchSeedEmails()
    } catch (error) {
      console.error("Error unassigning seed emails:", error)
      toast.error("Failed to unassign seed emails. Please try again.")
    } finally {
      setBulkUnassignLoading(false)
    }
  }

  const handleRandomAssign = async () => {
    setRandomAssignLoading(true)
    try {
      const body: any = {}

      if (randomAmountType !== "all") {
        body.amountType = randomAmountType
        body.amount = randomAmount
      }

      if (selectedClientIds.length > 0) {
        body.clientIds = selectedClientIds
      }

      const response = await fetch("/api/seedlist/bulk-random-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error("Failed to randomly assign seed emails")
      }

      const data = await response.json()

      if (data.success) {
        toast.success(data.message)
        await fetchSeedEmails()
        setIsRandomAssignDialogOpen(false)
        resetRandomAssignForm()
      } else {
        toast.error(data.message || "Failed to assign seed emails")
      }
    } catch (error) {
      console.error("Error randomly assigning seed emails:", error)
      toast.error("Failed to randomly assign seed emails. Please try again.")
    } finally {
      setRandomAssignLoading(false)
      setShowConfirmation(false)
    }
  }

  const calculatePreview = () => {
    const unassignedCount = seedEmails.filter(
      (email) => !email.assignedToClient || email.assignedToClient === "RIP",
    ).length

    let emailsToAssign = unassignedCount

    if (randomAmountType === "number" && randomAmount) {
      emailsToAssign = Math.min(Number.parseInt(randomAmount), unassignedCount)
    } else if (randomAmountType === "percentage" && randomAmount) {
      emailsToAssign = Math.floor((unassignedCount * Number.parseInt(randomAmount)) / 100)
    }

    const targetClients =
      selectedClientIds.length > 0
        ? clients.filter((c) => selectedClientIds.includes(c.id)).map((c) => c.name)
        : clients.filter((c) => c.id !== "RIP").map((c) => c.name)

    setAssignmentPreview({
      emailsToAssign,
      totalAvailable: unassignedCount,
      clients: targetClients,
    })
    setShowConfirmation(true)
  }

  const resetRandomAssignForm = () => {
    setRandomAmountType("all")
    setRandomAmount("")
    setSelectedClientIds([])
    setShowConfirmation(false)
    setAssignmentPreview(null)
  }

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId],
    )
  }

  // Filter seed emails based on search term
  const filteredEmails = seedEmails.filter((email) => email.email.toLowerCase().includes(searchTerm.toLowerCase()))

  const totalPages = Math.ceil(filteredEmails.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedEmails = filteredEmails.slice(startIndex, endIndex)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, selectedDomain])

  const handleLockToggle = async (seedId: string, currentLockStatus: boolean) => {
    try {
      setAnimatingLockId(seedId)
      setTogglingLockId(seedId)

      await new Promise((resolve) => setTimeout(resolve, 400))

      const response = await fetch(`/api/seedlist/${seedId}/lock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ locked: !currentLockStatus }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to toggle lock status")
      }

      // Update the local state
      setSeedEmails((prev) =>
        prev.map((email) => (email.id === seedId ? { ...email, locked: !currentLockStatus } : email)),
      )

      toast.success(`Seed email ${!currentLockStatus ? "locked" : "unlocked"} successfully`)
    } catch (error: any) {
      console.error("Error toggling lock status:", error)
      toast.error(error.message || "Failed to toggle lock status")
    } finally {
      setTogglingLockId(null)
      setTimeout(() => setAnimatingLockId(null), 100)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-col sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Seed List</h2>
          <p className="text-sm text-muted-foreground">
            Manage your seed email addresses for automated inbox placement testing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 bg-transparent"
            onClick={fetchSeedEmails}
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          {isAdminView && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-transparent text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                  disabled={bulkUnassignLoading || seedEmails.length === 0}
                >
                  {bulkUnassignLoading ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                  <span className="hidden sm:inline">Clear All Assignments</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear All Client Assignments?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will unassign all seed emails from their current clients. This action cannot be undone. Are you
                    sure you want to continue?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleBulkUnassign} className="bg-orange-500 hover:bg-orange-600">
                    Clear All Assignments
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {isAdminView && (
            <AlertDialog open={isRandomAssignDialogOpen} onOpenChange={setIsRandomAssignDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 bg-transparent text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                  disabled={randomAssignLoading || seedEmails.length === 0}
                  onClick={() => {
                    resetRandomAssignForm()
                    setIsRandomAssignDialogOpen(true)
                  }}
                >
                  {randomAssignLoading ? <Loader2 size={16} className="animate-spin" /> : <Shuffle size={16} />}
                  <span className="hidden sm:inline">Random Assignment</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                {!showConfirmation ? (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Random Assignment</AlertDialogTitle>
                      <AlertDialogDescription>
                        Randomly assign unassigned seed emails to clients. Leave fields blank to assign all available
                        emails to all clients.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                      {/* Amount Type Selection */}
                      <div className="space-y-2">
                        <Label>Assignment Amount (Optional)</Label>
                        <Select
                          value={randomAmountType}
                          onValueChange={(value: any) => {
                            setRandomAmountType(value)
                            if (value === "all") setRandomAmount("")
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Available</SelectItem>
                            <SelectItem value="number">Specific Number</SelectItem>
                            <SelectItem value="percentage">Percentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Amount Input */}
                      {randomAmountType !== "all" && (
                        <div className="space-y-2">
                          <Label>{randomAmountType === "number" ? "Number of Emails" : "Percentage (%)"}</Label>
                          <Input
                            type="number"
                            min="1"
                            max={randomAmountType === "percentage" ? "100" : undefined}
                            value={randomAmount}
                            onChange={(e) => setRandomAmount(e.target.value)}
                            placeholder={randomAmountType === "number" ? "e.g., 50" : "e.g., 25"}
                          />
                        </div>
                      )}

                      {/* Client Selection */}
                      <div className="space-y-2">
                        <Label>Target Clients (Optional)</Label>
                        <p className="text-sm text-muted-foreground">
                          Select specific clients to assign to. Leave blank to include all clients.
                        </p>
                        <div className="border rounded-md p-4 space-y-2 max-h-48 overflow-y-auto">
                          {clients
                            .filter((client) => client.id !== "RIP")
                            .map((client) => (
                              <div key={client.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`client-${client.id}`}
                                  checked={selectedClientIds.includes(client.id)}
                                  onCheckedChange={() => toggleClientSelection(client.id)}
                                />
                                <Label htmlFor={`client-${client.id}`} className="cursor-pointer">
                                  {client.name}
                                </Label>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={resetRandomAssignForm}>Cancel</AlertDialogCancel>
                      <Button onClick={calculatePreview} className="bg-blue-500 hover:bg-blue-600">
                        Preview Assignment
                      </Button>
                    </AlertDialogFooter>
                  </>
                ) : (
                  <>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Random Assignment</AlertDialogTitle>
                      <AlertDialogDescription>
                        Please review the assignment details before proceeding.
                      </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="bg-muted p-4 rounded-md space-y-2">
                        <p className="text-sm">
                          <strong>Emails to assign:</strong> {assignmentPreview?.emailsToAssign} out of{" "}
                          {assignmentPreview?.totalAvailable} available
                        </p>
                        <p className="text-sm">
                          <strong>Target clients ({assignmentPreview?.clients.length}):</strong>{" "}
                          {assignmentPreview?.clients.join(", ")}
                        </p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Emails will be distributed roughly evenly across the selected clients with some natural
                          variation.
                        </p>
                      </div>
                    </div>

                    <AlertDialogFooter>
                      <Button variant="outline" onClick={() => setShowConfirmation(false)}>
                        Back
                      </Button>
                      <AlertDialogAction
                        onClick={handleRandomAssign}
                        disabled={randomAssignLoading}
                        className="bg-blue-500 hover:bg-blue-600"
                      >
                        {randomAssignLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin mr-2" />
                            Assigning...
                          </>
                        ) : (
                          "Confirm Assignment"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </>
                )}
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Dialog open={showSeedGuideDialog} onOpenChange={setShowSeedGuideDialog}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Seed Email Setup Guide</DialogTitle>
                <DialogDescription>
                  Before uploading your seed emails, make sure they are properly configured according to our setup
                  guide.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Important Setup Steps:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Enable IMAP/POP access for all accounts</li>
                    <li>Use unique names for each seed email</li>
                    <li>Document all credentials in a spreadsheet</li>
                    <li>Create accounts gradually (5-10 per day)</li>
                    <li>Follow provider-specific setup instructions</li>
                  </ul>
                </div>
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm text-muted-foreground">
                    Our comprehensive guide includes detailed instructions for Gmail, Yahoo, Outlook, and AOL accounts,
                    plus troubleshooting tips and a documentation template.
                  </p>
                </div>
              </div>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={handleDownloadGuide} className="w-full sm:w-auto bg-transparent">
                  <Download size={16} className="mr-2" />
                  Download Setup Guide
                </Button>
                <Button onClick={handleProceedToUpload} className="w-full sm:w-auto">
                  Continue to Upload
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 bg-transparent"
            onClick={handleImportClick}
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Import CSV</span>
            <input id="import-seed-file" type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
          </Button>

          <Button
            variant="default"
            size="sm"
            className="flex items-center gap-2 bg-rip-red hover:bg-rip-red/90 text-white"
            onClick={exportToCSV}
            disabled={seedEmails.length === 0}
          >
            <DownloadCloud size={16} />
            <span className="hidden sm:inline">Export Emails</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Last updated: <span className="font-medium">{lastUpdated}</span>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search emails..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email Address</TableHead>
              {isAdminView && <TableHead>Client</TableHead>}
              {isAdminView && <TableHead className="w-[80px]">Locked</TableHead>}
              {/* CHANGE: Show provider only on non-admin views */}
              {!isAdminView && <TableHead>Provider</TableHead>}
              {/* CHANGE: Show password column only on admin view (/admin) */}
              {isAdminView && <TableHead>Password</TableHead>}
              {!isAdminView && <TableHead>Added On</TableHead>}
              <TableHead className="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={isAdminView ? 6 : 5} className="text-center py-12">
                  <div className="flex justify-center">
                    <Loader2 size={24} className="animate-spin text-rip-red" />
                  </div>
                </TableCell>
              </TableRow>
            ) : paginatedEmails.length > 0 ? (
              paginatedEmails.map((email) => {
                return (
                  <TableRow key={email.id}>
                    <TableCell>{email.email}</TableCell>
                    {isAdminView && (
                      <TableCell>
                        {/* CHANGE: Show lock icon and disable dropdown for locked seeds */}
                        {email.locked ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Lock size={14} />
                            <span className="text-sm">{email.assignedToClient || email.ownedByClient}</span>
                          </div>
                        ) : (
                          <Select
                            value={email.assignedToClient || "RIP"}
                            onValueChange={(value) => handleClientChange(email.id, value)}
                            disabled={updatingClientId === email.id}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue>
                                {email.assignedToClient === "RIP" || !email.assignedToClient
                                  ? ""
                                  : email.assignedToClient}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RIP">{"\u00A0"}</SelectItem>
                              {clients.map((client) => (
                                <SelectItem key={client.id} value={client.name}>
                                  {client.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                    )}
                    {isAdminView && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLockToggle(email.id, email.locked)}
                          disabled={togglingLockId === email.id}
                          className="h-8 w-8 p-0 hover:bg-transparent"
                        >
                          <div className="relative w-4 h-4">
                            {/* Unlocked icon */}
                            <Unlock
                              size={16}
                              className={`absolute inset-0 text-muted-foreground transition-all duration-400 ${
                                email.locked
                                  ? "opacity-0 rotate-90 scale-50"
                                  : animatingLockId === email.id
                                    ? "opacity-0 rotate-90 scale-50"
                                    : "opacity-100 rotate-0 scale-100"
                              }`}
                              style={{ transformOrigin: "center" }}
                            />
                            {/* Locked icon */}
                            <Lock
                              size={16}
                              className={`absolute inset-0 text-rip-red transition-all duration-400 ${
                                email.locked
                                  ? animatingLockId === email.id
                                    ? "opacity-100 rotate-0 scale-100"
                                    : "opacity-100 rotate-0 scale-100"
                                  : "opacity-0 -rotate-90 scale-50"
                              }`}
                              style={{ transformOrigin: "center" }}
                            />
                          </div>
                        </Button>
                      </TableCell>
                    )}
                    {!isAdminView && <TableCell className="capitalize">{email.provider || "Unknown"}</TableCell>}
                    {/* CHANGE: Show password column only on admin view (/admin) */}
                    {isAdminView && (
                      <TableCell>
                        {decryptingStates[email.id] ? (
                          <div className="flex items-center">
                            <Loader2 size={16} className="animate-spin mr-2" />
                            Decrypting...
                          </div>
                        ) : showPasswordStates[email.id] ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Decrypted:</span>
                              <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm">
                                {decryptedPasswords[email.id]}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Encrypted:</span>
                              <code
                                className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-sm truncate max-w-[200px]"
                                title={encryptedPasswords[email.id]}
                              >
                                {encryptedPasswords[email.id]}
                              </code>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => togglePassword(email.id)}
                              className="text-xs h-7 px-2"
                            >
                              Hide
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => togglePassword(email.id)}
                            className="text-xs h-7"
                          >
                            Show Password
                          </Button>
                        )}
                      </TableCell>
                    )}
                    {!isAdminView && <TableCell>{new Date(email.createdAt).toLocaleDateString()}</TableCell>}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {currentUser?.role === "super_admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => testConnection(email.id, email.email, email.provider)}
                            disabled={testingConnection === email.id}
                            className="h-8 w-8"
                            title="Test Connection"
                          >
                            {testingConnection === email.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Wifi size={16} className="text-blue-500" />
                            )}
                          </Button>
                        )}
                        {(email.provider === "outlook" || email.provider === "hotmail") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              window.open(
                                `/api/oauth/microsoft?seedEmailId=${email.id}&domainId=${selectedDomain.id}`,
                                "_blank",
                              )
                            }
                            className="h-8 w-8"
                            title="Connect OAuth"
                          >
                            <CheckCircle size={16} className="text-orange-500" />
                          </Button>
                        )}
                        {currentUser?.role === "super_admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => debugConnection(email.id, email.email, email.provider)}
                            disabled={debuggingId === email.id}
                            className="h-8 w-8"
                            title="Debug Connection"
                          >
                            {debuggingId === email.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Info size={16} className="text-green-500" />
                            )}
                          </Button>
                        )}
                        {currentUser?.role === "super_admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => debugBoxes(email.id, email.email, email.provider)}
                            disabled={debuggingBoxesId === email.id}
                            className="h-8 w-8"
                            title="Debug Folders"
                          >
                            {debuggingBoxesId === email.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <FolderOpen size={16} className="text-purple-500" />
                            )}
                          </Button>
                        )}
                        {(currentUser?.role === "super_admin" ||
                          (currentUser?.clientId && email.ownedByClient === currentUser.clientId)) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSeed(email.id)}
                            disabled={deletingId === email.id}
                            className="h-8 w-8"
                          >
                            {deletingId === email.id ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Trash size={16} className="text-red-500" />
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={isAdminView ? 6 : 5} className="text-center py-12 text-muted-foreground">
                  {seedEmails.length === 0
                    ? "No seed emails added yet. Import a CSV file to start testing inbox placement."
                    : "No emails match your search."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {filteredEmails.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, filteredEmails.length)} of {filteredEmails.length} emails
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <div className="text-sm text-muted-foreground">Showing {filteredEmails.length} seed emails</div>

      {/* Connection Test Dialog */}
      <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connection Test Results</DialogTitle>
            <DialogDescription>Testing email server connection</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {testingConnection ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
                  <p>Testing connection...</p>
                </div>
              </div>
            ) : connectionResult ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  {connectionResult.success ? (
                    <CheckCircle2 className="text-green-500" size={20} />
                  ) : (
                    <XCircle className="text-red-500" size={20} />
                  )}
                  <span className={connectionResult.success ? "text-green-600" : "text-red-600"}>
                    {connectionResult.success ? "Connection Successful" : "Connection Failed"}
                  </span>
                </div>

                {connectionResult.details && (
                  <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Connection Details:</h4>
                    <pre className="text-sm whitespace-pre-wrap">
                      {JSON.stringify(connectionResult.details, null, 2)}
                    </pre>
                  </div>
                )}

                {connectionResult.error && (
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-red-600">Error:</h4>
                    <p className="text-sm text-red-600">{connectionResult.error}</p>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Connection Dialog */}
      <Dialog open={isDebugDialogOpen} onOpenChange={setIsDebugDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Debug Connection Results</DialogTitle>
            <DialogDescription>Detailed connection debugging information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {debuggingId ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
                  <p>Running debug tests...</p>
                </div>
              </div>
            ) : debugResult ? (
              <div className="space-y-4">
                {debugResult.error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-red-600">Debug Error:</h4>
                    <p className="text-sm text-red-600">{debugResult.error}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {debugResult.steps?.map((step: any, index: number) => (
                      <div key={index} className="border rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          {step.success ? (
                            <CheckCircle2 className="text-green-500" size={16} />
                          ) : (
                            <XCircle className="text-red-500" size={16} />
                          )}
                          <span className="font-medium">{step.step}</span>
                        </div>
                        {step.details && (
                          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-sm">
                            <pre className="whitespace-pre-wrap">{JSON.stringify(step.details, null, 2)}</pre>
                          </div>
                        )}
                        {step.error && (
                          <div className="text-red-600 text-sm mt-2">
                            <strong>Error:</strong> {step.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDebugDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debug Boxes Dialog */}
      <Dialog open={isBoxesDialogOpen} onOpenChange={setIsBoxesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Email Folders/Boxes Debug</DialogTitle>
            <DialogDescription>Available folders and mailboxes for this email account</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {debuggingBoxesId ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
                  <p>Loading email folders...</p>
                </div>
              </div>
            ) : boxesResult ? (
              <div className="space-y-4">
                {boxesResult.error ? (
                  <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                    <h4 className="font-medium mb-2 text-red-600">Error:</h4>
                    <p className="text-sm text-red-600">{boxesResult.error}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {boxesResult.success && (
                      <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                        <h4 className="font-medium mb-2 text-green-600">Connection Successful</h4>
                        <p className="text-sm text-green-600">Found {boxesResult.boxes?.length || 0} folders</p>
                      </div>
                    )}

                    {boxesResult.boxes && boxesResult.boxes.length > 0 && (
                      <div className="border rounded-lg">
                        <div className="p-4 border-b bg-gray-50 dark:bg-gray-900">
                          <h4 className="font-medium">Available Folders</h4>
                        </div>
                        <div className="divide-y">
                          {boxesResult.boxes.map((box: any, index: number) => (
                            <div key={index} className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <FolderOpen size={16} className="text-blue-500" />
                                <div>
                                  <div className="font-medium">{box.name}</div>
                                  {box.displayName && box.displayName !== box.name && (
                                    <div className="text-sm text-muted-foreground">Display: {box.displayName}</div>
                                  )}
                                </div>
                              </div>
                              <div className="text-right text-sm">
                                <div className="flex items-center gap-4">
                                  {box.messages !== undefined && (
                                    <span className="text-muted-foreground">{box.messages} messages</span>
                                  )}
                                  <div className="flex gap-2">
                                    {box.readonly && <Badge variant="outline">Read-only</Badge>}
                                    {box.special && <Badge variant="secondary">{box.special}</Badge>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {boxesResult.debugInfo && (
                      <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                        <h4 className="font-medium mb-2">Debug Information</h4>
                        <pre className="text-sm whitespace-pre-wrap overflow-auto">
                          {JSON.stringify(boxesResult.debugInfo, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBoxesDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function UsersContent({ clientSlug, currentUser }: { clientSlug?: string; currentUser?: any }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString())
  const [isAddUserOpen, setIsAddUserOpen] = useState(false)
  const [newUser, setNewUser] = useState({ firstName: "", lastName: "", email: "", role: "user" })
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [editRoleUserId, setEditRoleUserId] = useState<string | null>(null)
  const [editRoleValue, setEditRoleValue] = useState<string>("")
  const [updatingRole, setUpdatingRole] = useState(false)
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null)
  const [resetPasswordResult, setResetPasswordResult] = useState<{
    show: boolean
    tempPassword: string
  }>({ show: false, tempPassword: "" })

  // Fetch users on mount
  useEffect(() => {
    fetchUsers()
  }, [])

  // Function to fetch users
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }
      const url = `/api/users${params.toString() ? `?${params.toString()}` : ""}`

      const response = await fetch(url, {
        credentials: "include",
      })

      if (response.status === 403) {
        console.log("User does not have permission to view users list")
        setUsers([])
        return
      }

      if (!response.ok) {
        throw new Error("Failed to fetch users")
      }

      const data = await response.json()
      setUsers(data)
      setLastUpdated(new Date().toLocaleString())
    } catch (error) {
      console.error("Error fetching users:", error)
      toast.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.firstName.trim() || !newUser.email.trim()) {
      toast.error("Please fill in required fields")
      return
    }

    try {
      setAddingUser(true)
      const response = await fetch("/api/users/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newUser),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation")
      }

      // Add the new user to the list
      setUsers((prev) => [...prev, data.user])
      setNewUser({ firstName: "", lastName: "", email: "", role: "user" })
      setIsAddUserOpen(false)
      toast.success("Invitation sent successfully")
    } catch (error: any) {
      console.error("Error sending invitation:", error)
      toast.error(error.message || "Failed to send invitation")
    } finally {
      setAddingUser(false)
    }
  }

  // Handle deleting a user
  const handleDeleteUser = async (id: string) => {
    try {
      setDeletingId(id)
      const response = await fetch(`/api/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to delete user")
      }

      // Remove the deleted user from the list
      setUsers((prev) => prev.filter((user) => user.id !== id))
      toast.success("User deleted successfully")
    } catch (error) {
      console.error("Error deleting user:", error)
      toast.error("Failed to delete user")
    } finally {
      setDeletingId(null)
    }
  }

  const handleResendInvite = async (userId: string) => {
    try {
      setResendingId(userId)
      const response = await fetch("/api/users/resend-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIdToResend: userId }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend invitation")
      }

      toast.success("Invitation resent successfully")
    } catch (error: any) {
      console.error("Error resending invitation:", error)
      toast.error(error.message || "Failed to resend invitation")
    } finally {
      setResendingId(null)
    }
  }

  const handleUpdateRole = async () => {
    if (!editRoleUserId) return

    try {
      setUpdatingRole(true)
      const response = await fetch(`/api/users/${editRoleUserId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role: editRoleValue }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to update user role")
      }

      // Update the user in the list
      setUsers((prev) => prev.map((user) => (user.id === editRoleUserId ? { ...user, role: editRoleValue } : user)))
      setEditRoleUserId(null)
      setEditRoleValue("")
      toast.success("User role updated successfully")
    } catch (error) {
      console.error("Error updating user role:", error)
      toast.error("Failed to update user role")
    } finally {
      setUpdatingRole(false)
    }
  }

  // Simulate refreshing the list
  const refreshList = () => {
    fetchUsers()
  }

  // Filter users based on search term
  const filteredUsers = users.filter(
    (user) =>
      (user.firstName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.lastName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.email || "").toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const handleForceResetPassword = async (userId: string) => {
    try {
      setResettingPasswordId(userId)
      const response = await fetch(`/api/users/${userId}/force-reset-password`, {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to reset password")
      }

      const data = await response.json()

      // Show the temporary password in case email delivery fails
      setResetPasswordResult({ show: true, tempPassword: data.tempPassword })

      toast.success("Password reset successfully. User will be prompted to change it on next login.")
    } catch (error) {
      console.error("Error resetting password:", error)
      toast.error("Failed to reset password")
    } finally {
      setResettingPasswordId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-col sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Users</h2>
          <p className="text-sm text-muted-foreground">Manage user accounts and permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex items-center gap-2 bg-transparent" onClick={refreshList}>
            <RefreshCw size={16} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
            <DialogTrigger asChild>
              <Button
                variant="default"
                size="sm"
                className="flex items-center gap-2 bg-rip-red hover:bg-rip-red/90 text-white"
              >
                <UserPlus size={16} />
                <span className="hidden sm:inline">Add User</span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                {/* Updated description to reflect invitation */}
                <DialogDescription>Send an invitation to create a new user account.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="firstName">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={newUser.firstName}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, firstName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={newUser.lastName}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, lastName: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="john@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value) => setNewUser((prev) => ({ ...prev, role: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddUserOpen(false)} disabled={addingUser}>
                  Cancel
                </Button>
                <Button
                  className="bg-rip-red hover:bg-rip-red/90 text-white"
                  onClick={handleAddUser}
                  disabled={addingUser}
                >
                  {addingUser ? (
                    <>
                      <Loader2 size={16} className="mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    // Updated button text
                    "Send Invite"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Last updated: <span className="font-medium">{lastUpdated}</span>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search users..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[100px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex justify-center">
                    <Loader2 size={24} className="animate-spin text-rip-red" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-rip-red/10 text-rip-red text-xs">
                          {/* Updated AvatarFallback to use new name fields */}
                          {user.firstName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                          {user.lastName?.[0]?.toUpperCase() || ""}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {user.firstName} {user.lastName}
                        </div>
                        {/* CHANGE: Check firstLogin instead of password to show pending invitation */}
                        {user.firstLogin === true && (
                          <div className="text-xs text-amber-600 dark:text-amber-400">Pending invitation</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant={user.role === "admin" || user.role === "owner" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {getRoleDisplay(user.role)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(currentUser?.role === "super_admin" ||
                          currentUser?.role === "owner" ||
                          (currentUser?.role === "admin" &&
                            user.role !== "admin" &&
                            user.role !== "super_admin" &&
                            user.role !== "owner")) && (
                          <DropdownMenuItem
                            onClick={() => {
                              setEditRoleUserId(user.id)
                              setEditRoleValue(user.role)
                            }}
                          >
                            <Edit size={14} className="mr-2" />
                            Edit Role
                          </DropdownMenuItem>
                        )}
                        {currentUser?.role === "super_admin" && user.id !== currentUser.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-orange-600 focus:text-orange-600"
                              >
                                <KeyRound size={14} className="mr-2" />
                                Force Reset Password
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Force Reset User Password?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will reset {user.firstName} {user.lastName}&apos;s password to a temporary
                                  password and require them to change it on their next login. An email notification will
                                  be sent to {user.email} with the temporary password.
                                  <br />
                                  <br />
                                  <strong>
                                    This action cannot be undone. Use this only when absolutely necessary.
                                  </strong>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleForceResetPassword(user.id)}
                                  className="bg-orange-600 hover:bg-orange-700"
                                  disabled={resettingPasswordId === user.id}
                                >
                                  {resettingPasswordId === user.id ? (
                                    <>
                                      <Loader2 size={14} className="mr-2 animate-spin" />
                                      Resetting...
                                    </>
                                  ) : (
                                    "Reset Password"
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        {(currentUser?.role === "super_admin" ||
                          (currentUser?.role === "owner" && user.role !== "owner" && user.role !== "super_admin") ||
                          (currentUser?.role === "admin" &&
                            user.role !== "admin" &&
                            user.role !== "super_admin" &&
                            user.role !== "owner")) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash size={14} className="mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete the user account. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUser(user.id)}
                                  className="bg-destructive hover:bg-destructive/90"
                                  disabled={deletingId === user.id}
                                >
                                  {deletingId === user.id ? (
                                    <>
                                      <Loader2 size={14} className="mr-2 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    "Delete"
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editRoleUserId !== null} onOpenChange={(open) => !open && setEditRoleUserId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the role for this user. Owners and admins have elevated permissions to manage users and settings.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editRole">Role</Label>
              <Select value={editRoleValue} onValueChange={setEditRoleValue}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentUser?.role === "super_admin" && <SelectItem value="owner">Owner</SelectItem>}
                  {(currentUser?.role === "super_admin" || currentUser?.role === "owner") && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleUserId(null)} disabled={updatingRole}>
              Cancel
            </Button>
            <Button
              className="bg-rip-red hover:bg-rip-red/90 text-white"
              onClick={handleUpdateRole}
              disabled={updatingRole}
            >
              {updatingRole ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={resetPasswordResult.show}
        onOpenChange={(open) => setResetPasswordResult({ show: open, tempPassword: "" })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Password Reset Successful</AlertDialogTitle>
            <AlertDialogDescription>
              The user&apos;s password has been reset. An email has been sent with the temporary password, but here it
              is for your reference:
              <div className="mt-4 p-4 bg-muted rounded-lg border-2 border-destructive">
                <p className="text-xs text-muted-foreground font-semibold mb-2">TEMPORARY PASSWORD:</p>
                <p className="text-2xl font-bold font-mono text-destructive tracking-wide">
                  {resetPasswordResult.tempPassword}
                </p>
              </div>
              <p className="mt-4 text-sm">The user will be required to change this password when they log in.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SettingsContent() {
  const [retentionPeriod, setRetentionPeriod] = useState("90")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string>("System")

  const { selectedDomain } = useDomain()

  // Fetch client info and settings on mount
  useEffect(() => {
    fetchClientAndSettings()
  }, [])

  const fetchClientAndSettings = async () => {
    try {
      setLoading(true)

      // First, get the user's client info
      const userResponse = await fetch("/api/auth/me", { credentials: "include" })
      if (!userResponse.ok) {
        throw new Error("Failed to fetch user data")
      }

      const userData = await userResponse.json()

      // Get client ID from user or from first domain
      let fetchedClientId: string | null = null

      if (userData.clientId) {
        // User has a client assigned
        fetchedClientId = userData.clientId

        // Fetch client details
        const clientResponse = await fetch(`/api/clients/${userData.clientId}`, {
          credentials: "include",
        })

        if (clientResponse.ok) {
          // FIX: Use clientResponse here instead of response
          const clientData = await clientResponse.json()
          setClientName(clientData.name)
        }
      } else {
        setClientName("System")
      }

      setClientId(fetchedClientId)

      // Fetch settings for this client
      if (fetchedClientId) {
        const settingsUrl = `/api/settings?clientId=${fetchedClientId}`
        const response = await fetch(settingsUrl, { credentials: "include" })

        if (response.ok) {
          const settings = await response.json()
          if (settings.retention_period) {
            setRetentionPeriod(settings.retention_period.toString())
          }
        }
      }
    } catch (error) {
      console.error("Error fetching settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!clientId) {
      toast.error("No client assigned")
      return
    }

    try {
      setSaving(true)
      const url = `/api/settings?clientId=${clientId}`

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          retention_period: retentionPeriod,
        }),
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to save settings")
      }

      toast.success("Settings saved successfully")
    } catch (error) {
      console.error("Error saving settings:", error)
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">{clientName} Settings</h2>
        <p className="text-muted-foreground">
          Configure settings for {clientName}. These settings apply to all domains owned by this client.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Data Retention</CardTitle>
          <CardDescription>
            Configure how long campaign data and email results are stored before being automatically cleaned up. This
            setting applies to all domains owned by {clientName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="retention">Data Retention Period</Label>
              <Select value={retentionPeriod} onValueChange={setRetentionPeriod}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select retention period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days (1 month)</SelectItem>
                  <SelectItem value="60">60 days (2 months)</SelectItem>
                  <SelectItem value="90">90 days (3 months)</SelectItem>
                  <SelectItem value="120">120 days (4 months)</SelectItem>
                  <SelectItem value="180">180 days (6 months)</SelectItem>
                  <SelectItem value="365">365 days (1 year)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Individual email results and detailed processing data will be automatically deleted after this period.
                Campaign summaries and statistics will be preserved.
              </p>
            </div>
          </div>

          <div className="rounded-md border p-4 bg-muted/30">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              What gets cleaned up?
            </h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Individual email delivery results and placement data</li>
              <li>Detailed forwarded email content and headers</li>
              <li>Raw email processing logs and metadata</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>Note:</strong> Campaign summaries, seed list emails, and user accounts are not affected by this
              setting.
            </p>
          </div>

          <div className="flex items-center gap-2 p-3 border rounded-lg bg-green-50 dark:bg-green-900/20">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div className="text-sm">
              <span className="font-medium text-green-800 dark:text-green-200">Current setting: </span>
              <span className="text-green-700 dark:text-green-300">
                Data will be retained for {retentionPeriod} days
                {retentionPeriod === "30" && " (1 month)"}
                {retentionPeriod === "60" && " (2 months)"}
                {retentionPeriod === "90" && " (3 months)"}
                {retentionPeriod === "120" && " (4 months)"}
                {retentionPeriod === "180" && " (6 months)"}
                {retentionPeriod === "365" && " (1 year)"}
              </span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="bg-rip-red hover:bg-rip-red/90 text-white" onClick={handleSaveSettings} disabled={saving}>
            {saving ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} className="mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

function UserSettingsContent() {
  const { theme, setTheme } = useTheme()
  const [user, setUser] = useState<{
    firstName: string
    lastName: string
    email: string
    role: string
    client: { name: string } | null
  }>({
    firstName: "",
    lastName: "",
    email: "",
    role: "",
    client: null,
  })
  const [loading, setLoading] = useState(false)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState("")

  // Fetch user data on mount
  useEffect(() => {
    fetchUserData()
  }, [])

  const fetchUserData = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      })

      if (response.ok) {
        const userData = await response.json()
        setUser({
          firstName: userData.firstName || "",
          lastName: userData.lastName || "",
          email: userData.email || "",
          role: userData.role || "",
          client: userData.client || null,
        })
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    try {
      setResetPasswordLoading(true)
      setResetPasswordError("")
      setResetPasswordSuccess(false)

      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: user.email }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to send reset email")
      }

      setResetPasswordSuccess(true)
    } catch (err: any) {
      setResetPasswordError(err.message || "An error occurred. Please try again.")
    } finally {
      setResetPasswordLoading(false)
    }
  }

  // Removed duplicate getRoleDisplay function here. It's now at the top level.

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">User Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* User Information Card */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>Your profile and account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Full Name</Label>
              <p className="text-sm font-medium">
                {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : "Not set"}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Email Address</Label>
              <p className="text-sm font-medium">{user.email}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Client</Label>
              <p className="text-sm font-medium">{user.client?.name || "No client assigned"}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Role</Label>
              <p className="text-sm font-medium">{getRoleDisplay(user.role)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Appearance Card */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customize the look and feel of your dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Theme</Label>
              <RadioGroup value={theme} onValueChange={setTheme} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="light" id="light" />
                  <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer font-normal">
                    <Sun size={16} />
                    Light
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dark" id="dark" />
                  <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer font-normal">
                    <Moon size={16} />
                    Dark
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="system" id="system" />
                  <Label htmlFor="system" className="cursor-pointer font-normal">
                    System
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reset Password Card */}
      <Card>
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>Send a password reset link to your email address</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resetPasswordSuccess && (
            <Alert className="bg-green-50 text-green-800 border-green-200">
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                A password reset link has been sent to {user.email}. Please check your inbox.
              </AlertDescription>
            </Alert>
          )}

          {resetPasswordError && (
            <Alert variant="destructive">
              <AlertDescription>{resetPasswordError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 className="font-medium">Change Your Password</h4>
              <p className="text-sm text-muted-foreground">We'll send a reset link to {user.email}</p>
            </div>
            <Button
              onClick={handleResetPassword}
              disabled={resetPasswordLoading}
              className="bg-rip-red hover:bg-rip-red/90 text-white"
            >
              {resetPasswordLoading ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Reset Link"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function OverviewContent() {
  return <div className="text-lg font-medium">Overview Content</div>
}

// Placeholder for AnalyticsContent
function AnalyticsContent() {
  return <div className="text-lg font-medium">Analytics Content</div>
}

// Placeholder for ReportsContent
function ReportsContent() {
  return <div className="text-lg font-medium">Reports Content</div>
}

// Placeholder for ClientsContent
function ClientsContent() {
  return <div className="text-lg font-medium">Clients Content</div>
}

// The actual component is now imported from billing-content.tsx

// Placeholder for BillingContent (TO BE REMOVED AFTER IMPORTING)
// function BillingContent() {
//   return <div className="text-lg font-medium">Billing Content</div>
// }

// ReportingContent is now imported, no need for a placeholder here.

// Update the fetchCampaigns function in CampaignsContent to include the domain ID
function CampaignsContent({ clientSlug, isAdminView }: { clientSlug?: string; isAdminView?: boolean }) {
  const [searchTerm, setSearchTerm] = useState("")
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString())
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  })
  const [deliveryRateRange, setDeliveryRateRange] = useState([0, 100])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [isCreateCampaignOpen, setIsCreateCampaignOpen] = useState(false)
  const [newCampaign, setNewCampaign] = useState({
    subject: "",
    sender: "",
    fromEmail: "",
  })
  const [creatingCampaign, setCreatingCampaign] = useState(false)
  const [checkingEmails, setCheckingEmails] = useState<string | null>(null)
  const [deletingCampaignId, setDeletingCampaignId] = useState<string | null>(null)

  const [selectedCampaign, setSelectedCampaign] = useState<any>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)
  const [campaignDetails, setCampaignDetails] = useState<any>(null)
  const [loadingDetails, setLoadingDetails] = useState(false)

  const { selectedDomain } = useDomain()

  const [filtersActive, setFiltersActive] = useState(false)

  // Fetch campaigns on mount and when selectedDomain changes
  useEffect(() => {
    if (selectedDomain) {
      fetchCampaigns()
    }
  }, [selectedDomain])

  // Function to fetch campaigns
  const fetchCampaigns = async () => {
    if (!selectedDomain) return

    try {
      setLoading(true)
      let url = "/api/campaigns"
      const params = new URLSearchParams()

      if (selectedDomain.id !== "all") {
        params.append("domainId", selectedDomain.id)
      }

      if (clientSlug) {
        params.append("clientSlug", clientSlug)
      }

      if (params.toString()) {
        url += `?${params.toString()}`
      }

      const response = await fetch(url, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch campaigns")
      }

      const data = await response.json()
      setCampaigns(data)
      setLastUpdated(new Date().toLocaleString())
    } catch (error) {
      console.error("Error fetching campaigns:", error)
      toast.error("Failed to fetch campaigns")
    } finally {
      setLoading(false)
    }
  }

  // Update handleCreateCampaign to include domainId
  const handleCreateCampaign = async () => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    if (selectedDomain.id === "all") {
      toast.error("Please select a specific domain to create campaigns")
      return
    }

    if (!newCampaign.subject.trim() || !newCampaign.sender.trim() || !newCampaign.fromEmail.trim()) {
      toast.error("Please fill in all required fields")
      return
    }

    try {
      setCreatingCampaign(true)
      const response = await fetch("/api/campaigns/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...newCampaign,
          domainId: selectedDomain.id,
        }),
        credentials: "include",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create campaign")
      }

      // Add the new campaign to the list
      setCampaigns((prev) => [data, ...prev])
      setNewCampaign({ subject: "", sender: "", fromEmail: "" })
      setIsCreateCampaignOpen(false)
      toast.success("Campaign created successfully")
    } catch (error: any) {
      console.error("Error creating campaign:", error)
      toast.error(error.message || "Failed to create campaign")
    } finally {
      setCreatingCampaign(false)
    }
  }

  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined })
    setDeliveryRateRange([0, 100])
    setFiltersActive(false)
  }

  // Removed redundant refresh button - users can refresh the page instead
  // Removed refresh button

  const handleCheckEmails = async (campaignId: string) => {
    try {
      setCheckingEmails(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}/check-emails`, {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to check emails")
      }

      toast.success("Checking emails...")
      fetchCampaigns()
    } catch (error) {
      console.error("Error checking emails:", error)
      toast.error("Failed to check emails")
    } finally {
      setCheckingEmails(null)
    }
  }

  const handleViewDetails = async (campaign: any) => {
    setSelectedCampaign(campaign)
    setIsDetailsDialogOpen(true)
    setCampaignDetails(null)
    setLoadingDetails(true)

    try {
      const response = await fetch(`/api/campaigns/${campaign.id}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch campaign details")
      }

      const data = await response.json()
      setCampaignDetails(data)
    } catch (error) {
      console.error("Error fetching campaign details:", error)
      toast.error("Failed to fetch campaign details")
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    try {
      setDeletingCampaignId(campaignId)
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to delete campaign")
      }

      // Remove the deleted campaign from the list
      setCampaigns((prev) => prev.filter((campaign) => campaign.id !== campaignId))
      toast.success("Campaign deleted successfully")
    } catch (error) {
      console.error("Error deleting campaign:", error)
      toast.error("Failed to delete campaign")
    } finally {
      setDeletingCampaignId(null)
    }
  }

  const filteredCampaigns = campaigns.filter((campaign) => {
    const searchTermLower = searchTerm.toLowerCase()
    const subjectMatches = campaign.subject.toLowerCase().includes(searchTermLower)
    const senderMatches = campaign.sender.toLowerCase().includes(searchTermLower)
    const fromEmailMatches = campaign.fromEmail.toLowerCase().includes(searchTermLower)

    const dateFilterActive = dateRange.from || dateRange.to
    const campaignDate = new Date(campaign.sentDate)
    const dateMatches =
      !dateFilterActive ||
      ((!dateRange.from || campaignDate >= dateRange.from) && (!dateRange.to || campaignDate <= dateRange.to))

    const deliveryRateMatches =
      campaign.deliveryRate * 100 >= deliveryRateRange[0] && campaign.deliveryRate * 100 <= deliveryRateRange[1]

    return subjectMatches || senderMatches || (fromEmailMatches && dateMatches && deliveryRateMatches)
  })

  useEffect(() => {
    setFiltersActive(
      dateRange.from !== undefined ||
        dateRange.to !== undefined ||
        deliveryRateRange[0] > 0 ||
        deliveryRateRange[1] < 100,
    )
  }, [dateRange, deliveryRateRange])

  // Helper function to calculate delivery stats from campaign results
  const calculateDeliveryStats = (campaign: any) => {
    if (!campaign.results || campaign.results.length === 0) {
      return { inboxRate: 0, spamRate: 0, totalDeliveryRate: 0 }
    }

    const totalResults = campaign.results.length
    const inboxCount = campaign.results.filter((r: any) => r.placementStatus === "inbox").length
    const spamCount = campaign.results.filter((r: any) => r.placementStatus === "spam").length
    const deliveredCount = campaign.results.filter((r: any) => r.delivered).length

    return {
      inboxRate: (inboxCount / totalResults) * 100,
      spamRate: (spamCount / totalResults) * 100,
      totalDeliveryRate: (deliveredCount / totalResults) * 100,
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-col sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Email Campaigns</h2>
          <p className="text-sm text-muted-foreground">Monitor inbox placement for your email campaigns</p>
        </div>
        {isAdminView && (
          <div className="flex items-center gap-2">
            <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={filtersActive ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "flex items-center gap-2",
                    filtersActive && "bg-rip-red hover:bg-rip-red/90 text-white",
                  )}
                >
                  <Filter size={16} />
                  <span className="hidden sm:inline">Filter</span>
                  {filtersActive && (
                    <Badge className="ml-1 bg-white text-rip-red">
                      {(dateRange.from || dateRange.to ? 1 : 0) +
                        (deliveryRateRange[0] > 0 || deliveryRateRange[1] < 100 ? 1 : 0)}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Filters</h4>
                    <Button variant="ghost" size="sm" onClick={resetFilters} className="h-8 px-2 text-xs">
                      Reset
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>Date Range</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col">
                        <Label className="text-xs mb-1">From</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !dateRange.from && "text-muted-foreground",
                              )}
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              {dateRange.from ? format(dateRange.from, "MMM d, yyyy") : <span>Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <CalendarComponent
                              mode="single"
                              selected={dateRange.from}
                              onSelect={(date) => setDateRange((prev) => ({ ...prev, from: date }))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="flex flex-col">
                        <Label className="text-xs mb-1">To</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "justify-start text-left font-normal",
                                !dateRange.to && "text-muted-foreground",
                              )}
                            >
                              <Calendar className="mr-2 h-4 w-4" />
                              {dateRange.to ? format(dateRange.to, "MMM d, yyyy") : <span>Pick a date</span>}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <CalendarComponent
                              mode="single"
                              selected={dateRange.to}
                              onSelect={(date) => setDateRange((prev) => ({ ...prev, to: date }))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Delivery Rate</Label>
                      <span className="text-sm text-muted-foreground">
                        {deliveryRateRange[0]}% - {deliveryRateRange[1]}%
                      </span>
                    </div>
                    <Slider
                      defaultValue={[0, 100]}
                      value={deliveryRateRange}
                      onValueChange={setDeliveryRateRange}
                      max={100}
                      step={5}
                      className="py-2"
                    />
                  </div>

                  <Button
                    className="w-full bg-rip-red hover:bg-rip-red/90 text-white"
                    onClick={() => setIsFilterOpen(false)}
                  >
                    Apply Filters
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Dialog open={isCreateCampaignOpen} onOpenChange={setIsCreateCampaignOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="flex items-center gap-2 bg-rip-red hover:bg-rip-red/90 text-white"
                  disabled={selectedDomain?.id === "all"}
                  title={selectedDomain?.id === "all" ? "Select a specific domain to create campaigns" : ""}
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">New Campaign</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Campaign</DialogTitle>
                  <DialogDescription>
                    Create a new campaign to track email delivery and inbox placement.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="subject">Email Subject *</Label>
                    <Input
                      id="subject"
                      placeholder="Your email subject line"
                      value={newCampaign.subject}
                      onChange={(e) => setNewCampaign((prev) => ({ ...prev, subject: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="sender">Sender Name *</Label>
                    <Input
                      id="sender"
                      placeholder="Your Company"
                      value={newCampaign.sender}
                      onChange={(e) => setNewCampaign((prev) => ({ ...prev, sender: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="fromEmail">From Email *</Label>
                    <Input
                      id="fromEmail"
                      type="email"
                      placeholder="noreply@yourcompany.com"
                      value={newCampaign.fromEmail}
                      onChange={(e) => setNewCampaign((prev) => ({ ...prev, fromEmail: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateCampaignOpen(false)} disabled={creatingCampaign}>
                    Cancel
                  </Button>
                  <Button
                    className="bg-rip-red hover:bg-rip-red/90 text-white"
                    onClick={handleCreateCampaign}
                    disabled={creatingCampaign}
                  >
                    {creatingCampaign ? (
                      <>
                        <Loader2 size={16} className="mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create Campaign"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Last updated: <span className="font-medium">{lastUpdated}</span>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search campaigns..."
            className="pl-8"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {filtersActive && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Active filters:</span>
          {(dateRange.from || dateRange.to) && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Calendar size={12} />
              {dateRange.from ? format(dateRange.from, "MMM d") : "Any"} -{" "}
              {dateRange.to ? format(dateRange.to, "MMM d") : "Any"}
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 p-0"
                onClick={() => setDateRange({ from: undefined, to: undefined })}
              >
                <X size={10} />
              </Button>
            </Badge>
          )}
          {(deliveryRateRange[0] > 0 || deliveryRateRange[1] < 100) && (
            <Badge variant="outline" className="flex items-center gap-1">
              <span>
                Delivery: {deliveryRateRange[0]}% - {deliveryRateRange[1]}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 ml-1 p-0"
                onClick={() => setDeliveryRateRange([0, 100])}
              >
                <X size={10} />
              </Button>
            </Badge>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
            Clear all
          </Button>
        </div>
      )}

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>From Email</TableHead>
              <TableHead>Delivery Rate</TableHead>
              <TableHead>Date</TableHead>
              {selectedDomain?.id === "all" && <TableHead>Domain</TableHead>}
              <TableHead className="w-[150px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={selectedDomain?.id === "all" ? 7 : 6} className="text-center py-12">
                  <div className="flex justify-center">
                    <Loader2 size={24} className="animate-spin text-rip-red" />
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredCampaigns.length > 0 ? (
              filteredCampaigns.map((campaign) => {
                const stats = calculateDeliveryStats(campaign)
                return (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.subject}</TableCell>
                    <TableCell>{campaign.sender}</TableCell>
                    <TableCell>{campaign.fromEmail}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-20 bg-gray-200 rounded-full h-2 relative overflow-hidden">
                          {/* Inbox delivery (green) */}
                          <div
                            className="bg-green-500 h-2 absolute left-0 top-0"
                            style={{ width: `${stats.inboxRate}%` }}
                          ></div>
                          {/* Spam delivery (red) */}
                          <div
                            className="h-2 absolute top-0"
                            style={{
                              left: `${stats.inboxRate}%`,
                              width: `${stats.spamRate}%`,
                              backgroundColor: "#ea3947",
                            }}
                          ></div>
                        </div>
                        <div className="text-sm">
                          <div className="font-medium">{Math.round(stats.totalDeliveryRate)}%</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              {Math.round(stats.inboxRate)}%
                            </span>
                            <span className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ea3947" }}></div>
                              {Math.round(stats.spamRate)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{new Date(campaign.sentDate).toLocaleDateString()}</TableCell>
                    {selectedDomain?.id === "all" && (
                      <TableCell>
                        <Badge variant="outline">{campaign.domain?.name || "Unknown"}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View Details"
                          onClick={() => handleViewDetails(campaign)}
                        >
                          <Eye size={16} className="text-green-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCampaign(campaign.id)}
                          disabled={deletingCampaignId === campaign.id}
                          className="h-8 w-8"
                          title="Delete Campaign"
                        >
                          {deletingCampaignId === campaign.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Trash size={16} className="text-red-500" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={selectedDomain?.id === "all" ? 7 : 6}
                  className="text-center py-12 text-muted-foreground"
                >
                  {campaigns.length === 0
                    ? "No campaigns created yet. Create your first campaign to start tracking email delivery."
                    : "No campaigns match your current filters."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Campaign Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="!max-w-[98vw] !w-[98vw] max-h-[95vh] h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Campaign Details</DialogTitle>
            <DialogDescription className="truncate">{selectedCampaign?.subject}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 min-w-0">
            {loadingDetails ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
                  <p>Loading campaign details...</p>
                </div>
              </div>
            ) : campaignDetails ? (
              <div className="space-y-6 min-w-0">
                {/* Campaign Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-rip-red">
                        {Math.round(campaignDetails.deliveryRate * 100)}%
                      </div>
                      <div className="text-sm text-muted-foreground">Overall Delivery Rate</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{campaignDetails.results?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Responses</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-600">
                        {campaignDetails.results?.filter((r: any) => r.inboxed).length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Inbox Deliveries</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Campaign Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Campaign Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="min-w-0">
                        <Label className="text-sm font-medium">Subject</Label>
                        <p className="text-sm break-words">{campaignDetails.subject}</p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-sm font-medium">Sender</Label>
                        <p className="text-sm break-words">{campaignDetails.sender}</p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-sm font-medium">From Email</Label>
                        <p className="text-sm break-all">{campaignDetails.fromEmail}</p>
                      </div>
                      <div className="min-w-0">
                        <Label className="text-sm font-medium">Sent Date</Label>
                        <p className="text-sm">{new Date(campaignDetails.sentDate).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Provider Breakdown */}
                {campaignDetails.summaryData && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Provider Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {Object.entries(JSON.parse(campaignDetails.summaryData)).map(
                          ([provider, stats]: [string, any]) => (
                            <div
                              key={provider}
                              className="flex items-center justify-between gap-4 p-3 border rounded-lg"
                            >
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div className="capitalize font-medium min-w-[80px]">{provider}</div>
                                <Badge variant="outline">{stats.total} total</Badge>
                              </div>
                              <div className="flex items-center gap-4 flex-wrap">
                                <span className="text-green-600 font-medium whitespace-nowrap text-sm">
                                  {stats.inbox} inbox
                                </span>
                                <span className="text-muted-foreground">•</span>
                                <span className="text-red-600 font-medium whitespace-nowrap text-sm">
                                  {stats.spam} spam
                                </span>
                                {stats.not_found > 0 && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-orange-600 font-medium whitespace-nowrap text-sm">
                                      {stats.not_found} not delivered
                                    </span>
                                  </>
                                )}
                                {stats.connection_error > 0 && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-gray-600 font-medium whitespace-nowrap text-sm">
                                      {stats.connection_error} error
                                    </span>
                                  </>
                                )}
                                <span className="text-sm font-medium whitespace-nowrap ml-2">
                                  {Math.round((stats.inbox / stats.total) * 100)}%
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Fallback to old provider breakdown if summaryData doesn't exist */}
                {!campaignDetails.summaryData && campaignDetails.results && campaignDetails.results.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Provider Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {Object.entries(
                          campaignDetails.results.reduce((acc: any, result: any) => {
                            const provider = result.emailProvider || "unknown"
                            if (!acc[provider]) {
                              acc[provider] = { total: 0, inbox: 0, spam: 0, not_found: 0, connection_error: 0 }
                            }
                            acc[provider].total++
                            if (result.placementStatus === "inbox") {
                              acc[provider].inbox++
                            } else if (result.placementStatus === "spam") {
                              acc[provider].spam++
                            } else if (
                              result.placementStatus === "not_found" ||
                              result.placementStatus === "not_delivered"
                            ) {
                              acc[provider].not_found++
                            } else if (result.placementStatus === "error") {
                              acc[provider].connection_error++
                            }
                            return acc
                          }, {}),
                        ).map(([provider, stats]: [string, any]) => (
                          <div
                            key={provider}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg min-w-0"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
                              <div className="capitalize font-medium">{provider}</div>
                              <Badge variant="outline">{stats.total} total</Badge>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
                              <div className="text-sm flex flex-wrap items-center gap-2 min-w-0">
                                <span className="text-green-600 font-medium whitespace-nowrap">
                                  {stats.inbox} inbox
                                </span>
                                <span className="text-muted-foreground">•</span>
                                <span className="text-red-600 font-medium whitespace-nowrap">{stats.spam} spam</span>
                                {stats.not_found > 0 && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-orange-600 font-medium whitespace-nowrap">
                                      {stats.not_found} not delivered
                                    </span>
                                  </>
                                )}
                                {stats.connection_error > 0 && (
                                  <>
                                    <span className="text-muted-foreground">•</span>
                                    <span className="text-gray-600 font-medium whitespace-nowrap">
                                      {stats.connection_error} error
                                    </span>
                                  </>
                                )}
                              </div>
                              <div className="text-sm font-medium whitespace-nowrap flex-shrink-0">
                                {Math.round((stats.inbox / stats.total) * 100)}%
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Email Interaction Details */}
                {campaignDetails.results && campaignDetails.results.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Email Interaction Details</CardTitle>
                      <CardDescription>See which seed accounts interacted with specific emails</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {(() => {
                          // Group results by sender email
                          const emailGroups = campaignDetails.results.reduce((acc: any, result: any) => {
                            // Try to extract sender from campaign data or use a generic key
                            const senderKey = result.emailSender || campaignDetails.fromEmail || "Unknown Sender"
                            if (!acc[senderKey]) {
                              acc[senderKey] = {
                                sender: senderKey,
                                interactions: [],
                                totalSent: 0,
                                totalOpened: 0,
                                totalInboxed: 0,
                              }
                            }
                            acc[senderKey].interactions.push(result)
                            acc[senderKey].totalSent++
                            if (result.delivered) acc[senderKey].totalOpened++
                            if (result.inboxed) acc[senderKey].totalInboxed++
                            return acc
                          }, {})

                          return Object.values(emailGroups).map((group: any, index: number) => (
                            <div key={index} className="border rounded-lg p-4">
                              <div className="flex items-center justify-between mb-3">
                                <div>
                                  <h4 className="font-medium">{group.sender}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {group.totalOpened}/{group.totalSent} opened (
                                    {Math.round((group.totalOpened / group.totalSent) * 100)}%) • {group.totalInboxed}{" "}
                                    in inbox
                                  </p>
                                </div>
                                <Badge variant="outline">{group.interactions.length} accounts</Badge>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {group.interactions.map((result: any) => (
                                  <div
                                    key={result.id}
                                    className={`p-2 rounded text-xs border ${
                                      result.delivered
                                        ? result.inboxed
                                          ? "bg-green-50 border-green-200 text-green-800"
                                          : "bg-orange-50 border-orange-200 text-orange-800"
                                        : "bg-gray-50 border-gray-200 text-gray-600"
                                    }`}
                                  >
                                    <div className="font-medium">{result.seedEmail}</div>
                                    <div className="flex items-center gap-1 mt-1">
                                      {result.delivered ? (
                                        result.inboxed ? (
                                          <>
                                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                            <span>Inbox</span>
                                          </>
                                        ) : (
                                          <>
                                            <div
                                              className="w-2 h-2 rounded-full"
                                              style={{ backgroundColor: "#ea3947" }}
                                            ></div>
                                            <span>Spam</span>
                                          </>
                                        )
                                      ) : (
                                        <>
                                          <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                          <span>Not Delivered</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        })()}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Detailed Results */}
                {campaignDetails.results && campaignDetails.results.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Detailed Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="border rounded-md">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Seed Email</TableHead>
                              <TableHead>Provider</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Placement</TableHead>
                              <TableHead>Received</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {campaignDetails.results.map((result: any) => (
                              <TableRow key={result.id}>
                                <TableCell className="font-mono text-sm">{result.seedEmail}</TableCell>
                                <TableCell className="capitalize">{result.emailProvider || "unknown"}</TableCell>
                                <TableCell>
                                  {result.delivered ? (
                                    <Badge className="bg-green-100 text-green-800">Delivered</Badge>
                                  ) : (
                                    <Badge variant="destructive">Not Delivered</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {result.placementStatus === "inbox" ? (
                                    <Badge className="bg-blue-100 text-blue-800">Inbox</Badge>
                                  ) : result.placementStatus === "spam" ? (
                                    <Badge className="bg-orange-100 text-orange-800">Spam</Badge>
                                  ) : result.placementStatus === "not_found" ||
                                    result.placementStatus === "not_delivered" ? (
                                    <Badge className="bg-yellow-100 text-yellow-800">Not Delivered</Badge>
                                  ) : result.placementStatus === "error" ? (
                                    <Badge className="bg-gray-100 text-gray-800">Error</Badge>
                                  ) : (
                                    <Badge variant="outline">Unknown</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {result.forwardedAt ? new Date(result.forwardedAt).toLocaleString() : "N/A"}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
