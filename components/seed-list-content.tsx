"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  RefreshCw,
  Upload,
  DownloadCloud,
  Search,
  Trash,
  Wifi,
  CheckCircle,
  Info,
  FolderOpen,
  Lock,
  Unlock,
  XCircle,
  Shuffle,
  Download,
  CheckCircle2,
} from "lucide-react"
import { toast } from "sonner"
import { useDomain } from "@/lib/domain-context"

export default function SeedListContent({
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
      const response = await fetch("/api/guides/seed-setup-guide")
      const data = await response.json()

      if (!response.ok || !data.url) {
        throw new Error("Failed to get guide URL")
      }

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

  const fetchSeedEmails = async () => {
    if (!selectedDomain) return

    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedDomain.id !== "all") {
        params.append("domainId", selectedDomain.id)
      }
      if (clientSlug && clientSlug !== "admin") {
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

      fetchSeedEmails()
    } catch (error) {
      console.error("Error importing seed emails:", error)
      toast.error(error instanceof Error ? error.message : "Failed to import seed emails")
    } finally {
      setLoading(false)
      e.target.value = ""
    }
  }

  const exportToCSV = async () => {
    if (!selectedDomain) {
      toast.error("Please select a domain first")
      return
    }

    try {
      setLoading(true)

      const params = new URLSearchParams()
      if (clientSlug && clientSlug !== "admin") {
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

      const contentDisposition = response.headers.get("Content-Disposition")
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/)
      const filename = filenameMatch
        ? filenameMatch[1]
        : `seed-emails-${clientSlug}-${new Date().toISOString().split("T")[0]}.txt`

      const blob = await response.blob()

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
      (email) => !email.locked && (!email.assignedToClient || email.assignedToClient === "RIP"),
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
              {!isAdminView && <TableHead>Provider</TableHead>}
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
