"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Slider } from "@/components/ui/slider"
import { Search, Filter, Plus, Loader2, Eye, Trash, Calendar, X } from "lucide-react"
import { toast } from "sonner"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { useDomain } from "@/lib/domain-context"
import AppLayout from "@/components/app-layout" // Import AppLayout

export default function InboxCampaignsPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  const [isAdminView, setIsAdminView] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)

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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()
        setUserRole(user.role)

        // Check if this is the admin route
        const isAdmin = clientSlug === "admin"
        setIsAdminView(isAdmin)

        // If non-super_admin tries to access admin route, redirect
        if (isAdmin && user.role !== "super_admin") {
          const clientResponse = await fetch("/api/client/slug", {
            credentials: "include",
          })
          if (clientResponse.ok) {
            const { slug } = await clientResponse.json()
            router.push(`/${slug}/inbox/campaigns`)
          } else {
            router.push("/login")
          }
          return
        }

        setAuthChecked(true)
      } catch (error) {
        console.error("Auth check error:", error)
        router.push("/login")
      }
    }

    checkAuth()
  }, [clientSlug, router])

  // Fetch campaigns on mount and when selectedDomain changes
  useEffect(() => {
    if (selectedDomain && authChecked) {
      fetchCampaigns()
    }
  }, [selectedDomain, authChecked])

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

      if (clientSlug && !isAdminView) {
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

  if (!authChecked) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminView}>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col sm:flex-col sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Email Campaigns</h2>
            <p className="text-sm text-muted-foreground">Monitor inbox placement for your email campaigns</p>
          </div>
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
    </AppLayout>
  )
}
