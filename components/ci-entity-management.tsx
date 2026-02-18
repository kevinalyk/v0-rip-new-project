"use client"

import { DialogFooter } from "@/components/ui/dialog"

import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Plus,
  Mail,
  Building2,
  Users,
  User,
  Pencil,
  Database,
  Trash2,
  Search,
  Filter,
  X,
  ZoomIn,
  ZoomOut,
  ChevronsUpDown,
  Check,
  ArrowRight,
  Phone,
  Smartphone,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { toast } from "sonner"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { cn } from "@/lib/utils" // Assuming cn utility is available
import type { DonationIdentifiers } from "@/lib/ci-entity-utils"

interface CiEntityManagementProps {
  clientSlug: string
}

type Entity = {
  id: string
  name: string
  type: string
  description: string | null
  party: string | null
  state: string | null
  donationIdentifiers?: DonationIdentifiers | null
  _count?: {
    campaigns: number
    smsMessages: number
    totalCommunications: number
    mappings: number
  }
  createdAt: Date
  updatedAt: Date
}

interface Campaign {
  id: string
  senderName: string
  senderEmail: string
  subject: string
  dateReceived: string
  inboxRate: number
  type?: "email" | "sms"
  phoneNumber?: string
  message?: string
  emailContent?: string | null
  ctaLinks?: string[] | Array<{ url: string; finalUrl?: string; type: string }>
  entity?: {
    // Added for data broker campaigns
    id: string
    name: string
    type: string
    party: string | null
  }
  emailPreview?: string // For SMS preview
}

interface EntityMapping {
  id: string
  senderEmail: string | null
  senderDomain: string | null
  senderPhone: string | null
  createdAt: string
}

export function CiEntityManagement({ clientSlug }: CiEntityManagementProps) {
  const router = useRouter()
  const [entities, setEntities] = useState<Entity[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 100,
    totalCount: 0,
    totalPages: 0,
  })
  const [unassignedCampaigns, setUnassignedCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showAssignDialog, setShowAssignDialog] = useState(false)
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])
  const [selectedEntity, setSelectedEntity] = useState<string>("")
  const [createMapping, setCreateMapping] = useState(true)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [entityToDelete, setEntityToDelete] = useState<Entity | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Create/Edit entity form
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null)
  const [newEntityName, setNewEntityName] = useState("")
  const [newEntityType, setNewEntityType] = useState("candidate") // Changed from "politician"
  const [newEntityDescription, setNewEntityDescription] = useState("")
  const [newEntityTag, setNewEntityTag] = useState("") // Kept this state
  const [newEntityParty, setNewEntityParty] = useState("")
  const [newEntityState, setNewEntityState] = useState("")
  const [newEntityNationwide, setNewEntityNationwide] = useState(false)
  const [newEntityDonationIdentifiers, setNewEntityDonationIdentifiers] = useState<DonationIdentifiers>({})

  const [donationIdentifierInputs, setDonationIdentifierInputs] = useState<{
    winred: string
    anedot: string
  }>({
    winred: "",
    anedot: "",
  })

  const [entityMappings, setEntityMappings] = useState<EntityMapping[]>([])
  const [newMappingInput, setNewMappingInput] = useState("")
  const [loadingMappings, setLoadingMappings] = useState(false)

  // Assign Dialog state
  const [isCreatingNewEntity, setIsCreatingNewEntity] = useState(false)
  const [assignEntityName, setAssignEntityName] = useState("")
  const [assignEntityType, setAssignEntityType] = useState("candidate") // Changed from "politician"
  const [assignEntityDescription, setAssignEntityDescription] = useState("")
  const [assignEntityTag, setAssignEntityTag] = useState("") // Kept this state
  const [assignEntityParty, setAssignEntityParty] = useState("")
  const [assignEntityState, setAssignEntityState] = useState("")
  const [assignEntityNationwide, setAssignEntityNationwide] = useState(false)
  // </CHANGE> Add donation identifiers state for assign dialog
  const [assignEntityDonationIdentifiers, setAssignEntityDonationIdentifiers] = useState<DonationIdentifiers>({})

  const [showDeleteMessageDialog, setShowDeleteMessageDialog] = useState(false)
  const [messageToDelete, setMessageToDelete] = useState<Campaign | null>(null)
  const [isDeletingMessage, setIsDeletingMessage] = useState(false)

  const [selectedPreviewCampaign, setSelectedPreviewCampaign] = useState<Campaign | null>(null)
  const [emailZoom, setEmailZoom] = useState(100)

  const [openEntitySearch, setOpenEntitySearch] = useState(false)
  const [allEntitiesForAssignment, setAllEntitiesForAssignment] = useState<Entity[]>([])
  const [loadingAllEntities, setLoadingAllEntities] = useState(false)

  const [recentAssignments, setRecentAssignments] = useState<any[]>([])
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const [dataBrokerCampaigns, setDataBrokerCampaigns] = useState<Campaign[]>([])
  const [loadingDataBroker, setLoadingDataBroker] = useState(false)
  const [selectedDataBrokerCampaign, setSelectedDataBrokerCampaign] = useState<Campaign | null>(null)
  const [showReassignDialog, setShowReassignDialog] = useState(false)
  const [reassignEntityId, setReassignEntityId] = useState("")

  const US_STATES = [
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WY",
  ]

  const [filterParty, setFilterParty] = useState<string>("all")
  const [filterState, setFilterState] = useState<string>("all")
  const [filterType, setFilterType] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  const [activeTab, setActiveTab] = useState("unassigned")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const fetchAllEntitiesForAssignment = async () => {
    setLoadingAllEntities(true)
    try {
      const response = await fetch("/api/ci-entities?pageSize=1000")

      if (response.ok) {
        const data = await response.json()
        setAllEntitiesForAssignment(data.entities || [])
      }
    } catch (error) {
      console.error("Error fetching all entities:", error)
    } finally {
      setLoadingAllEntities(false)
    }
  }

  useEffect(() => {
    if (showAssignDialog) {
      fetchAllEntitiesForAssignment()
    }
  }, [showAssignDialog])

  const fetchRecentAssignments = async () => {
    setLoadingAssignments(true)
    try {
      const response = await fetch("/api/ci-entities/recent-assignments?limit=50")
      if (response.ok) {
        const data = await response.json()
        setRecentAssignments(data.assignments)
      }
    } catch (error) {
      console.error("[v0] Error fetching recent assignments:", error)
    } finally {
      setLoadingAssignments(false)
    }
  }

  const fetchDataBrokerCampaigns = async () => {
    setLoadingDataBroker(true)
    try {
      const response = await fetch("/api/ci-entities/data-broker-campaigns")
      if (response.ok) {
        const data = await response.json()
        setDataBrokerCampaigns(data.campaigns || [])
      } else {
        console.error("[v0] Failed to fetch data broker campaigns:", response.status, await response.text())
      }
    } catch (error) {
      console.error("[v0] Error fetching data broker campaigns:", error)
      toast.error("Failed to load data broker campaigns")
    } finally {
      setLoadingDataBroker(false)
    }
  }

  useEffect(() => {
    if (activeTab === "data-broker") {
      fetchDataBrokerCampaigns()
    }
  }, [activeTab])

  useEffect(() => {
    if (activeTab === "recent-assignments") {
      fetchRecentAssignments()
    }
  }, [activeTab])

  const filteredEntities = useMemo(() => {
    return entities
  }, [entities])

  const entitySummary = useMemo(() => {
    const summary = {
      total: pagination.totalCount,
      byParty: {} as Record<string, number>,
      byState: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      totalCampaigns: 0,
    }

    // Calculate from visible entities
    entities.forEach((entity) => {
      const party = entity.party
        ? entity.party.charAt(0).toUpperCase() + entity.party.slice(1).toLowerCase()
        : "Unknown"
      summary.byParty[party] = (summary.byParty[party] || 0) + 1

      const state = entity.state || "Unknown"
      summary.byState[state] = (summary.byState[state] || 0) + 1

      const type = entity.type || "Unknown"
      summary.byType[type] = (summary.byType[type] || 0) + 1

      summary.totalCampaigns += entity._count?.campaigns || 0
    })

    return summary
  }, [entities, pagination.totalCount])

  const fetchData = async () => {
    try {
      setLoading(true)

      // Build query params for filtering
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      })

      if (filterParty !== "all") params.append("party", filterParty)
      if (filterState !== "all") params.append("state", filterState)
      if (filterType !== "all") params.append("type", filterType)
      if (debouncedSearch) params.append("search", debouncedSearch)

      const [entitiesRes, unassignedRes] = await Promise.all([
        fetch(`/api/ci-entities?${params.toString()}`),
        fetch("/api/ci-entities?action=unassigned"),
      ])

      if (entitiesRes.ok) {
        const data = await entitiesRes.json()
        setEntities(data.entities || [])
        setPagination(data.pagination)
      }

      if (unassignedRes.ok) {
        const data = await unassignedRes.json()
        const emails = (data.campaigns || []).map((c: Campaign) => ({ ...c, type: "email" as const }))
        const sms = (data.smsMessages || []).map((s: any) => ({
          id: s.id,
          senderName: s.phoneNumber,
          senderEmail: s.phoneNumber,
          subject: s.message?.substring(0, 100) || "SMS Message",
          dateReceived: s.createdAt,
          inboxRate: 100,
          type: "sms" as const,
          phoneNumber: s.phoneNumber,
          message: s.message,
          ctaLinks: s.ctaLinks, // Added this line to include CTA links
        }))
        setUnassignedCampaigns([...emails, ...sms])
      }
    } catch (error) {
      console.error("Error fetching CI entity data:", error)
      toast.error("Failed to load CI entities")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [pagination.page, filterParty, filterState, filterType, debouncedSearch]) // Added debouncedSearch to dependency array

  const handleFilterChange = (type: "party" | "state" | "type", value: string) => {
    setPagination((prev) => ({ ...prev, page: 1 }))

    if (type === "party") setFilterParty(value)
    if (type === "state") setFilterState(value)
    if (type === "type") setFilterType(value)
  }

  const handleCreateEntity = async () => {
    if (!newEntityName.trim()) return

    try {
      if (editingEntityId) {
        // Update existing entity
        const response = await fetch("/api/ci-entities", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingEntityId,
            name: newEntityName,
            type: newEntityType,
            description: newEntityDescription || undefined,
            party: newEntityParty || undefined,
            state: newEntityState || undefined,
            tag: newEntityTag || undefined,
            donationIdentifiers: newEntityDonationIdentifiers,
          }),
        })

        if (response.ok) {
          setShowCreateDialog(false)
          setEditingEntityId(null)
          setNewEntityName("")
          setNewEntityType("candidate") // Changed from "politician"
          setNewEntityDescription("")
          setNewEntityTag("")
          setNewEntityParty("")
          setNewEntityState("")
          setNewEntityNationwide(false)
          setNewEntityDonationIdentifiers({})
          setDonationIdentifierInputs({ winred: "", anedot: "" }) // Reset raw inputs too
          fetchData()
          toast.success("Entity updated successfully!")
        } else {
          const data = await response.json()
          toast.error(data.error || "Failed to update entity")
        }
      } else {
        // Create new entity
        const response = await fetch("/api/ci-entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newEntityName,
            type: newEntityType,
            description: newEntityDescription || undefined,
            party: newEntityParty || undefined,
            state: newEntityState || undefined,
            tag: newEntityTag || undefined,
            donationIdentifiers: newEntityDonationIdentifiers,
          }),
        })

        if (response.ok) {
          setShowCreateDialog(false)
          setNewEntityName("")
          setNewEntityType("candidate") // Changed from "politician"
          setNewEntityDescription("")
          setNewEntityTag("")
          setNewEntityParty("")
          setNewEntityState("")
          setNewEntityNationwide(false)
          setNewEntityDonationIdentifiers({})
          setDonationIdentifierInputs({ winred: "", anedot: "" }) // Reset raw inputs too
          fetchData()
          toast.success("Entity created successfully!")
        } else {
          const data = await response.json()
          toast.error(data.error || "Failed to create entity")
        }
      }
    } catch (error) {
      console.error("Error saving entity:", error)
      toast.error("An error occurred while saving the entity.")
    }
  }

  const handleAssignCampaigns = async () => {
    if (selectedCampaigns.length === 0) return

    try {
      if (isCreatingNewEntity) {
        if (!assignEntityName.trim()) return

        // Create the entity
        const createResponse = await fetch("/api/ci-entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: assignEntityName,
            type: assignEntityType,
            description: assignEntityDescription || undefined,
            party: assignEntityParty || undefined,
            state: assignEntityState || undefined,
            tag: assignEntityTag || undefined,
            donationIdentifiers: assignEntityDonationIdentifiers,
          }),
        })

        if (!createResponse.ok) {
          const data = await createResponse.json()
          toast.error(data.error || "Error creating entity")
          return
        }

        const { entity } = await createResponse.json()

        const selectedEmails = selectedCampaigns.filter((id) => {
          const campaign = unassignedCampaigns.find((c) => c.id === id)
          return campaign?.type === "email"
        })

        const selectedSms = selectedCampaigns.filter((id) => {
          const campaign = unassignedCampaigns.find((c) => c.id === id)
          return campaign?.type === "sms"
        })

        // Assign campaigns to the newly created entity
        const assignResponse = await fetch("/api/ci-entities/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignIds: selectedEmails.length > 0 ? selectedEmails : undefined,
            smsIds: selectedSms.length > 0 ? selectedSms : undefined,
            entityId: entity.id,
            createMapping,
          }),
        })

        if (assignResponse.ok) {
          setShowAssignDialog(false)
          setSelectedCampaigns([])
          setIsCreatingNewEntity(false)
          setAssignEntityName("")
          setAssignEntityType("candidate") // Changed from "politician"
          setAssignEntityDescription("")
          setAssignEntityTag("")
          setAssignEntityParty("")
          setAssignEntityState("")
          setAssignEntityNationwide(false)
          setAssignEntityDonationIdentifiers({}) // Clear donation identifiers
          setDonationIdentifierInputs({ winred: "", anedot: "" }) // Clear raw inputs
          setCreateMapping(true)
          fetchData()
          toast.success("Campaigns assigned to new entity!")
        } else {
          const data = await assignResponse.json()
          toast.error(data.error || "Failed to assign campaigns")
        }
      } else {
        // Existing logic for assigning to existing entity
        if (!selectedEntity) return

        const selectedEmails = selectedCampaigns.filter((id) => {
          const campaign = unassignedCampaigns.find((c) => c.id === id)
          return campaign?.type === "email"
        })

        const selectedSms = selectedCampaigns.filter((id) => {
          const campaign = unassignedCampaigns.find((c) => c.id === id)
          return campaign?.type === "sms"
        })

        const response = await fetch("/api/ci-entities/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignIds: selectedEmails.length > 0 ? selectedEmails : undefined,
            smsIds: selectedSms.length > 0 ? selectedSms : undefined,
            entityId: selectedEntity,
            createMapping,
          }),
        })

        if (response.ok) {
          setShowAssignDialog(false)
          setSelectedCampaigns([])
          setSelectedEntity("")
          setCreateMapping(true)
          setSelectedPreviewCampaign(null)
          fetchData()
          toast.success("Campaigns assigned successfully!")
        } else {
          const data = await response.json()
          toast.error(data.error || "Failed to assign campaigns")
        }
      }
    } catch (error) {
      console.error("Error assigning campaigns:", error)
      toast.error("An error occurred while assigning campaigns.")
    }
  }

  const toggleCampaignSelection = (campaignId: string) => {
    setSelectedCampaigns((prev) =>
      prev.includes(campaignId) ? prev.filter((id) => id !== campaignId) : [...prev, campaignId],
    )
  }

  const getEntityIcon = (type: string) => {
    switch (type) {
      case "candidate": // Changed from "politician"
        return <User className="h-4 w-4" />
      case "pac":
        return <Users className="h-4 w-4" />
      case "organization":
        return <Building2 className="h-4 w-4" />
      case "data_broker":
        return <Database className="h-4 w-4" />
      default:
        return <Mail className="h-4 w-4" />
    }
  }

  const handleEditEntity = (entity: Entity) => {
    setEditingEntityId(entity.id)
    setNewEntityName(entity.name)
    setNewEntityType(entity.type)
    setNewEntityDescription(entity.description || "")
    setNewEntityTag(entity.tag || "") // Set tag
    setNewEntityParty(entity.party || "")
    const isNationwide = entity.state === "Nationwide"
    setNewEntityNationwide(isNationwide)
    setNewEntityState(isNationwide ? "" : entity.state || "")
    setNewEntityDonationIdentifiers(entity.donationIdentifiers || {}) // Set donation identifiers

    // Initialize raw input state based on existing donation identifiers
    setDonationIdentifierInputs({
      winred: entity.donationIdentifiers?.winred?.join(", ") || "",
      anedot: entity.donationIdentifiers?.anedot?.join(", ") || "",
    })

    // position is removed
    setShowCreateDialog(true)
    fetchEntityMappings(entity.id)
  }

  const fetchEntityMappings = async (entityId: string) => {
    try {
      setLoadingMappings(true)
      const response = await fetch(`/api/ci-entities/mappings?entityId=${entityId}`)
      if (response.ok) {
        const data = await response.json()
        setEntityMappings(data.mappings || [])
      }
    } catch (error) {
      console.error("Error fetching mappings:", error)
      toast.error("Failed to load entity mappings.")
    } finally {
      setLoadingMappings(false)
    }
  }

  const handleAddMapping = async () => {
    if (!newMappingInput.trim() || !editingEntityId) return

    try {
      const response = await fetch("/api/ci-entities/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: editingEntityId,
          emailOrDomain: newMappingInput.trim(),
        }),
      })

      if (response.ok) {
        setNewMappingInput("")
        fetchEntityMappings(editingEntityId)
        fetchData() // Refresh to update mapping counts
        toast.success("Mapping added successfully!")
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to add mapping")
      }
    } catch (error) {
      console.error("Error adding mapping:", error)
      toast.error("Failed to add mapping")
    }
  }

  const handleRemoveMapping = async (mappingId: string) => {
    if (!editingEntityId) return

    try {
      const response = await fetch(`/api/ci-entities?mappingId=${mappingId}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchEntityMappings(editingEntityId)
        fetchData() // Refresh to update mapping counts
        toast.success("Mapping removed successfully!")
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to remove mapping")
      }
    } catch (error) {
      console.error("Error removing mapping:", error)
      toast.error("Failed to remove mapping")
    }
  }

  const handleCloseCreateDialog = (open: boolean) => {
    setShowCreateDialog(open)
    if (!open) {
      // Reset form when closing
      setEditingEntityId(null)
      setNewEntityName("")
      setNewEntityType("candidate") // Changed from "politician"
      setNewEntityDescription("")
      setNewEntityTag("")
      setNewEntityParty("")
      setNewEntityState("")
      setNewEntityNationwide(false)
      setEntityMappings([])
      setNewMappingInput("")
      // Reset donation identifiers on close
      setNewEntityDonationIdentifiers({})
      // Reset raw inputs when closing the dialog
      setDonationIdentifierInputs({ winred: "", anedot: "" })
    }
  }

  const getPartyColor = (party: string | null) => {
    if (!party) return "secondary"
    switch (party.toLowerCase()) {
      case "republican":
        return "destructive" // red
      case "democrat":
        return "default" // blue
      case "independent":
        return "secondary" // gray
      default:
        return "secondary"
    }
  }

  const getPartyBadgeClassName = (party: string | null) => {
    if (!party) return "capitalize"
    switch (party.toLowerCase()) {
      case "republican":
        return "bg-red-600 text-white hover:bg-red-700 capitalize"
      case "democrat":
        return "bg-blue-600 text-white hover:bg-blue-700 capitalize"
      case "independent":
        return "bg-gray-600 text-white hover:bg-gray-700 capitalize"
      default:
        return "capitalize"
    }
  }

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case "candidate": // Changed from "politician"
        return "bg-violet-700 text-white hover:bg-violet-800"
      case "pac":
        return "bg-amber-700 text-white hover:bg-amber-800"
      case "organization":
        return "bg-emerald-700 text-white hover:bg-emerald-800"
      case "data_broker":
        return "bg-teal-700 text-white hover:bg-teal-800"
      default:
        return "bg-gray-600 text-white hover:bg-gray-700"
    }
  }

  const formatTypeName = (type: string) => {
    switch (type) {
      case "candidate":
        return "Candidate"
      case "pac":
        return "PAC"
      case "organization":
        return "Organization"
      case "data_broker":
        return "Data Broker"
      case "nonprofit":
        return "Nonprofit"
      case "jfc":
        return "JFC"
      case "state_party":
        return "State Party"
      default:
        return type
    }
  }

  const handleDeleteEntity = async () => {
    if (!entityToDelete) return

    try {
      setIsDeleting(true)
      const response = await fetch(`/api/ci-entities?entityId=${entityToDelete.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        setShowDeleteDialog(false)
        setEntityToDelete(null)
        fetchData() // Refresh the list
        toast.success("Entity deleted successfully!")
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to delete entity")
      }
    } catch (error) {
      console.error("Error deleting entity:", error)
      toast.error("Failed to delete entity")
    } finally {
      setIsDeleting(false)
    }
  }

  const confirmDeleteEntity = (entity: Entity) => {
    setEntityToDelete(entity)
    setShowDeleteDialog(true)
  }

  const handleDeleteMessage = async () => {
    if (!messageToDelete) return

    try {
      setIsDeletingMessage(true)
      const endpoint =
        messageToDelete.type === "sms" ? `/api/sms/${messageToDelete.id}` : `/api/campaigns/${messageToDelete.id}`

      const response = await fetch(endpoint, {
        method: "DELETE",
      })

      if (response.ok) {
        setShowDeleteMessageDialog(false)
        setMessageToDelete(null)
        fetchData() // Refresh the list
        toast.success("Message deleted successfully!")
      } else {
        const data = await response.json()
        toast.error(data.error || "Failed to delete message")
      }
    } catch (error) {
      console.error("Error deleting message:", error)
      toast.error("Failed to delete message")
    } finally {
      setIsDeletingMessage(false)
    }
  }

  const confirmDeleteMessage = (message: Campaign) => {
    setMessageToDelete(message)
    setShowDeleteMessageDialog(true)
  }

  const prepareEmailHtml = (html: string) => {
    if (html.includes("<head>")) {
      return html.replace("<head>", '<head><base target="_blank">')
    } else if (html.includes("<html>")) {
      return html.replace("<html>", '<html><head><base target="_blank"></head>')
    } else {
      return `<head><base target="_blank"></head>${html}`
    }
  }

  const handleZoomIn = () => {
    setEmailZoom((prev) => Math.min(200, prev + 25))
  }

  const handleZoomOut = () => {
    setEmailZoom((prev) => Math.max(50, prev - 25))
  }

  const handleZoomReset = () => {
    setEmailZoom(100)
  }

  const handleReassignCampaign = async () => {
    if (!selectedDataBrokerCampaign || !reassignEntityId) {
      toast.error("Please select an entity")
      return
    }

    try {
      const response = await fetch("/api/ci-entities/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: selectedDataBrokerCampaign.id,
          entityId: reassignEntityId,
          campaignType: selectedDataBrokerCampaign.type,
        }),
      })

      if (response.ok) {
        toast.success("Campaign reassigned successfully")
        setShowReassignDialog(false)
        setSelectedDataBrokerCampaign(null)
        setReassignEntityId("")
        fetchDataBrokerCampaigns() // Refresh the list
      } else {
        toast.error("Failed to reassign campaign")
      }
    } catch (error) {
      console.error("Error reassigning campaign:", error)
      toast.error("Failed to reassign campaign")
    }
  }

  const handleAssignFromPreview = () => {
    if (!selectedPreviewCampaign) return

    // Add the preview campaign to selected campaigns if not already selected
    if (!selectedCampaigns.includes(selectedPreviewCampaign.id)) {
      setSelectedCampaigns([selectedPreviewCampaign.id])
    }

    // Open the assign dialog
    setShowAssignDialog(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading entity management...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 max-w-7xl">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">CI Entity Management</h1>
              <p className="text-muted-foreground">
                Assign competitive insight emails and SMS messages to entities for better organization
              </p>
            </div>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Entity
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="unassigned">Unassigned Messages ({unassignedCampaigns.length})</TabsTrigger>
            <TabsTrigger value="data-broker">Data Broker Campaigns</TabsTrigger>
            <TabsTrigger value="recent-assignments">Recent Assignments</TabsTrigger>
            <TabsTrigger value="entities">Entities ({pagination.totalCount})</TabsTrigger>
          </TabsList>

          <TabsContent value="unassigned" className="space-y-4">
            {unassignedCampaigns.length > 0 && (
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{selectedCampaigns.length} selected</p>
                <Button onClick={() => setShowAssignDialog(true)} disabled={selectedCampaigns.length === 0}>
                  Assign Selected
                </Button>
              </div>
            )}

            <Card>
              <CardContent className="p-0">
                {unassignedCampaigns.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No unassigned messages. All emails and SMS have been assigned to entities!
                  </div>
                ) : (
                  <div className="divide-y">
                    {unassignedCampaigns.map((campaign) => (
                      <div key={campaign.id} className="p-4 hover:bg-muted/30 transition-colors flex items-start gap-4">
                        <Checkbox
                          checked={selectedCampaigns.includes(campaign.id)}
                          onCheckedChange={() => toggleCampaignSelection(campaign.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {campaign.type === "sms" ? (
                                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <Mail className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div className="font-medium truncate">{campaign.senderName}</div>
                                {campaign.type === "sms" && (
                                  <Badge variant="secondary" className="text-xs">
                                    SMS
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground truncate">{campaign.senderEmail}</div>
                              <div className="text-sm mt-1 truncate">{campaign.subject}</div>
                            </div>
                            <div className="text-right flex-shrink-0 flex items-start gap-2">
                              <div>
                                <div className="text-sm text-muted-foreground">
                                  {new Date(campaign.dateReceived).toLocaleDateString()}
                                </div>
                                {campaign.type === "email" && (
                                  <div className="text-sm font-medium">{campaign.inboxRate.toFixed(1)}% inbox</div>
                                )}
                              </div>
                              {((campaign.type === "email" && campaign.emailContent) || campaign.type === "sms") && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedPreviewCampaign(campaign)}
                                  className="h-8"
                                >
                                  Preview
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => confirmDeleteMessage(campaign)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data-broker" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Broker Campaigns</CardTitle>
                <CardDescription>
                  Review and reassign campaigns currently assigned to data broker entities
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loadingDataBroker ? (
                  <div className="text-center py-12 text-muted-foreground">Loading data broker campaigns...</div>
                ) : dataBrokerCampaigns.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No campaigns assigned to data brokers.</div>
                ) : (
                  <div className="divide-y">
                    {dataBrokerCampaigns.map((campaign) => (
                      <div key={campaign.id} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {campaign.type === "sms" ? (
                                <Smartphone className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium truncate">{campaign.senderName}</span>
                              {campaign.type === "sms" && (
                                <Badge variant="secondary" className="text-xs">
                                  SMS
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground truncate">{campaign.senderEmail}</div>
                            <div className="text-sm mt-1 truncate">{campaign.subject}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {campaign.entity?.name || "Unknown Data Broker"}
                              </Badge>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 flex items-start gap-2">
                            <div>
                              <div className="text-sm text-muted-foreground">
                                {new Date(campaign.dateReceived).toLocaleDateString()}
                              </div>
                              {campaign.type === "email" && (
                                <div className="text-sm font-medium">{campaign.inboxRate.toFixed(1)}% inbox</div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPreviewCampaign(campaign)}
                              className="h-8"
                            >
                              Preview
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setSelectedDataBrokerCampaign(campaign)
                                setShowReassignDialog(true)
                                fetchAllEntitiesForAssignment()
                              }}
                              className="h-8"
                            >
                              Reassign
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="recent-assignments" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Assignments (Last 50)</CardTitle>
                <CardDescription>Track all campaign and SMS assignments with their assignment methods</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loadingAssignments ? (
                  <div className="text-center py-12 text-muted-foreground">Loading recent assignments...</div>
                ) : recentAssignments.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No assignments found.</div>
                ) : (
                  <div className="divide-y">
                    {recentAssignments.map((assignment) => (
                      <div
                        key={`${assignment.type}-${assignment.id}`}
                        className="p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {assignment.type === "sms" ? (
                                <Smartphone className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              )}
                              <span className="font-medium truncate">{assignment.title}</span>
                              {assignment.type === "sms" && (
                                <Badge variant="secondary" className="text-xs">
                                  SMS
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground truncate">{assignment.sender}</div>
                            <div className="flex items-center gap-2 mt-2">
                              <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm font-medium">{assignment.entity?.name}</span>
                              {assignment.entity?.party && (
                                <Badge
                                  variant="outline"
                                  className={
                                    assignment.entity.party === "Republican"
                                      ? "border-red-500 text-red-600"
                                      : assignment.entity.party === "Democrat"
                                        ? "border-blue-500 text-blue-600"
                                        : "border-purple-500 text-purple-600"
                                  }
                                >
                                  {assignment.entity.party}
                                </Badge>
                              )}
                              {assignment.assignmentMethod && (
                                <Badge
                                  className={
                                    assignment.assignmentMethod === "manual"
                                      ? "bg-gray-500"
                                      : assignment.assignmentMethod === "auto_winred"
                                        ? "bg-red-600"
                                        : assignment.assignmentMethod === "auto_anedot"
                                          ? "bg-green-600"
                                          : assignment.assignmentMethod === "auto_domain"
                                            ? "bg-blue-600"
                                            : "bg-purple-600"
                                  }
                                >
                                  {assignment.assignmentMethod === "manual"
                                    ? "Manual"
                                    : assignment.assignmentMethod === "auto_winred"
                                      ? "Auto: WinRed"
                                      : assignment.assignmentMethod === "auto_anedot"
                                        ? "Auto: Anedot"
                                        : assignment.assignmentMethod === "auto_domain"
                                          ? "Auto: Domain"
                                          : "Auto: Phone"}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0 flex items-start gap-2">
                            <div>
                              <div className="text-sm text-muted-foreground">
                                {assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleString() : "Unknown"}
                              </div>
                              {assignment.type === "email" && assignment.inboxRate !== null && (
                                <div className="text-sm font-medium">{assignment.inboxRate.toFixed(1)}% inbox</div>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedPreviewCampaign(assignment)}
                              className="h-8"
                            >
                              Preview
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entities" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters & Search
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="search-entities">Search by name</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search-entities"
                      placeholder="Search entities..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Filter Controls */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="filter-party">Filter by Party</Label>
                    <Select value={filterParty} onValueChange={(val) => handleFilterChange("party", val)}>
                      <SelectTrigger id="filter-party">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Parties</SelectItem>
                        <SelectItem value="republican">Republican</SelectItem>
                        <SelectItem value="democrat">Democrat</SelectItem>
                        <SelectItem value="independent">Independent</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="filter-state">Filter by State</Label>
                    <Select value={filterState} onValueChange={(val) => handleFilterChange("state", val)}>
                      <SelectTrigger id="filter-state">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All States</SelectItem>
                        {US_STATES.map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                        <SelectItem value="Nationwide">Nationwide</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="filter-type">Filter by Type</Label>
                    <Select value={filterType} onValueChange={(val) => handleFilterChange("type", val)}>
                      <SelectTrigger id="filter-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="candidate">Candidate</SelectItem>
                        <SelectItem value="pac">PAC</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                        <SelectItem value="data_broker">Data Broker</SelectItem>
                        <SelectItem value="nonprofit">Nonprofit</SelectItem>
                        <SelectItem value="jfc">JFC</SelectItem>
                        <SelectItem value="state_party">State Party</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(filterParty !== "all" || filterState !== "all" || filterType !== "all" || searchQuery) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilterParty("all")
                      setFilterState("all")
                      setFilterType("all")
                      setSearchQuery("")
                      setDebouncedSearch("") // Clear debounced search as well
                      setPagination((prev) => ({ ...prev, page: 1 }))
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}

                {/* Summary Statistics */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Entities</div>
                      <div className="text-2xl font-bold">{entitySummary.total}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Total Campaigns</div>
                      <div className="text-2xl font-bold">{entitySummary.totalCampaigns}</div>
                    </div>
                    {filterParty === "all" && (
                      <>
                        <div>
                          <div className="text-sm text-muted-foreground">Republicans</div>
                          <div className="text-2xl font-bold text-red-600">
                            {entitySummary.byParty["Republican"] || 0}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Democrats</div>
                          <div className="text-2xl font-bold text-blue-600">
                            {entitySummary.byParty["Democrat"] || 0}
                          </div>
                        </div>
                      </>
                    )}
                    {filterState === "all" && filterParty !== "all" && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground mb-2">States Covered</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(entitySummary.byState)
                            .sort(([, a], [, b]) => b - a)
                            .slice(0, 10)
                            .map(([state, count]) => (
                              <Badge key={state} variant="outline" className="text-xs">
                                {state} ({count})
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                    {filterType === "all" && filterParty === "all" && (
                      <div className="col-span-2">
                        <div className="text-sm text-muted-foreground mb-2">By Type</div>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(entitySummary.byType)
                            .sort(([, a], [, b]) => b - a)
                            .map(([type, count]) => (
                              <Badge key={type} className={getTypeBadgeColor(type)}>
                                {formatTypeName(type)}: {count}
                              </Badge>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {loading ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">Loading entities...</CardContent>
                </Card>
              ) : filteredEntities.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No entities found matching your filters.
                  </CardContent>
                </Card>
              ) : (
                filteredEntities.map((entity) => (
                  <Card key={entity.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getEntityIcon(entity.type)}
                          <CardTitle className="text-lg">{entity.name}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          {entity.party && (
                            <Badge
                              variant={getPartyColor(entity.party)}
                              className={getPartyBadgeClassName(entity.party)}
                            >
                              {entity.party}
                            </Badge>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEditEntity(entity)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => confirmDeleteEntity(entity)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge className={getTypeBadgeColor(entity.type)}>{formatTypeName(entity.type)}</Badge>
                        {entity.state && <Badge variant="outline">{entity.state}</Badge>}
                      </div>
                      {entity.description && <CardDescription className="mt-2">{entity.description}</CardDescription>}
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4 text-sm">
                        <div>
                          <div className="text-muted-foreground">Campaigns</div>
                          <div className="text-2xl font-bold">{entity._count?.campaigns || 0}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Mappings</div>
                          <div className="text-2xl font-bold">{entity._count?.mappings || 0}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {pagination.totalPages > 1 && (
              <Card>
                <CardContent className="py-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setPagination((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                          className={pagination.page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>

                      {[...Array(pagination.totalPages)].map((_, i) => {
                        const pageNum = i + 1
                        // Show first page, last page, current page, and pages around current
                        if (
                          pageNum === 1 ||
                          pageNum === pagination.totalPages ||
                          (pageNum >= pagination.page - 1 && pageNum <= pagination.page + 1)
                        ) {
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationLink
                                onClick={() => setPagination((prev) => ({ ...prev, page: pageNum }))}
                                isActive={pagination.page === pageNum}
                                className="cursor-pointer"
                              >
                                {pageNum}
                              </PaginationLink>
                            </PaginationItem>
                          )
                        } else if (pageNum === pagination.page - 2 || pageNum === pagination.page + 2) {
                          return (
                            <PaginationItem key={pageNum}>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )
                        }
                        return null
                      })}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setPagination((prev) => ({ ...prev, page: Math.min(prev.totalPages, prev.page + 1) }))
                          }
                          className={
                            pagination.page === pagination.totalPages
                              ? "pointer-events-none opacity-50"
                              : "cursor-pointer"
                          }
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>

                  <div className="text-center text-sm text-muted-foreground mt-2">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.totalCount} total entities)
                  </div>
                </CardContent>
              </Card>
            )}

            {filteredEntities.length === 0 && entities.length > 0 && (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  No entities match the selected filters. Try adjusting your filter criteria.
                </CardContent>
              </Card>
            )}

            {entities.length === 0 && (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  No entities created yet. Click "Create Entity" to get started.
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Create/Edit Entity Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={handleCloseCreateDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingEntityId ? "Edit Entity" : "Create New Entity"}</DialogTitle>
              <DialogDescription>
                {editingEntityId
                  ? "Update the entity information and manage email mappings"
                  : "Create a new entity to organize competitive insight emails"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="entity-name">Entity Name</Label>
                <Input
                  id="entity-name"
                  placeholder="e.g., Donald Trump Campaign"
                  value={newEntityName}
                  onChange={(e) => setNewEntityName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="entity-type">Type</Label>
                <Select value={newEntityType} onValueChange={setNewEntityType}>
                  <SelectTrigger id="entity-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="pac">PAC</SelectItem>
                    <SelectItem value="organization">Organization</SelectItem>
                    <SelectItem value="data_broker">Data Broker</SelectItem>
                    <SelectItem value="nonprofit">Nonprofit</SelectItem>
                    <SelectItem value="jfc">JFC</SelectItem>
                    <SelectItem value="state_party">State Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="entity-party">Party</Label>
                <Select value={newEntityParty} onValueChange={setNewEntityParty}>
                  <SelectTrigger id="entity-party">
                    <SelectValue placeholder="Select party..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="republican">Republican</SelectItem>
                    <SelectItem value="democrat">Democrat</SelectItem>
                    <SelectItem value="independent">Independent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="entity-state">State</Label>
                <div className="space-y-2">
                  <Select value={newEntityState} onValueChange={setNewEntityState} disabled={newEntityNationwide}>
                    <SelectTrigger id="entity-state">
                      <SelectValue placeholder="Select state..." />
                    </SelectTrigger>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {state}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="nationwide-checkbox"
                      checked={newEntityNationwide}
                      onCheckedChange={(checked) => {
                        setNewEntityNationwide(checked as boolean)
                        if (checked) {
                          setNewEntityState("")
                        }
                      }}
                    />
                    <Label htmlFor="nationwide-checkbox" className="text-sm font-normal cursor-pointer">
                      Nationwide
                    </Label>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="entity-description">Description (Optional)</Label>
                <Textarea
                  id="entity-description"
                  placeholder="Additional details about this entity..."
                  value={newEntityDescription}
                  onChange={(e) => setNewEntityDescription(e.target.value)}
                  rows={3}
                />
              </div>
              {/* Added Tag input */}
              <div>
                <Label htmlFor="entity-tag">Tag (Optional)</Label>
                <Input
                  id="entity-tag"
                  placeholder="e.g., 2024 Election"
                  value={newEntityTag}
                  onChange={(e) => setNewEntityTag(e.target.value)}
                />
              </div>

              <div>
                <Label>Donation Platform Identifiers (Optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Enter the unique identifiers used in donation URLs. These help automatically match campaigns to
                  entities.
                </p>

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="entity-winred-identifiers" className="text-sm font-normal">
                      WinRed
                    </Label>
                    <Input
                      id="entity-winred-identifiers"
                      placeholder="e.g., nrcc, crenshawforcongress (comma-separated)"
                      value={donationIdentifierInputs.winred}
                      onChange={(e) => {
                        setDonationIdentifierInputs((prev) => ({
                          ...prev,
                          winred: e.target.value,
                        }))
                      }}
                      onBlur={(e) => {
                        const value = e.target.value
                        setNewEntityDonationIdentifiers((prev) => ({
                          ...prev,
                          winred: value
                            .split(",")
                            .map((id) => id.trim())
                            .filter((id) => id.length > 0),
                        }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      From URLs like: winred.com/<span className="font-mono">nrcc</span>/donate
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="entity-anedot-identifiers" className="text-sm font-normal">
                      Anedot
                    </Label>
                    <Input
                      id="entity-anedot-identifiers"
                      placeholder="e.g., jeff-hurd-for-congress (comma-separated)"
                      value={donationIdentifierInputs.anedot}
                      onChange={(e) => {
                        setDonationIdentifierInputs((prev) => ({
                          ...prev,
                          anedot: e.target.value,
                        }))
                      }}
                      onBlur={(e) => {
                        const value = e.target.value
                        setNewEntityDonationIdentifiers((prev) => ({
                          ...prev,
                          anedot: value
                            .split(",")
                            .map((id) => id.trim())
                            .filter((id) => id.length > 0),
                        }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      From URLs like: anedot.com/<span className="font-mono">jeff-hurd-for-congress</span>/donate
                    </p>
                  </div>
                </div>
              </div>

              {editingEntityId && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label className="text-base font-semibold">Email Mappings</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Emails from these addresses or domains will automatically be assigned to this entity
                    </p>
                  </div>

                  {/* Add new mapping */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter email or domain (e.g., info@example.com or example.com)"
                      value={newMappingInput}
                      onChange={(e) => setNewMappingInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleAddMapping()
                        }
                      }}
                    />
                    <Button onClick={handleAddMapping} disabled={!newMappingInput.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* List existing mappings */}
                  <div className="space-y-2">
                    {loadingMappings ? (
                      <div className="text-sm text-muted-foreground text-center py-4">Loading mappings...</div>
                    ) : entityMappings.length === 0 ? (
                      <div className="text-sm text-muted-foreground text-center py-4">
                        No mappings yet. Add an email or domain above.
                      </div>
                    ) : (
                  entityMappings.map((mapping) => (
                    <div
                      key={mapping.id}
                      className="flex items-center justify-between p-2 bg-muted rounded-md text-sm"
                    >
                      <div className="flex items-center gap-2">
                        {mapping.senderPhone ? (
                          <Phone className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Mail className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{mapping.senderPhone || mapping.senderEmail || mapping.senderDomain}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMapping(mapping.id)}
                        className="h-8 w-8 p-0"
                      >
                        ×
                      </Button>
                    </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => handleCloseCreateDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (newEntityNationwide) {
                      setNewEntityState("Nationwide")
                    }
                    handleCreateEntity()
                  }}
                  disabled={!newEntityName.trim()}
                >
                  {editingEntityId ? "Update Entity" : "Create Entity"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Assign Campaigns Dialog */}
        <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
          <DialogContent
            className={selectedPreviewCampaign?.type === "sms" ? "!max-w-2xl" : "!max-w-[1400px] !w-[85vw]"}
            style={{ maxHeight: "85vh", overflowY: "auto" }}
          >
            <DialogHeader>
              <DialogTitle>Assign Campaigns to Entity</DialogTitle>
              <DialogDescription>Assign {selectedCampaigns.length} selected campaign(s) to an entity</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {!isCreatingNewEntity ? (
                <>
                  <div>
                    <Label htmlFor="select-entity">Select Entity</Label>
                    <Popover open={openEntitySearch} onOpenChange={setOpenEntitySearch}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openEntitySearch}
                          className="w-full justify-between bg-transparent"
                        >
                          {selectedEntity ? (
                            <div className="flex items-center gap-2">
                              {getEntityIcon(allEntitiesForAssignment.find((e) => e.id === selectedEntity)?.type || "")}
                              <span>{allEntitiesForAssignment.find((e) => e.id === selectedEntity)?.name}</span>
                              <Badge variant="secondary" className="ml-2 capitalize text-xs">
                                {allEntitiesForAssignment.find((e) => e.id === selectedEntity)?.type}
                              </Badge>
                            </div>
                          ) : (
                            "Choose an entity..."
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[600px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search entities..." />
                          <CommandList>
                            <CommandEmpty>No entity found.</CommandEmpty>
                            <CommandGroup>
                              {allEntitiesForAssignment.map((entity) => (
                                <CommandItem
                                  key={entity.id}
                                  value={entity.name}
                                  onSelect={() => {
                                    setSelectedEntity(entity.id)
                                    setOpenEntitySearch(false)
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedEntity === entity.id ? "opacity-100" : "opacity-0",
                                    )}
                                  />
                                  <div className="flex items-center gap-2">
                                    {getEntityIcon(entity.type)}
                                    <span>{entity.name}</span>
                                    <Badge variant="secondary" className="ml-2 capitalize text-xs">
                                      {entity.type}
                                    </Badge>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setIsCreatingNewEntity(true)} className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Or Create New Entity
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <Label htmlFor="new-entity-name">Entity Name</Label>
                    <Input
                      id="new-entity-name"
                      placeholder="e.g., Donald Trump Campaign"
                      value={assignEntityName}
                      onChange={(e) => setAssignEntityName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="new-entity-type">Type</Label>
                    <Select value={assignEntityType} onValueChange={setAssignEntityType}>
                      <SelectTrigger id="new-entity-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="candidate">Candidate</SelectItem>
                        <SelectItem value="pac">PAC</SelectItem>
                        <SelectItem value="organization">Organization</SelectItem>
                        <SelectItem value="data_broker">Data Broker</SelectItem>
                        <SelectItem value="nonprofit">Nonprofit</SelectItem>
                        <SelectItem value="jfc">JFC</SelectItem>
                        <SelectItem value="state_party">State Party</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="assign-entity-party">Party</Label>
                    <Select value={assignEntityParty} onValueChange={setAssignEntityParty}>
                      <SelectTrigger id="assign-entity-party">
                        <SelectValue placeholder="Select party..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="republican">Republican</SelectItem>
                        <SelectItem value="democrat">Democrat</SelectItem>
                        <SelectItem value="independent">Independent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="assign-entity-state">State</Label>
                    <div className="space-y-2">
                      <Select
                        value={assignEntityState}
                        onValueChange={setAssignEntityState}
                        disabled={assignEntityNationwide}
                      >
                        <SelectTrigger id="assign-entity-state">
                          <SelectValue placeholder="Select state..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All States</SelectItem>
                          {US_STATES.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                          <SelectItem value="Nationwide">Nationwide</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="assign-nationwide-checkbox"
                          checked={assignEntityNationwide}
                          onCheckedChange={(checked) => {
                            setAssignEntityNationwide(checked as boolean)
                            if (checked) {
                              setAssignEntityState("")
                            }
                          }}
                        />
                        <Label htmlFor="assign-nationwide-checkbox" className="text-sm font-normal cursor-pointer">
                          Nationwide
                        </Label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="new-entity-description">Description (Optional)</Label>
                    <Textarea
                      id="new-entity-description"
                      placeholder="Additional details about this entity..."
                      value={assignEntityDescription}
                      onChange={(e) => setAssignEntityDescription(e.target.value)}
                      rows={3}
                    />
                  </div>
                  {/* Tag input for assign dialog */}
                  <div>
                    <Label htmlFor="assign-entity-tag">Tag (Optional)</Label>
                    <Input
                      id="assign-entity-tag"
                      placeholder="e.g., 2024 Election"
                      value={assignEntityTag}
                      onChange={(e) => setAssignEntityTag(e.target.value)}
                    />
                  </div>

                  <div className="space-y-4">
                    <Label>Donation Platform Identifiers (Optional)</Label>
                    <p className="text-xs text-muted-foreground">
                      Add identifiers from donation platforms to auto-assign campaigns
                    </p>

                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="assign-entity-winred-identifiers" className="text-sm font-normal">
                          WinRed
                        </Label>
                        <Input
                          id="assign-entity-winred-identifiers"
                          placeholder="e.g., nrcc, crenshawforcongress (comma-separated)"
                          value={assignEntityDonationIdentifiers.winred?.join(", ") || ""}
                          onChange={(e) => {
                            const value = e.target.value
                            setAssignEntityDonationIdentifiers((prev) => ({
                              ...prev,
                              winred: value
                                .split(",")
                                .map((id) => id.trim())
                                .filter((id) => id.length > 0),
                            }))
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          From URLs like: winred.com/<span className="font-mono">nrcc</span>/donate
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="assign-entity-anedot-identifiers" className="text-sm font-normal">
                          Anedot
                        </Label>
                        <Input
                          id="assign-entity-anedot-identifiers"
                          placeholder="e.g., jeff-hurd-for-congress (comma-separated)"
                          value={assignEntityDonationIdentifiers.anedot?.join(", ") || ""}
                          onChange={(e) => {
                            const value = e.target.value
                            setAssignEntityDonationIdentifiers((prev) => ({
                              ...prev,
                              anedot: value
                                .split(",")
                                .map((id) => id.trim())
                                .filter((id) => id.length > 0),
                            }))
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          From URLs like: anedot.com/<span className="font-mono">jeff-hurd-for-congress</span>/donate
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button variant="outline" size="sm" onClick={() => setIsCreatingNewEntity(false)} className="w-full">
                    Back to Select Existing Entity
                  </Button>
                </>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create-mapping"
                  checked={createMapping}
                  onCheckedChange={(checked) => setCreateMapping(checked as boolean)}
                />
                <Label htmlFor="create-mapping" className="text-sm font-normal">
                  Create mapping for future auto-assignment
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                If enabled, future emails from these senders will automatically be assigned to this entity.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (isCreatingNewEntity && assignEntityNationwide) {
                      setAssignEntityState("Nationwide")
                    }
                    handleAssignCampaigns()
                  }}
                  disabled={isCreatingNewEntity ? !assignEntityName.trim() : !selectedEntity}
                >
                  {isCreatingNewEntity ? "Create & Assign" : "Assign Campaigns"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Entity?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <strong>{entityToDelete?.name}</strong>? This will:
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Remove all email and SMS mappings for this entity</li>
                  <li>Unassign all {entityToDelete?._count?.campaigns || 0} campaigns from this entity</li>
                  <li>Permanently delete the entity</li>
                </ul>
                <p className="mt-2 text-destructive font-medium">This action cannot be undone.</p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteEntity}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? "Deleting..." : "Delete Entity"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showDeleteMessageDialog} onOpenChange={setShowDeleteMessageDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Unassigned Message?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this {messageToDelete?.type === "sms" ? "SMS" : "email"} from{" "}
                <strong>{messageToDelete?.senderName}</strong>?
                <p className="mt-2 text-destructive font-medium">
                  This will permanently delete the message. This action cannot be undone.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeletingMessage}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteMessage}
                disabled={isDeletingMessage}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeletingMessage ? "Deleting..." : "Delete Message"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {selectedPreviewCampaign && (
          <Dialog
            open={!!selectedPreviewCampaign}
            onOpenChange={(open) => {
              if (!open) setSelectedPreviewCampaign(null)
            }}
          >
            <DialogContent
              className={selectedPreviewCampaign?.type === "sms" ? "!max-w-2xl" : "!max-w-[1400px] !w-[85vw]"}
              style={{ maxHeight: "85vh", overflowY: "auto" }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {selectedPreviewCampaign.subject || selectedPreviewCampaign.title}
                </DialogTitle>
                <DialogDescription>
                  <div className="flex flex-col gap-1 mt-2">
                    <div className="flex items-center gap-2">
                      {selectedPreviewCampaign.type === "sms" ? (
                        <Smartphone className="h-4 w-4" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      <span className="font-medium">
                        {selectedPreviewCampaign.senderName || selectedPreviewCampaign.sender}
                      </span>
                      <span className="text-muted-foreground">
                        (
                        {selectedPreviewCampaign.type === "sms"
                          ? selectedPreviewCampaign.phoneNumber
                          : selectedPreviewCampaign.senderEmail}
                        )
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {new Date(selectedPreviewCampaign.dateReceived).toLocaleDateString()}
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={emailZoom <= 50}>
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleZoomReset} disabled={emailZoom === 100}>
                    {emailZoom}%
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={emailZoom >= 200}>
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
                <Button onClick={handleAssignFromPreview}>
                  <ArrowRight className="h-4 w-4 mr-2" />
                  Assign
                </Button>
              </div>

              <Tabs defaultValue="preview" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">
                    {selectedPreviewCampaign.type === "sms" ? "Message" : "Email Preview"}
                  </TabsTrigger>
                  <TabsTrigger value="links">
                    CTA Links ({(() => {
                      try {
                        const links = Array.isArray(selectedPreviewCampaign.ctaLinks)
                          ? selectedPreviewCampaign.ctaLinks
                          : typeof selectedPreviewCampaign.ctaLinks === "string"
                            ? JSON.parse(selectedPreviewCampaign.ctaLinks)
                            : []
                        return links.length
                      } catch {
                        return 0
                      }
                    })()})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="preview" className="mt-4">
                  {selectedPreviewCampaign.type === "sms" ? (
                    <div className="rounded-lg border bg-white p-6">
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                        <Phone className="h-4 w-4" />
                        <span>From: {selectedPreviewCampaign.phoneNumber}</span>
                      </div>
                      <div className="text-black whitespace-pre-wrap break-words">
                        {selectedPreviewCampaign.emailPreview || selectedPreviewCampaign.message || ""}
                      </div>
                    </div>
                  ) : selectedPreviewCampaign.emailContent ? (
                    <div className="rounded-lg border bg-white overflow-auto">
                      <div
                        style={{
                          transform: `scale(${emailZoom / 100})`,
                          transformOrigin: "top left",
                          width: `${10000 / emailZoom}%`,
                          height: `${60000 / emailZoom}px`,
                        }}
                      >
                        <iframe
                          srcDoc={prepareEmailHtml(selectedPreviewCampaign.emailContent)}
                          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
                          className="w-full h-[600px] border-0"
                          title="Email Preview"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <p className="text-sm text-muted-foreground text-center">No email content available</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="links" className="mt-4">
                  {(() => {
                    try {
                      const links = Array.isArray(selectedPreviewCampaign.ctaLinks)
                        ? selectedPreviewCampaign.ctaLinks
                        : typeof selectedPreviewCampaign.ctaLinks === "string"
                          ? JSON.parse(selectedPreviewCampaign.ctaLinks)
                          : []

                      if (!links || links.length === 0) {
                        return (
                          <div className="rounded-lg border bg-muted/20 p-4">
                            <p className="text-sm text-muted-foreground text-center">No CTA links found</p>
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-4">
                          {links.map((link: any, index: number) => (
                            <div key={index} className="rounded-lg border p-4 space-y-2">
                              <div className="flex items-start justify-between">
                                <a
                                  href={link.finalUrl || link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline break-all flex-1"
                                >
                                  {link.finalUrl || link.url}
                                </a>
                                <Badge className="ml-2 flex-shrink-0">{link.type || "Other"}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    } catch (error) {
                      console.error("[v0] Error parsing CTA links:", error)
                      return (
                        <div className="rounded-lg border bg-muted/20 p-4">
                          <p className="text-sm text-muted-foreground text-center">Error loading CTA links</p>
                        </div>
                      )
                    }
                  })()}
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Reassign Campaign</DialogTitle>
              <DialogDescription>Select a new entity to assign this campaign to</DialogDescription>
            </DialogHeader>
            {selectedDataBrokerCampaign && (
              <div className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="font-medium">{selectedDataBrokerCampaign.senderName}</div>
                  <div className="text-sm text-muted-foreground">{selectedDataBrokerCampaign.subject}</div>
                  <div className="text-xs text-muted-foreground mt-2">
                    Currently assigned to: {selectedDataBrokerCampaign.entity?.name || "Unknown"}
                  </div>
                </div>

                <div>
                  <Label htmlFor="reassign-entity">Select New Entity</Label>
                  <Select value={reassignEntityId} onValueChange={setReassignEntityId}>
                    <SelectTrigger id="reassign-entity">
                      <SelectValue placeholder="Choose an entity..." />
                    </SelectTrigger>
                    <SelectContent>
                      {loadingAllEntities ? (
                        <SelectItem value="loading" disabled>
                          Loading entities...
                        </SelectItem>
                      ) : (
                        allEntitiesForAssignment
                          .filter((e) => e.type !== "data_broker")
                          .map((entity) => (
                            <SelectItem key={entity.id} value={entity.id}>
                              {entity.name} ({entity.type}){entity.party && ` - ${entity.party}`}
                            </SelectItem>
                          ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReassignDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleReassignCampaign} disabled={!reassignEntityId}>
                Reassign Campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
