"use client"

import type React from "react"

import { useState, useEffect, useRef, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  ExternalLink,
  Mail,
  Smartphone,
  Calendar,
  CalendarIcon,
  X,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  LinkIcon,
  Share2,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  User,
  Star,
  Phone,
  Info,
  UserPlus,
  Loader2,
} from "lucide-react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { SlidersHorizontal } from "lucide-react"
import { PaywallOverlay } from "@/components/paywall-overlay"
import { hasCompetitiveInsightsAccess, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/subscription-utils"
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts"
import { ChartContainer } from "@/components/ui/chart"
import { CiEntitySubscribeButton } from "./ci-entity-subscribe-button"
import { useToast } from "@/hooks/use-toast"
import { CiViewsManager } from "./ci-views-manager" // Imported CiViewsManager
import { CiAnalyticsView } from "./ci-analytics-view"
import { nameToSlug } from "@/lib/directory-utils"

interface CompetitiveInsightsProps {
  clientSlug: string
  defaultView?: "emails" | "reporting" // Added defaultView prop
  subscriptionsOnly?: boolean // Added flag for filtering by subscriptions
  apiEndpoint?: string // Added apiEndpoint prop to allow custom API routes
  showPersonalBadge?: boolean // Added showPersonalBadge prop
  currentUser?: any // Added currentUser prop
  subscriptionPlan?: SubscriptionPlan | "free" // Added subscriptionPlan prop
  hideHeader?: boolean // Hide the "Competitive Insights" title and description
  isReportingView?: boolean // Reporting page: different title, no search/dates, time range buttons in header
}

interface Campaign {
  id: number | string
  type: "email" | "sms" // Added type field to distinguish email vs SMS
  senderName: string
  senderEmail: string
  subject: string
  dateReceived: string
  inboxRate: number
  inboxCount: number
  spamCount: number
  notDeliveredCount: number
  ctaLinks: string[] | Array<{ url: string; finalUrl?: string; strippedFinalUrl?: string; type: string }>
  tags: string[]
  emailPreview: string
  emailContent: string | null
  phoneNumber?: string // Added for SMS messages
  toNumber?: string // Added for SMS messages
  entityId?: string | null // Added entityId
  entity?: {
    id: string
    name: string
    type: string
    party?: string | null
    state?: string | null
    tag?: string | null // Added tag property to entity
  } | null // Removed position from interface
  shareToken?: string | null // Added for sharing
  shareCount?: number // Added for sharing
  shareViewCount?: number // Added for sharing
  isHidden?: boolean // Added for hide feature
  clientId?: string | null
  source?: string | null
  sendingProvider?: string | null
}

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

interface EntityMapping {
  emails: string[]
  domains: string[]
  phones: string[]
}

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

// Final cleanup pass on any extracted text
function sanitizeExtractedText(text: string): string {
  // Cut at the FIRST occurrence of zero-width ESP padding characters BEFORE any other
  // processing, because these chars (U+034F combining grapheme joiner, U+200C zero-width
  // non-joiner, U+200B zero-width space, U+FEFF BOM) appear right after the real preview
  // text and before the &nbsp; spam. e.g. "Is this really true? ͏‌&nbsp;͏‌&nbsp;..."
  const zwPaddingIndex = text.search(/[\u034F\u200B\u200C\u200D\uFEFF]/)
  if (zwPaddingIndex > 0) {
    text = text.substring(0, zwPaddingIndex)
  }

  let result = text
    // Decode HTML entities — including literal "&nbsp;" stored as plain text in DB
    .replace(/&nbsp;/gi, " ").replace(/&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&ldquo;/gi, '"').replace(/&rdquo;/gi, '"')
    .replace(/&hellip;/gi, "…").replace(/&mdash;/gi, "—").replace(/&ndash;/gi, "–")
    // Remove any remaining unrecognized &...; entity fragments (e.g. "&n..." at end of truncated string)
    .replace(/&[a-z#0-9]{1,10};?/gi, " ")
    // Remove ESP filler: standalone numbers at the start (e.g. "96 They hope...")
    .replace(/^\d+\s+/, "")
    // Strip any remaining zero-width chars that survived
    .replace(/[\u034F\u200B\u200C\u200D\uFEFF]/g, "")

  // Also cut at the first run of 3+ spaces (fallback for other padding styles)
  const paddingIndex = result.search(/\s{3,}/)
  if (paddingIndex > 0) {
    result = result.substring(0, paddingIndex)
  }

  return result.replace(/\s+/g, " ").trim()
}

// Extract preheader text from raw HTML (hidden preview text ESPs inject)
function extractPreheaderFromHtml(html: string): string {
  const patterns = [
    /class=["'][^"']*(?:preheader|preview[-_]?text|preview)["'][^>]*>([\s\S]*?)<\/[a-z]+>/i,
    /<(?:div|span|td|p)[^>]*style=["'][^"']*(?:display\s*:\s*none|max-height\s*:\s*0|overflow\s*:\s*hidden)[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|td|p)>/i,
    /<(?:div|span|td|p)[^>]*style=["'][^"']*mso-hide\s*:\s*all[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|td|p)>/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match && match[1]) {
      const text = sanitizeExtractedText(
        match[1].replace(/<[^>]*>/g, " ")
      )
      if (text.length > 10) return text.substring(0, 200)
    }
  }
  return ""
}

// Extract first meaningful visible text from HTML, skipping style/script/hidden blocks
function extractFirstVisibleText(html: string): string {
  const raw = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*style=["'][^"']*(?:display\s*:\s*none|max-height\s*:\s*0|visibility\s*:\s*hidden|mso-hide)[^"']*["'][^>]*>[\s\S]*?<\/[a-z]+>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
  return sanitizeExtractedText(raw).substring(0, 200)
}

// Detect if a string looks like CSS/code noise rather than real content
function looksLikeCode(text: string): boolean {
  // CSS selector lists: "a, p, span, div..."
  if (/^[\s,]*[a-z]+(\s*,\s*[a-z]+){2,}/i.test(text)) return true
  // CSS property patterns: "property: value;"
  if (/[a-z-]+\s*:\s*[^;,\n]{3,};/.test(text)) return true
  // CSS comment blocks
  if (/\/\*[\s\S]*?\*\//.test(text)) return true
  // HTML attribute noise: x-apple-data-detectors, mso-, webkit-
  if (/x-apple-data-detectors|mso-|webkit-|!important/.test(text)) return true
  // High ratio of code keywords
  const codeKeywords = ['div', 'span', 'body', 'html', 'font', 'table', 'td', 'tr',
    'background-color', 'margin', 'padding', 'border', 'display', 'position', 'float',
    'color', 'text-align', 'font-size', 'line-height', 'mso', 'webkit']
  const words = text.toLowerCase().split(/[\s,;:(){}]+/).filter(w => w.length > 1)
  const codeCount = words.filter(w => codeKeywords.includes(w)).length
  return words.length > 3 && codeCount / words.length > 0.3
}

// Helper function to clean email preview text, with optional full HTML fallback
function cleanEmailPreview(preview: string, emailContent?: string | null): string {
  if (!preview && !emailContent) return ""

  // Sanitize entities first so looksLikeCode and length checks work on clean text
  const sanitizedPreview = preview ? sanitizeExtractedText(preview) : ""

  // If stored preview looks like code noise or is empty after sanitizing, use HTML fallback
  if (!sanitizedPreview || looksLikeCode(sanitizedPreview)) {
    if (emailContent) {
      const preheader = extractPreheaderFromHtml(emailContent)
      if (preheader) return preheader
      const visible = extractFirstVisibleText(emailContent)
      return isUselessText(visible) ? "" : visible
    }
    return ""
  }

  // If stored preview is raw HTML, try to extract preheader from it
  if (/<[a-z]/i.test(sanitizedPreview)) {
    const preheader = extractPreheaderFromHtml(preview)
    if (preheader) return preheader
    if (emailContent) {
      const contentPreheader = extractPreheaderFromHtml(emailContent)
      if (contentPreheader) return contentPreheader
    }
  }

  // Reject dot-only, whitespace-only, or very short results
  if (isUselessText(sanitizedPreview)) {
    if (emailContent) {
      const preheader = extractPreheaderFromHtml(emailContent)
      if (preheader) return preheader
      const visible = extractFirstVisibleText(emailContent)
      return isUselessText(visible) ? "" : visible
    }
    return ""
  }

  // Truncate cleanly — never cut mid-word or mid-entity
  if (sanitizedPreview.length > 200) {
    return sanitizedPreview.substring(0, 200).replace(/\s+\S*$/, "") + "..."
  }
  return sanitizedPreview
}

function isUselessText(text: string): boolean {
  return text.length < 10 || /^[\s.…\-–—|]+$/.test(text)
}

export function CompetitiveInsights({
  clientSlug,
  defaultView = "emails",
  subscriptionsOnly = false,
  apiEndpoint, // Accept apiEndpoint prop
  showPersonalBadge = false, // Accept showPersonalBadge prop
  currentUser, // Accept currentUser prop
  subscriptionPlan, // Accept subscriptionPlan prop — undefined means "fetch from billing"
  hideHeader = false, // Hide header by default false
  isReportingView = false,
}: CompetitiveInsightsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [activeView, setActiveView] = useState<"emails" | "reporting">(defaultView)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeSearchQuery, setActiveSearchQuery] = useState("")
  const [selectedSender, setSelectedSender] = useState<string[]>([])
  const [selectedPartyFilter, setSelectedPartyFilter] = useState<string>("all") // Renamed to avoid conflict
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>("all")
  const [selectedMessageType, setSelectedMessageType] = useState<string>("all")
  const [selectedDonationPlatform, setSelectedDonationPlatform] = useState<string>("all")
  const [showThirdParty, setShowThirdParty] = useState<boolean>(false)
  const [showHouseFileOnly, setShowHouseFileOnly] = useState<boolean>(false)
  // Multi-select message filters: "email" | "sms" | "third_party" | "house_file"
  const [selectedMessageFilters, setSelectedMessageFilters] = useState<string[]>([])
  const [pendingMessageFilters, setPendingMessageFilters] = useState<string[]>([])
  const [isMessageFilterOpen, setIsMessageFilterOpen] = useState(false)
  const [senderSearchTerm, setSenderSearchTerm] = useState("") // Declared senderSearchTerm
  const senderSearchInputRef = useRef<HTMLInputElement>(null) // Declare senderSearchInputRef
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isFromCalendarOpen, setIsFromCalendarOpen] = useState(false)
  const [isToCalendarOpen, setIsToCalendarOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // ── Mobile filter draft state ────────────────────────────────────────────
  // While the mobile filter sheet is open, controls inside it write to these
  // draft values instead of the applied state. The user commits via the
  // "Apply Filters" button (which copies draft → applied and closes the sheet)
  // or discards via Cancel/backdrop tap. This prevents a refetch on every
  // single filter change while the sheet is open.
  const [draftSender, setDraftSender] = useState<string[]>([])
  const [draftPartyFilter, setDraftPartyFilter] = useState<string>("all")
  const [draftStateFilter, setDraftStateFilter] = useState<string>("all")
  const [draftMessageFilters, setDraftMessageFilters] = useState<string[]>([])
  const [draftDonationPlatform, setDraftDonationPlatform] = useState<string>("all")
  const [draftDateRange, setDraftDateRange] = useState<DateRange>({ from: undefined, to: undefined })

  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("active")
  const [hasCompetitiveInsights, setHasCompetitiveInsights] = useState(false)
  const [loadingSubscription, setLoadingSubscription] = useState(true)
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [resolvedPlan, setResolvedPlan] = useState<SubscriptionPlan | "free" | null>(subscriptionPlan ?? null)

  useEffect(() => {
    if (searchTerm === "" && activeSearchQuery !== "") {
      setActiveSearchQuery("")
    }
  }, [searchTerm, activeSearchQuery])

  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [totalCampaigns, setTotalCampaigns] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareLink, setShareLink] = useState("")
  const [generatingShareLink, setGeneratingShareLink] = useState(false)
  const [copiedShareLink, setCopiedShareLink] = useState(false)

  const [emailZoom, setEmailZoom] = useState(100)

  const [allSenders, setAllSenders] = useState<string[]>([]) // Initialized once
  const [currentUserClient, setCurrentUserClient] = useState<string | null>(null)
  const [fetchedUser, setFetchedUser] = useState<any>(null)
  const [chartDays, setChartDays] = useState<7 | 30 | 90 | 365>(30)
  const resolvedUser = currentUser ?? fetchedUser
  const [subscribedEntityIds, setSubscribedEntityIds] = useState<string[]>([])
  const [allEntities, setAllEntities] = useState<{ id: string; name: string; party?: string | null; state?: string | null }[]>([])

  // Quick-assign state (super_admin only)
  const [assignPopoverCampaignId, setAssignPopoverCampaignId] = useState<string | number | null>(null)
  const [assignDialogCampaign, setAssignDialogCampaign] = useState<Campaign | null>(null)
  const [assignEntitySearch, setAssignEntitySearch] = useState("")
  const [assigningCampaignId, setAssigningCampaignId] = useState<string | number | null>(null)

  // Pre-select entity from URL ?sender= param (e.g. navigating from Directory)
  useEffect(() => {
    const senderParam = searchParams.get("sender")
    if (senderParam && allSenders.length > 0) {
      const decoded = decodeURIComponent(senderParam)
      if (allSenders.includes(decoded)) {
        setSelectedSender([decoded])
        // Clean the URL param without triggering a navigation
        const url = new URL(window.location.href)
        url.searchParams.delete("sender")
        window.history.replaceState({}, "", url.toString())
      }
    }
  }, [searchParams, allSenders])

  // When party or state filter changes, clear selected senders that no longer match
  useEffect(() => {
    if (selectedPartyFilter === "all" && selectedStateFilter === "all") return
    setSelectedSender((prev) =>
      prev.filter((sender) => {
        const entity = allEntities.find((e) => e.name === sender)
        const entityParty = (entity?.party || "").toLowerCase().trim()
        const matchesParty =
          selectedPartyFilter === "all" ||
          (selectedPartyFilter === "third party"
            ? entityParty.includes("independent") || entityParty.includes("third") || entityParty === "ind" || entityParty === "i"
            : entityParty.includes(selectedPartyFilter.toLowerCase()))
        const matchesState =
          selectedStateFilter === "all" ||
          entity?.state?.toUpperCase() === selectedStateFilter.toUpperCase()
        return matchesParty && matchesState
      })
    )
  }, [selectedPartyFilter, selectedStateFilter, allEntities])

  const [entityMappings, setEntityMappings] = useState<
    Record<string, { emails: string[]; domains: string[]; phones: string[] }>
  >({})

  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([])

  const hasActiveFilters = useMemo(() => {
    return (
      activeSearchQuery !== "" ||
      selectedSender.length > 0 ||
      selectedPartyFilter !== "all" ||
      selectedMessageFilters.length > 0 ||
      selectedDonationPlatform !== "all" ||
      dateRange.from !== undefined ||
      dateRange.to !== undefined
    )
  }, [
    activeSearchQuery,
    selectedSender,
    selectedPartyFilter,
    selectedMessageFilters,
    selectedDonationPlatform,
    dateRange.from,
    dateRange.to,
  ])

  const isEntityFollowed = (entityIdOrName: string) => {
    // Check if it's an entity ID directly
    if (subscribedEntityIds.includes(entityIdOrName)) {
      return true
    }
    // Otherwise check by name
    const entity = allEntities.find((e) => e.name === entityIdOrName)
    return entity ? subscribedEntityIds.includes(entity.id) : false
  }

  const filteredSenders = useMemo(() => {
    let filtered = allSenders.filter((sender) => sender.toLowerCase().includes(senderSearchTerm.toLowerCase()))

    // Cascade party filter: only show entities matching the selected party
    if (selectedPartyFilter !== "all") {
      filtered = filtered.filter((sender) => {
        const entity = allEntities.find((e) => e.name === sender)
        const entityParty = (entity?.party || "").toLowerCase().trim()
        const matches = selectedPartyFilter === "third party" 
          ? entityParty.includes("independent") || entityParty.includes("third") || entityParty === "ind" || entityParty === "i"
          : entityParty.includes(selectedPartyFilter.toLowerCase())
        return matches
      })
    }

    // Cascade state filter: only show entities matching the selected state
    if (selectedStateFilter !== "all") {
      filtered = filtered.filter((sender) => {
        const entity = allEntities.find((e) => e.name === sender)
        return entity?.state?.toUpperCase() === selectedStateFilter.toUpperCase()
      })
    }

    // On the Following page (/ci/subscriptions), only show entities the client is subscribed to
    if (pathname?.includes("/ci/subscriptions")) {
      return filtered.filter((sender) => isEntityFollowed(sender)).sort((a, b) => a.localeCompare(b))
    }

    // Separate followed and not-followed entities
    const followed = filtered.filter((sender) => isEntityFollowed(sender))
    const notFollowed = filtered.filter((sender) => !isEntityFollowed(sender))

    // Sort each group alphabetically
    followed.sort((a, b) => a.localeCompare(b))
    notFollowed.sort((a, b) => a.localeCompare(b))

    // Return followed first, then the rest
    return [...followed, ...notFollowed]
  }, [allSenders, senderSearchTerm, allEntities, subscribedEntityIds, pathname, selectedPartyFilter, selectedStateFilter])

  // Modify useEffect to fetch user and then campaigns
  useEffect(() => {
    const fetchUserAndCampaigns = async () => {
      try {
        // Fetch user info
        const userResponse = await fetch("/api/auth/me")
        let userData // Declare userData here
        if (userResponse.ok) {
          userData = await userResponse.json()
          if (!currentUser) {
            setFetchedUser({ role: userData.role, clientId: userData.client?.id })
          }
        } else {
          console.error("Failed to fetch user info")
        }

        // Fetch subscription info
        const subscriptionResponse = await fetch(`/api/billing?clientSlug=${clientSlug}`, {
          credentials: "include",
        })
        if (subscriptionResponse.ok) {
          const data = await subscriptionResponse.json()
          // If subscriptionPlan was explicitly passed as a prop, honour it.
          // Otherwise resolve from the billing API response.
          if (subscriptionPlan === undefined) {
            setResolvedPlan(data.client?.subscriptionPlan || "free")
          }
          setSubscriptionStatus(data.client?.subscriptionStatus || "active")
          setHasCompetitiveInsights(data.client?.hasCompetitiveInsights || false)
          setHasAdminAccess(data.hasAdminAccess || false)
        } else {
          console.error("Failed to fetch subscription info")
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        setLoadingSubscription(false)
      }
    }

    fetchUserAndCampaigns()
  }, [clientSlug, subscriptionsOnly, apiEndpoint, currentUser]) // Added currentUser to dependencies

  // Fetch user client ID for personal badge logic
  useEffect(() => {
    const fetchUserClient = async () => {
      try {
        const response = await fetch("/api/auth/me")
        if (response.ok) {
          const userData = await response.json()
          if (userData.client?.id) {
            setCurrentUserClient(userData.client.id)

            const subscriptionsResponse = await fetch(
              `/api/ci/subscriptions/check-all?clientSlug=${clientSlug}`
            )
            if (subscriptionsResponse.ok) {
              const subscriptionsData = await subscriptionsResponse.json()
              setSubscribedEntityIds(subscriptionsData.entityIds || [])
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user client:", error)
      }
    }
    fetchUserClient()
  }, [])

  // Combined and simplified fetchCampaigns trigger
  useEffect(() => {
    fetchCampaigns()
  }, [
    activeSearchQuery,
    selectedSender,
    selectedPartyFilter,
    selectedStateFilter,
    selectedMessageFilters,
    selectedDonationPlatform,
    dateRange.from,
    dateRange.to,
    currentPage,
    itemsPerPage,
  ])

  useEffect(() => {
    const fetchAllSenders = async () => {
      try {
        // Fetch all entities for the dropdown
        const response = await fetch(`/api/competitive-insights/senders`)
        const data = await response.json()

        // Store entities with IDs, party, and state for cascading filters
        if (data.entities) {
          setAllEntities(data.entities)
          setAllSenders(data.entities.map((e: { id: string; name: string; party?: string | null; state?: string | null }) => e.name))
        }
      } catch (error) {
        console.error("Error fetching senders:", error)
      }
    }

    fetchAllSenders()
  }, [clientSlug])

  // Simplified and consolidated generateSuggestions, handleSearchChange, handleSearchKeyDown, handleSuggestionClick
  const generateSuggestions = async (query: string) => {
    if (query.length < 3) {
      setShowAutocomplete(false)
      return
    }

    try {
      const response = await fetch(
        `/api/competitive-insights/suggestions?query=${encodeURIComponent(query)}&clientSlug=${clientSlug}`,
      )
      if (response.ok) {
        const data = await response.json()
        setAutocompleteSuggestions(data.suggestions || [])
        setShowAutocomplete(data.suggestions.length > 0)
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error)
      setShowAutocomplete(false)
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchTerm(value)
    generateSuggestions(value)
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      setActiveSearchQuery(searchTerm)
      setCurrentPage(1) // Reset to first page on search
      setShowAutocomplete(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setSearchTerm(suggestion)
    setActiveSearchQuery(suggestion) // Also update activeSearchQuery when clicking suggestion
    setShowAutocomplete(false)
    setCurrentPage(1) // Reset to first page
  }

  const currentFilteredCampaigns = campaigns.filter((campaign) => {
    const isDataBroker = campaign.entity?.type === "data_broker"
    // Always exclude data broker entities regardless of third party filter
    if (isDataBroker) return false

    // Third-party filter is applied server-side via the API — no client-side filtering needed

    const searchTermLower = searchTerm.toLowerCase()
    const matchesSearch =
      (campaign.senderName || "").toLowerCase().includes(searchTermLower) ||
      (campaign.senderEmail || "").toLowerCase().includes(searchTermLower) ||
      (campaign.subject || "").toLowerCase().includes(searchTermLower) ||
      (campaign.message || "").toLowerCase().includes(searchTermLower) ||
      (campaign.emailContent || "").toLowerCase().includes(searchTermLower)

    const campaignName = campaign.entity?.name || campaign.senderName
    const matchesSender = selectedSender.length === 0 || selectedSender.includes(campaignName)

    const campaignParty = campaign.entity?.party?.toLowerCase()
    const matchesParty = selectedPartyFilter === "all" || campaignParty === selectedPartyFilter.toLowerCase() // Use renamed state

    // Multi-select message filter: no filters selected = show all
    const matchesMessageType = selectedMessageFilters.length === 0 || (() => {
      const hasEmail = selectedMessageFilters.includes("email")
      const hasSms = selectedMessageFilters.includes("sms")
      const hasThirdParty = selectedMessageFilters.includes("third_party")
      const hasHouseFile = selectedMessageFilters.includes("house_file")
      const isEmail = campaign.type === "email"
      const isSms = campaign.type === "sms"
      const isThirdPartySource = campaign.source === "third_party" || (!campaign.clientId)
      const isHouseFileSource = !!campaign.clientId
      // Build type match: if email or sms filters selected, restrict to those types
      const typeFilters = [hasEmail && "email", hasSms && "sms"].filter(Boolean) as string[]
      const matchesType = typeFilters.length === 0 || typeFilters.includes(campaign.type)
      // Build source match: if house_file or third_party filters selected, restrict to those sources
      const matchesSource =
        (!hasHouseFile && !hasThirdParty) ||
        (hasHouseFile && isHouseFileSource) ||
        (hasThirdParty && isThirdPartySource)
      return matchesType && matchesSource
    })()

    let matchesDonationPlatform = true
    if (selectedDonationPlatform !== "all") {
      if (selectedDonationPlatform === "substack") {
        matchesDonationPlatform = campaign.senderEmail?.toLowerCase().endsWith("@substack.com") ?? false
      } else {
        const ctaLinks = campaign.ctaLinks || []
        const platformDomains: Record<string, string[]> = {
          winred: ["winred.com"],
          actblue: ["actblue.com"],
          anedot: ["anedot.com"],
          psq: ["psqimpact.com"],
          ngpvan: ["ngpvan.com"],
        }

        const domains = platformDomains[selectedDonationPlatform] || []
        matchesDonationPlatform = ctaLinks.some((link: any) => {
          let urlToCheck = ""
          if (typeof link === "string") {
            urlToCheck = link
          } else if (link.finalUrl) {
            urlToCheck = link.finalUrl
          } else if (link.url) {
            urlToCheck = link.url
          }
          return domains.some((domain) => urlToCheck.toLowerCase().includes(domain))
        })
      }
    }

    const campaignDate = new Date(campaign.dateReceived)

    let matchesDateRange = true
    if (dateRange.from) {
      const fromDate = new Date(dateRange.from)
      fromDate.setHours(0, 0, 0, 0)
      matchesDateRange = matchesDateRange && campaignDate >= fromDate
    }
    if (dateRange.to) {
      const toDate = new Date(dateRange.to)
      toDate.setHours(23, 59, 59, 999) // Include entire end date
      matchesDateRange = matchesDateRange && campaignDate <= toDate
    }

    return (
      matchesSearch &&
      matchesSender &&
      matchesParty &&
      matchesMessageType &&
      matchesDonationPlatform &&
      matchesDateRange
    )
  })

  const fetchCampaigns = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      // Build query parameters for server-side filtering
      const params = new URLSearchParams()

      if (activeSearchQuery) params.append("search", activeSearchQuery)
      if (selectedSender.length > 0) {
        selectedSender.forEach(sender => params.append("sender", sender))
      }
      if (selectedPartyFilter && selectedPartyFilter !== "all") params.append("party", selectedPartyFilter)
      if (selectedStateFilter && selectedStateFilter !== "all") params.append("state", selectedStateFilter)
      // Multi-select message filters
      if (selectedMessageFilters.length > 0) {
        const hasEmail = selectedMessageFilters.includes("email")
        const hasSms = selectedMessageFilters.includes("sms")
        const hasThirdParty = selectedMessageFilters.includes("third_party")
        const hasHouseFile = selectedMessageFilters.includes("house_file")
        if (hasEmail && !hasSms) params.append("messageType", "email")
        else if (hasSms && !hasEmail) params.append("messageType", "sms")
        if (hasThirdParty) params.append("thirdParty", "true")
        if (hasHouseFile) params.append("houseFileOnly", "true")
      }
      if (selectedDonationPlatform && selectedDonationPlatform !== "all")
        params.append("donationPlatform", selectedDonationPlatform)
      if (dateRange.from) params.append("fromDate", dateRange.from.toISOString())
      if (dateRange.to) params.append("toDate", dateRange.to.toISOString())

      if (subscriptionsOnly) params.append("subscriptionsOnly", "true")

      // Add pagination parameters
      params.append("page", currentPage.toString())
      params.append("limit", itemsPerPage.toString())

      // Add clientSlug to params
      if (clientSlug) params.append("clientSlug", clientSlug)

      const endpoint = apiEndpoint
        ? `${apiEndpoint}?${params.toString()}`
        : `/api/competitive-insights?${params.toString()}`
      const response = await fetch(endpoint)
      const data = await response.json()

      // Filter out hidden campaigns unless the user is a super admin
      const insights = data.insights || []
      setCampaigns(
        resolvedUser?.role === "super_admin" ? insights : insights.filter((campaign: Campaign) => !campaign.isHidden),
      )

      // Set pagination metadata
      if (data.pagination) {
        setTotalCampaigns(data.pagination.total)
        setTotalPages(data.pagination.totalPages)
      }
    } catch (error) {
      console.error("Error fetching competitive insights:", error)
    } finally {
      if (isRefresh) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }

  const currentPaginatedCampaigns = campaigns

  useEffect(() => {
    setCurrentPage(1)
  }, [
    selectedSender,
    selectedPartyFilter,
    selectedStateFilter,
    selectedMessageFilters,
    selectedDonationPlatform,
    dateRange.from,
    dateRange.to,
  ])

  // This was causing only the current page's entities to show in the dropdown
  // useEffect(() => {
  //   const uniqueSenders = Array.from(new Set(campaigns.map((c) => c.entity?.name || c.senderName))).sort((a, b) =>
  //     a.localeCompare(b),
  //   )
  //   setAllSenders(uniqueSenders)
  // }, [campaigns])

  const fetchAllEntityMappings = async () => {
    try {
      const response = await fetch("/api/ci-entities/all-mappings")
      const data = await response.json()
      if (data.mappingsByEntity) {
        setEntityMappings(data.mappingsByEntity)
      }
    } catch (error) {
      console.error("Error fetching entity mappings:", error)
    }
  }

  // Fetch subscribed entities once
  const fetchSubscribedEntities = async () => {
    try {
      const response = await fetch(`/api/ci/subscriptions/check-all?clientSlug=${clientSlug}`)
      if (response.ok) {
        const data = await response.json()
        setSubscribedEntityIds(data.entityIds || [])
      }
    } catch (error) {
      console.error("Error fetching subscribed entities:", error)
    }
  }

  useEffect(() => {
    fetchSubscribedEntities()
    fetchAllEntityMappings()
  }, [clientSlug])

  const getPlacementColor = (rate: number) => {
    if (rate >= 70) return "text-green-500"
    if (rate >= 40) return "text-yellow-500"
    return "text-red-500"
  }

  const getPartyColor = (party: string | null | undefined) => {
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

  const getPartyBadgeClassName = (party: string | null | undefined) => {
    if (!party) return ""
    switch (party.toLowerCase()) {
      case "republican":
        return "bg-red-600 text-white hover:bg-red-700"
      case "democrat":
        return "bg-blue-600 text-white hover:bg-blue-700"
      case "independent":
        return "bg-gray-600 text-white hover:bg-gray-700"
      default:
        return ""
    }
  }

  const getSpamRate = (campaign: Campaign) => {
    const total = campaign.inboxCount + campaign.spamCount + campaign.notDeliveredCount
    return total > 0 ? (campaign.spamCount / total) * 100 : 0
  }

  const renderSmsMessageWithLinks = (message: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g
    const parts = message.split(urlRegex)

    return parts.map((part, index) => {
      // Render URLs as plain text — links are shown in the CTA Links section below
      return <span key={index}>{part}</span>
    })
  }

  const prepareEmailHtml = (html: string, senderEmail?: string) => {
    const noLinkStyle = `<style>a { pointer-events: none !important; cursor: default !important; text-decoration: none !important; color: inherit !important; }</style>`
    if (html.includes("<head>")) {
      return html.replace("<head>", `<head><base target="_blank">${noLinkStyle}`)
    } else if (html.includes("<html>")) {
      return html.replace("<html>", `<html><head><base target="_blank">${noLinkStyle}</head>`)
    } else {
      return `<head><base target="_blank">${noLinkStyle}</head>${html}`
    }
  }

  const clearDateRange = () => {
    setDateRange({ from: undefined, to: undefined })
    setIsFromCalendarOpen(false)
    setIsToCalendarOpen(false)
  }

  // ── Mobile filter sheet: snapshot, commit, reset, clear-date helpers ──
  // Snapshot applied → draft each time the sheet opens
  useEffect(() => {
    if (mobileFiltersOpen) {
      setDraftSender(selectedSender)
      setDraftPartyFilter(selectedPartyFilter)
      setDraftStateFilter(selectedStateFilter)
      setDraftMessageFilters(selectedMessageFilters)
      setDraftDonationPlatform(selectedDonationPlatform)
      setDraftDateRange(dateRange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileFiltersOpen])

  // Commit drafts → applied state, close sheet → triggers a single refetch
  const applyMobileFilters = () => {
    setSelectedSender(draftSender)
    setSelectedPartyFilter(draftPartyFilter)
    setSelectedStateFilter(draftStateFilter)
    setSelectedMessageFilters(draftMessageFilters)
    // Sync legacy state for analytics view & API params
    setShowThirdParty(draftMessageFilters.includes("third_party"))
    setShowHouseFileOnly(draftMessageFilters.includes("house_file"))
    const emailOnly = draftMessageFilters.includes("email") && !draftMessageFilters.includes("sms")
    const smsOnly = draftMessageFilters.includes("sms") && !draftMessageFilters.includes("email")
    setSelectedMessageType(emailOnly ? "email" : smsOnly ? "sms" : "all")
    setSelectedDonationPlatform(draftDonationPlatform)
    setDateRange(draftDateRange)
    setMobileFiltersOpen(false)
  }

  // Reset draft filters only (used by Reset Filters button inside the sheet)
  const resetDraftFilters = () => {
    setDraftSender([])
    setDraftPartyFilter("all")
    setDraftStateFilter("all")
    setDraftMessageFilters([])
    setDraftDonationPlatform("all")
    setDraftDateRange({ from: undefined, to: undefined })
  }

  // Clear the draft date range (used when sheet is open)
  const clearDraftDateRange = () => {
    setDraftDateRange({ from: undefined, to: undefined })
    setIsFromCalendarOpen(false)
    setIsToCalendarOpen(false)
  }

  const resetFilters = () => {
    setSearchTerm("")
    setActiveSearchQuery("") // Reset active search query as well
    setDateRange({ from: undefined, to: undefined })
    setSelectedSender([])
    setSelectedPartyFilter("all")
    setSenderSearchTerm("") // Corrected variable name
    setSelectedMessageType("all")
    setSelectedDonationPlatform("all")
    setShowThirdParty(false)
    setShowHouseFileOnly(false)
    setSelectedMessageFilters([])
    setPendingMessageFilters([])
    setShowAutocomplete(false)
    setCurrentPage(1)
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

  // Auto-fit email zoom on mobile when a campaign is opened
  useEffect(() => {
    if (selectedCampaign && selectedCampaign.type !== "sms" && typeof window !== "undefined") {
      const isMobile = window.matchMedia("(max-width: 767px)").matches
      // Reset to a sensible default based on viewport so the 600px email fits
      setEmailZoom(isMobile ? 60 : 100)
      // Reset measured iframe height when opening a new campaign
      setIframeContentHeight(800)
    }
  }, [selectedCampaign])

  // Measured natural height of the rendered email iframe content
  const [iframeContentHeight, setIframeContentHeight] = useState<number>(800)
  const handleEmailIframeLoad = (e: React.SyntheticEvent<HTMLIFrameElement>) => {
    try {
      const iframe = e.currentTarget
      const doc = iframe.contentDocument
      if (!doc || !doc.body) return
      const measure = () => {
        const body = doc.body
        const html = doc.documentElement
        const h = Math.max(
          body.scrollHeight,
          body.offsetHeight,
          html.scrollHeight,
          html.offsetHeight,
        )
        if (h > 0) setIframeContentHeight(Math.min(Math.max(h + 24, 400), 8000))
      }
      // Initial measure + remeasure after images load
      measure()
      const imgs = doc.images
      let pending = imgs.length
      if (pending === 0) return
      Array.from(imgs).forEach((img) => {
        if (img.complete) {
          pending -= 1
          if (pending === 0) measure()
        } else {
          img.addEventListener("load", () => {
            pending -= 1
            if (pending <= 0) measure()
          })
          img.addEventListener("error", () => {
            pending -= 1
            if (pending <= 0) measure()
          })
        }
      })
    } catch {
      // Cross-origin or sandbox restriction — keep default height
    }
  }

  const handleGenerateShareLink = async (campaignId: number) => {
    try {
      setGeneratingShareLink(true)
      const response = await fetch(`/api/ci-campaigns/${campaignId}/share`, {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to generate share link")
      }

      const data = await response.json()
      const fullUrl = `${window.location.origin}/share/${data.shareToken}`
      setShareLink(fullUrl)
      setShareDialogOpen(true)
    } catch (error) {
      console.error("Error generating share link:", error)
    } finally {
      setGeneratingShareLink(false)
    }
  }

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopiedShareLink(true)
      setTimeout(() => setCopiedShareLink(false), 2000)
    } catch (error) {
      console.error("Error copying to clipboard:", error)
    }
  }

  const handleRefresh = () => {
    fetchCampaigns(true) // Call fetchCampaigns with isRefresh = true
  }

  const handleQuickAssign = async (campaign: Campaign, entityId: string) => {
    setAssigningCampaignId(campaign.id)
    try {
      const body =
        campaign.type === "sms"
          ? { smsIds: [campaign.id], entityId, createMapping: true }
          : { campaignIds: [campaign.id], entityId, createMapping: true }

      const res = await fetch("/api/ci-entities/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error("Failed to assign")

      toast({ title: "Assigned", description: "Message assigned and mapping created." })
      setAssignPopoverCampaignId(null)
      setAssignEntitySearch("")
      fetchCampaigns()
    } catch {
      toast({ title: "Error", description: "Failed to assign message.", variant: "destructive" })
    } finally {
      setAssigningCampaignId(null)
    }
  }

  const ciAccessLevel = resolvedPlan
    ? hasCompetitiveInsightsAccess(resolvedPlan, hasCompetitiveInsights, subscriptionStatus)
    : "none"

  const shouldShowPaywall = ciAccessLevel === "none" && !hasAdminAccess
  const shouldShowPreview = ciAccessLevel === "preview" && !hasAdminAccess
  const previewLimit = 5

  if (loading || loadingSubscription || resolvedPlan === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading competitive insights...</div>
      </div>
    )
  }

  const shouldShowPersonalBadge = (campaign: Campaign) => {
    // On Personal page, always show the badge for personal campaigns
    if (showPersonalBadge && campaign.source === "personal") {
      return true
    }
    // On main CI feed, only show if campaign's clientId matches current user's client
    if (!showPersonalBadge && campaign.source === "personal" && campaign.clientId === currentUserClient) {
      return true
    }
    return false
  }

  const shouldShowFollowingBadge = (campaign: Campaign) => {
    return campaign.entityId && subscribedEntityIds.includes(campaign.entityId)
  }

  const isDomainMappedToEntity = (campaign: Campaign): boolean => {
    if (!campaign.entityId || !campaign.entity) return true // If no entity, don't show unmapped badge

    const entityId = campaign.entityId
    const mappings = entityMappings[entityId]

    if (!mappings) return true // No mappings data yet, assume mapped

    // For SMS campaigns, check phone number against both phones and domains (short codes
    // are stored in senderDomain as numeric-only values rather than senderPhone).
    if (campaign.type === "sms" && campaign.phoneNumber) {
      const normalizedPhone = campaign.phoneNumber.replace(/[\s\-()]/g, "")
      const normalizedMappedPhones = mappings.phones.map((p: string) => p.replace(/[\s\-()]/g, ""))
      const normalizedMappedDomains = mappings.domains.map((d: string) => d.replace(/[\s\-()]/g, ""))
      return normalizedMappedPhones.includes(normalizedPhone) || normalizedMappedDomains.includes(normalizedPhone)
    }

    // For email campaigns, check sender email and domain
    const senderEmail = (campaign.senderEmail || "").toLowerCase()
    const senderDomain = senderEmail.split("@")[1]

    // Check if exact email is mapped
    if (mappings.emails.includes(senderEmail)) {
      return true
    }

    // Check if domain is mapped
    if (senderDomain && mappings.domains.includes(senderDomain)) {
      return true
    }

    return false
  }

  const calculateReportingMetrics = () => {
    const totalEmails = campaigns.length // Corrected to use the campaigns state directly

    const totalCTAs = campaigns.reduce((sum, campaign) => {
      return sum + (campaign.ctaLinks?.length || 0) // Added check for null/undefined ctaLinks
    }, 0)

    const ctaTypes = campaigns.reduce(
      (acc, campaign) => {
        ; (campaign.ctaLinks || []).forEach((link) => {
          // Added check for null/undefined ctaLinks
          // Check if link is new format (object with type) or old format (string)
          if (typeof link === "string") {
            // Old format - use URL pattern matching
            const lowerLink = link.toLowerCase()
            if (lowerLink.includes("donate") || lowerLink.includes("contribution") || lowerLink.includes("give")) {
              acc.donation++
            } else if (lowerLink.includes("petition") || lowerLink.includes("sign")) {
              acc.petition++
            } else if (lowerLink.includes("event") || lowerLink.includes("rsvp")) {
              acc.event++
            } else if (lowerLink.includes("volunteer")) {
              acc.volunteer++
            } else {
              acc.other++
            }
          } else {
            // New format - use stored type
            acc[link.type as keyof typeof acc]++
          }
        })
        return acc
      },
      { donation: 0, petition: 0, event: 0, volunteer: 0, other: 0 },
    )

    const mostCommonCTAType = Object.entries(ctaTypes).sort(([, a], [, b]) => b - a)[0]?.[0] || "N/A"

    // CTA type distribution for pie chart
    const ctaDistributionData = Object.entries(ctaTypes)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({
        name: type.charAt(0).toUpperCase() + type.slice(1),
        value: count,
      }))
      .sort((a, b) => b.value - a.value)

    const avgPerDay = campaigns.length > 0 ? (campaigns.length / Math.max(1, getDaySpan())).toFixed(1) : "0"

    // Volume over time (last 30 days)
    const volumeData = getVolumeOverTime()

    const dayOfWeekCounts = campaigns.reduce(
      (acc, campaign) => {
        const date = new Date(campaign.dateReceived)
        const dayIndex = date.getDay() // 0 = Sunday, 6 = Saturday
        acc[dayIndex]++
        return acc
      },
      [0, 0, 0, 0, 0, 0, 0] as number[],
    )

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const maxCount = Math.max(...dayOfWeekCounts, 1)

    const dayOfWeekData = dayOfWeekCounts.map((count, index) => ({
      day: dayNames[index],
      count,
      intensity: count / maxCount, // 0 to 1 for color intensity
    }))

    const mostRecentEmails = [...campaigns]
      .sort((a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime())
      .slice(0, 5)

    return {
      totalEmails,
      totalCTAs,
      mostCommonCTAType,
      avgPerDay,
      ctaDistributionData,
      volumeData,
      dayOfWeekData,
      mostRecentEmails,
    }
  }

  const getDaySpan = () => {
    if (campaigns.length === 0) return 1

    const dates = campaigns.map((c) => new Date(c.dateReceived).getTime())
    const minDate = Math.min(...dates)
    const maxDate = Math.max(...dates)
    const daySpan = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24))

    return Math.max(1, daySpan)
  }

  const getVolumeOverTime = () => {
    const dateCounts = campaigns.reduce(
      (acc, campaign) => {
        const date = format(new Date(campaign.dateReceived), "MMM dd")
        acc[date] = (acc[date] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    return Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        const dateA = new Date(a.date + ", 2025")
        const dateB = new Date(b.date + ", 2025")
        return dateA.getTime() - dateB.getTime()
      })
      .slice(-30) // Last 30 data points
  }

  const reportingMetrics = calculateReportingMetrics()

  const COLORS = ["#ef4445", "#627588", "#ec4899", "#f59e0b", "#10b981", "#6b7280"]

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-white">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm text-white">
              {entry.name}: {entry.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const handleLoadView = (filterSettings: any) => {
    setActiveSearchQuery(filterSettings.activeSearchQuery || "")
    setSearchTerm(filterSettings.searchTerm || "")

    // Handle backward compatibility: old views have selectedSender as string, new views as array
    if (filterSettings.selectedSender) {
      if (Array.isArray(filterSettings.selectedSender)) {
        setSelectedSender(filterSettings.selectedSender)
      } else if (typeof filterSettings.selectedSender === "string" && filterSettings.selectedSender !== "all") {
        // Convert old string format to array format
        setSelectedSender([filterSettings.selectedSender])
      } else {
        setSelectedSender([])
      }
    } else {
      setSelectedSender([])
    }
    setSelectedPartyFilter(filterSettings.selectedPartyFilter || "all")
    setSelectedMessageType(filterSettings.selectedMessageType || "all")
    setSelectedDonationPlatform(filterSettings.selectedDonationPlatform || "all")
    setShowThirdParty(filterSettings.showThirdParty || false)
    setShowHouseFileOnly(filterSettings.showHouseFileOnly || false)
    setSelectedMessageFilters(filterSettings.selectedMessageFilters || [])
    setDateRange({
      from: filterSettings.dateRange?.from ? new Date(filterSettings.dateRange.from) : undefined,
      to: filterSettings.dateRange?.to ? new Date(filterSettings.dateRange.to) : undefined,
    })
    setCurrentPage(1)
  }

  const getCurrentFilters = () => {
    return {
      activeSearchQuery,
      searchTerm,
      selectedSender,
      selectedPartyFilter,
      selectedMessageType,
      selectedDonationPlatform,
      showThirdParty,
      showHouseFileOnly,
      selectedMessageFilters,
      dateRange: {
        from: dateRange.from?.toISOString(),
        to: dateRange.to?.toISOString(),
      },
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 relative">
      {ciAccessLevel === "none" && (
        <PaywallOverlay
          requiredPlan="starter"
          requiredFeature="Competitive Insights"
          currentPlan={subscriptionPlan || "free"}
          subscriptionStatus={subscriptionStatus}
        />
      )}

      {!hideHeader && (
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              {isReportingView ? "Analytics" : "Competitive Insights"}
            </h1>
            {!isReportingView && (
              <p className="text-muted-foreground">Track and analyze political campaigns from across the spectrum</p>
            )}
          </div>
          {isReportingView && (
            <div className="flex items-center gap-1 text-xs border rounded-md overflow-hidden shrink-0">
              {([7, 30, 90, 365] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`px-3 py-1.5 transition-colors ${chartDays === d ? "bg-foreground text-background font-medium" : "hover:bg-muted text-muted-foreground"}`}
                >
                  {d === 365 ? "1Y" : `${d}D`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}



      {(subscriptionPlan === "free" || subscriptionPlan === "preview") && !hasAdminAccess && (
        <div
          className="mb-6 bg-gradient-to-r from-rip-red/10 to-rip-red/5 border border-rip-red/20 rounded-lg p-6"
          data-upgrade-banner
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-2">Upgrade to See More</h3>
              <p className="text-sm text-muted-foreground mb-4">
                You&apos;re currently on the Free/Preview plan and can only see the last 3 hours of data. Upgrade to access full history,
                follow more entities, and unlock advanced features.
              </p>
              {/* CHANGE: Using direct style attribute to bypass Tailwind */}
              <Button
                size="lg"
                onClick={() => router.push(`/${clientSlug}/billing?recommended=all`)}
                style={{ backgroundColor: "#EB3847", color: "white" }}
                className="hover:opacity-90 transition-opacity"
              >
                View Pricing Plans
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0"
              onClick={() => {
                const banner = document.querySelector("[data-upgrade-banner]")
                if (banner) {
                  ; (banner as HTMLElement).style.display = "none"
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {subscriptionPlan === "paid" && !hasAdminAccess && (
        <div
          className="mb-6 bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-lg p-6"
          data-paid-upgrade-banner
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-foreground mb-2">You&apos;re seeing the last 3 days</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Your Basic plan includes 3 days of campaign history. Upgrade to a higher tier to unlock more history,
                advanced filters, and the full campaign archive.
              </p>
              <Button
                size="lg"
                onClick={() => router.push(`/${clientSlug}/billing?recommended=all`)}
                style={{ backgroundColor: "#EB3847", color: "white" }}
                className="hover:opacity-90 transition-opacity"
              >
                Upgrade My Plan
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="flex-shrink-0"
              onClick={() => {
                const banner = document.querySelector("[data-paid-upgrade-banner]")
                if (banner) {
                  ; (banner as HTMLElement).style.display = "none"
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div
            className={`space-y-4 ${shouldShowPaywall || shouldShowPreview ? "pointer-events-none opacity-50" : ""}`}
          >
            <div className={`${subscriptionPlan === "free" && !hasAdminAccess ? "relative" : ""}`}>
              {/* Top row - Search bar centered (hidden on reporting view) */}
              <div className={`flex justify-center mb-6 ${isReportingView ? "hidden" : ""}`}>
                <div
                  className={`w-full max-w-2xl relative ${subscriptionPlan === "free" && !hasAdminAccess ? "blur-sm pointer-events-none" : ""}`}
                  ref={searchRef}
                >
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4 z-10" />
                  <Input
                    placeholder="Search by entity, email, subject, or content..."
                    value={searchTerm}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="pl-10"
                    disabled={
                      shouldShowPaywall || shouldShowPreview || (subscriptionPlan === "free" && !hasAdminAccess)
                    }
                  />
                  {showAutocomplete && autocompleteSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
                      {autocompleteSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full text-left px-4 py-2 hover:bg-muted transition-colors text-sm"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Mobile-only: active filter chips (horizontal scroll) ──── */}
              {(() => {
                type Chip = { key: string; label: string; onRemove: () => void }
                const chips: Chip[] = []
                if (searchTerm) {
                  chips.push({
                    key: "search",
                    label: `"${searchTerm.length > 24 ? searchTerm.slice(0, 24) + "…" : searchTerm}"`,
                    onRemove: () => handleSearchChange(""),
                  })
                }
                selectedSender.forEach((s) => {
                  chips.push({
                    key: `sender:${s}`,
                    label: s,
                    onRemove: () => setSelectedSender((prev) => prev.filter((x) => x !== s)),
                  })
                })
                if (selectedPartyFilter !== "all") {
                  const label =
                    selectedPartyFilter === "republican"
                      ? "Republican"
                      : selectedPartyFilter === "democrat"
                      ? "Democrat"
                      : "Independent"
                  chips.push({ key: "party", label, onRemove: () => setSelectedPartyFilter("all") })
                }
                if (selectedStateFilter !== "all") {
                  chips.push({ key: "state", label: selectedStateFilter, onRemove: () => setSelectedStateFilter("all") })
                }
                selectedMessageFilters.forEach((f) => {
                  const label =
                    f === "email" ? "Email" : f === "sms" ? "SMS" : f === "third_party" ? "Third Party" : "House File"
                  chips.push({
                    key: `msg:${f}`,
                    label,
                    onRemove: () => {
                      const next = selectedMessageFilters.filter((x) => x !== f)
                      setSelectedMessageFilters(next)
                      setShowThirdParty(next.includes("third_party"))
                      setShowHouseFileOnly(next.includes("house_file"))
                      const emailOnly = next.includes("email") && !next.includes("sms")
                      const smsOnly = next.includes("sms") && !next.includes("email")
                      setSelectedMessageType(emailOnly ? "email" : smsOnly ? "sms" : "all")
                    },
                  })
                })
                if (selectedDonationPlatform !== "all") {
                  chips.push({
                    key: "platform",
                    label: selectedDonationPlatform.charAt(0).toUpperCase() + selectedDonationPlatform.slice(1),
                    onRemove: () => setSelectedDonationPlatform("all"),
                  })
                }
                if (dateRange.from || dateRange.to) {
                  const f = dateRange.from ? format(dateRange.from, "MMM d") : "…"
                  const t = dateRange.to ? format(dateRange.to, "MMM d") : "…"
                  chips.push({ key: "date", label: `${f} – ${t}`, onRemove: clearDateRange })
                }

                const activeCount = chips.length

                return (
                  <>
                    {/* Active filter chips — mobile only */}
                    {activeCount > 0 && (
                      <div className="md:hidden -mx-1 mb-3 overflow-x-auto">
                        <div className="flex gap-2 px-1 pb-1 w-max">
                          {chips.map((chip) => (
                            <Badge
                              key={chip.key}
                              variant="secondary"
                              className="flex items-center gap-1 px-3 py-1 whitespace-nowrap"
                            >
                              {chip.label}
                              <button
                                onClick={chip.onRemove}
                                className="ml-1 hover:text-destructive"
                                aria-label={`Remove ${chip.label}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Filters trigger + Refresh — mobile only */}
                    <div className="md:hidden flex items-center gap-2 mb-1">
                      <Button
                        variant="outline"
                        className="flex-1 justify-center bg-transparent"
                        onClick={() => setMobileFiltersOpen(true)}
                        disabled={shouldShowPaywall || shouldShowPreview}
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Filters
                        {activeCount > 0 && (
                          <Badge
                            variant="secondary"
                            className="ml-2 h-5 min-w-5 rounded-full px-1.5 text-xs"
                          >
                            {activeCount}
                          </Badge>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRefresh}
                        disabled={shouldShowPaywall || shouldShowPreview || refreshing}
                        aria-label="Refresh"
                        className="bg-transparent"
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                      </Button>
                      {activeCount > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={resetFilters}
                          aria-label="Reset filters"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </>
                )
              })()}

              {/* Mobile bottom sheet backdrop */}
              {mobileFiltersOpen && (
                <div
                  className="md:hidden fixed inset-0 z-40 bg-black/60"
                  onClick={() => setMobileFiltersOpen(false)}
                  aria-hidden="true"
                />
              )}

              {/* Second row - Filters
                  Desktop: inline flex-wrap row (original layout)
                  Mobile: bottom sheet that slides up when mobileFiltersOpen=true */}
              <div
                className={cn(
                  // Desktop layout (md+)
                  "md:relative md:z-auto md:inset-auto md:transform-none md:rounded-none md:border-0 md:bg-transparent md:p-0 md:max-h-none md:overflow-visible md:flex md:flex-row md:flex-wrap md:gap-2 md:items-center md:transition-none md:translate-y-0",
                  // Mobile bottom sheet
                  "fixed inset-x-0 bottom-0 z-50 bg-background border-t border-border rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto flex flex-col gap-3 transition-transform duration-300 ease-in-out shadow-2xl",
                  mobileFiltersOpen ? "translate-y-0" : "translate-y-full",
                  subscriptionPlan === "free" && !hasAdminAccess ? "blur-sm pointer-events-none" : "",
                )}
              >
                {/* Mobile sheet header — Cancel discards drafts */}
                <div className="md:hidden flex items-center justify-between sticky top-0 -mx-4 -mt-4 px-4 py-3 bg-background border-b border-border z-10">
                  <h3 className="font-semibold text-base">Filters</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="font-medium text-muted-foreground"
                  >
                    Cancel
                  </Button>
                </div>
                {/* Entity filter — temporarily hidden on reporting view, re-enable by removing the !isReportingView condition */}
                {!isReportingView && (() => {
                  // Inside the mobile filter sheet, bind to draft state. Otherwise applied state.
                  const senderValue = mobileFiltersOpen ? draftSender : selectedSender
                  const setSenderValue = mobileFiltersOpen ? setDraftSender : setSelectedSender
                  return (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full md:w-[200px] justify-between"
                      disabled={shouldShowPaywall || shouldShowPreview}
                    >
                      {senderValue.length === 0
                        ? "Filter by entity"
                        : `${senderValue.length} selected`}
                      <ChevronRight className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0" align="start">
                    <div className="sticky top-0 z-50 bg-background p-2 border-b">
                      <Input
                        ref={senderSearchInputRef}
                        placeholder="Search entities..."
                        value={senderSearchTerm}
                        onChange={(e) => setSenderSearchTerm(e.target.value)}
                        className="h-8"
                      />
                    </div>
                    <div className="max-h-[240px] overflow-y-auto p-2">
                      {senderValue.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mb-2 text-xs"
                          onClick={() => setSenderValue([])}
                        >
                          Clear all ({senderValue.length})
                        </Button>
                      )}
                      {filteredSenders
                        .filter((sender) => sender && sender.trim() !== "")
                        .map((sender) => (
                          <div
                            key={sender}
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                            onClick={() => {
                              setSenderValue(prev =>
                                prev.includes(sender)
                                  ? prev.filter(s => s !== sender)
                                  : [...prev, sender]
                              )
                            }}
                          >
                            <Checkbox
                              checked={senderValue.includes(sender)}
                              onCheckedChange={() => { }}
                            />
                            <span className="flex-1 truncate text-sm">{sender}</span>
                            {isEntityFollowed(sender) && (
                              <Badge
                                variant="outline"
                                className="text-xs bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
                              >
                                <Star className="h-3 w-3" />
                              </Badge>
                            )}
                          </div>
                        ))}
                      {filteredSenders.length === 0 && (
                        <div className="p-4 text-center text-sm text-muted-foreground">No entities found</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                  )
                })()}

                <Select
                  value={mobileFiltersOpen ? draftPartyFilter : selectedPartyFilter}
                  onValueChange={mobileFiltersOpen ? setDraftPartyFilter : setSelectedPartyFilter}
                  disabled={shouldShowPaywall || shouldShowPreview}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Filter by party" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Parties</SelectItem>
                    <SelectItem value="republican">Republican</SelectItem>
                    <SelectItem value="democrat">Democrat</SelectItem>
                    <SelectItem value="third party">Independent</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={mobileFiltersOpen ? draftStateFilter : selectedStateFilter}
                  onValueChange={mobileFiltersOpen ? setDraftStateFilter : setSelectedStateFilter}
                  disabled={shouldShowPaywall || shouldShowPreview}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Filter by state" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="all">All States</SelectItem>
                    {US_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Multi-select message type filter */}
                {(() => {
                  // Inside the mobile filter sheet: read/write draft. Otherwise: applied.
                  const messageFiltersValue = mobileFiltersOpen ? draftMessageFilters : selectedMessageFilters
                  const setMessageFiltersValue = mobileFiltersOpen ? setDraftMessageFilters : setSelectedMessageFilters
                  return (
                <Popover
                  open={isMessageFilterOpen}
                  onOpenChange={(open) => {
                    if (open) {
                      // Sync pending to current (draft when in sheet, applied otherwise)
                      setPendingMessageFilters(messageFiltersValue)
                    }
                    setIsMessageFilterOpen(open)
                  }}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full md:w-auto bg-transparent justify-between gap-2"
                      disabled={shouldShowPaywall || shouldShowPreview}
                    >
                      {messageFiltersValue.length === 0
                        ? "All Messages"
                        : messageFiltersValue
                            .map((f) =>
                              f === "email"
                                ? "Email"
                                : f === "sms"
                                ? "SMS"
                                : f === "third_party"
                                ? "Third Party"
                                : "House File"
                            )
                            .join(", ")}
                      {messageFiltersValue.length > 0 && (
                        <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs">
                          {messageFiltersValue.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[210px] p-2" align="start">
                    <div className="space-y-1">
                      {[
                        { value: "email", label: "Email" },
                        { value: "sms", label: "SMS" },
                        { value: "third_party", label: "Third Party" },
                        { value: "house_file", label: "House File" },
                      ].map(({ value, label }) => (
                        <label
                          key={value}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={pendingMessageFilters.includes(value)}
                            onCheckedChange={(checked) => {
                              setPendingMessageFilters((prev) =>
                                checked ? [...prev, value] : prev.filter((f) => f !== value)
                              )
                            }}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="pt-2 mt-1 border-t flex items-center gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => {
                          const next = pendingMessageFilters
                          setMessageFiltersValue(next)
                          // Only sync legacy state when committing directly to applied state.
                          // When in the mobile sheet, the sheet's "Apply Filters" button does the syncing.
                          if (!mobileFiltersOpen) {
                            setShowThirdParty(next.includes("third_party"))
                            setShowHouseFileOnly(next.includes("house_file"))
                            const emailOnly = next.includes("email") && !next.includes("sms")
                            const smsOnly = next.includes("sms") && !next.includes("email")
                            setSelectedMessageType(emailOnly ? "email" : smsOnly ? "sms" : "all")
                          }
                          setIsMessageFilterOpen(false)
                        }}
                      >
                        Apply
                      </Button>
                      {pendingMessageFilters.length > 0 && (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setPendingMessageFilters([])}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
                  )
                })()}

                {/* Platform Filter - Conditional rendering */}
                {(currentUserClient === "winred" || currentUserClient === "RIP") && (
                  <Select
                    value={mobileFiltersOpen ? draftDonationPlatform : selectedDonationPlatform}
                    onValueChange={mobileFiltersOpen ? setDraftDonationPlatform : setSelectedDonationPlatform}
                  >
                    <SelectTrigger className="w-full sm:w-[180px]">
                      <SelectValue placeholder="All Platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      <SelectItem value="winred">WinRed</SelectItem>
                      <SelectItem value="actblue">ActBlue</SelectItem>
                      <SelectItem value="anedot">Anedot</SelectItem>
                      <SelectItem value="psq">PSQ</SelectItem>
                      <SelectItem value="ngpvan">NGPVAN</SelectItem>
                      <SelectItem value="substack">Substack</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                {/* Date Range Filter (hidden on reporting view) */}
                {(() => {
                  // Inside the mobile filter sheet: read/write draftDateRange. Otherwise: applied dateRange.
                  const dateRangeValue = mobileFiltersOpen ? draftDateRange : dateRange
                  const setDateRangeValue = mobileFiltersOpen ? setDraftDateRange : setDateRange
                  const clearDateRangeValue = mobileFiltersOpen ? clearDraftDateRange : clearDateRange
                  return (
                <div className={`flex items-center gap-2 ${isReportingView ? "hidden" : ""}`}>
                  <Popover open={isFromCalendarOpen} onOpenChange={setIsFromCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[140px] justify-start text-left font-normal bg-transparent"
                        disabled={shouldShowPaywall || shouldShowPreview}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRangeValue.from ? (
                          format(dateRangeValue.from, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">From</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRangeValue.from}
                        onSelect={(date) => {
                          setDateRangeValue((prev) => ({ ...prev, from: date }))
                          setIsFromCalendarOpen(false)
                        }}
                        numberOfMonths={1}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <span className="text-muted-foreground">-</span>

                  <Popover open={isToCalendarOpen} onOpenChange={setIsToCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[140px] justify-start text-left font-normal bg-transparent"
                        disabled={shouldShowPaywall || shouldShowPreview}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRangeValue.to ? (
                          format(dateRangeValue.to, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">To</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRangeValue.to}
                        onSelect={(date) => {
                          setDateRangeValue((prev) => ({ ...prev, to: date }))
                          setIsToCalendarOpen(false)
                        }}
                        disabled={(date) => {
                          if (dateRangeValue.from) return date < dateRangeValue.from
                          return false
                        }}
                        numberOfMonths={1}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {(dateRangeValue.from || dateRangeValue.to) && (
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearDateRangeValue}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                  )
                })()}

                <Button
                  variant="outline"
                  onClick={handleRefresh}
                  className="w-full md:w-auto bg-transparent"
                  disabled={shouldShowPaywall || shouldShowPreview || refreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                  {refreshing ? "Refreshing..." : "Refresh"}
                </Button>

                <Button
                  variant="outline"
                  onClick={mobileFiltersOpen ? resetDraftFilters : resetFilters}
                  className="w-full md:w-auto bg-transparent"
                  disabled={
                    shouldShowPaywall ||
                    shouldShowPreview ||
                    (mobileFiltersOpen
                      ? !draftDateRange.from &&
                        !draftDateRange.to &&
                        draftSender.length === 0 &&
                        draftPartyFilter === "all" &&
                        draftStateFilter === "all" &&
                        draftMessageFilters.length === 0 &&
                        draftDonationPlatform === "all"
                      : !searchTerm &&
                        !dateRange.from &&
                        !dateRange.to &&
                        selectedSender.length === 0 &&
                        selectedPartyFilter === "all" &&
                        selectedMessageFilters.length === 0 &&
                        selectedDonationPlatform === "all")
                  }
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>

                {/* Mobile sheet — sticky Apply Filters footer */}
                <div className="md:hidden sticky bottom-0 -mx-4 -mb-8 px-4 pt-3 pb-6 bg-background border-t border-border mt-2">
                  <Button
                    onClick={applyMobileFilters}
                    className="w-full"
                    disabled={shouldShowPaywall || shouldShowPreview}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>

              {/* Display selected entities as badges */}
              {selectedSender.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {selectedSender.map((sender) => (
                    <Badge
                      key={sender}
                      variant="secondary"
                      className="flex items-center gap-1 px-3 py-1"
                    >
                      {sender}
                      <button
                        onClick={() => setSelectedSender(prev => prev.filter(s => s !== sender))}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {subscriptionPlan === "free" && !hasAdminAccess && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <Badge
                    variant="secondary"
                    className="text-sm font-semibold shadow-lg border-rip-red/20 bg-background/95 px-4 py-2"
                  >
                    🔒 Upgrade to use Search & Filters
                  </Badge>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <CiViewsManager
            clientSlug={clientSlug}
            currentFilters={getCurrentFilters()}
            onLoadView={handleLoadView}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {activeView === "emails" ? (
          <>
            {!shouldShowPaywall && !shouldShowPreview && (
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalCampaigns)}{" "}
                  of {totalCampaigns} campaigns
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Per page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="relative">
              {shouldShowPaywall && (
                <PaywallOverlay
                  title="Unlock Competitive Insights"
                  description="Get unlimited access to our comprehensive political email database and see what campaigns are sending."
                  features={[
                    "Unlimited access to the Competitive Insights database",
                    "See what political campaigns are sending",
                  ]}
                  currentPlan={subscriptionPlan || "starter"}
                  upgradePlan="Competitive Insights Add-on"
                  upgradePrice="$500"
                  upgradeNote="This plan does not include other features"
                  upgradeType="addon"
                />
              )}

              <div className={shouldShowPaywall ? "blur-md pointer-events-none" : ""}>
                <Card>
                  <CardContent className="p-0">
                    {/* Mobile card list */}
                    <div className="md:hidden divide-y">
                      {currentPaginatedCampaigns.map((campaign, index) => {
                        const isBlurred = shouldShowPreview && index >= previewLimit
                        const preview =
                          campaign.type !== "sms"
                            ? cleanEmailPreview(campaign.emailPreview, campaign.emailContent)
                            : ""
                        return (
                          <div
                            key={campaign.id}
                            className={`p-4 hover:bg-muted/30 cursor-pointer transition-colors ${isBlurred ? "blur-sm" : ""} ${campaign.isHidden && resolvedUser?.role === "super_admin" ? "opacity-60" : ""}`}
                            onClick={() => {
                              if (!shouldShowPreview || index < previewLimit) {
                                setSelectedCampaign(campaign)
                                fetch("/api/track-view", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: campaign.id, type: campaign.type }),
                                }).catch(() => {})
                              }
                            }}
                          >
                            {/* Row 1: icon + sender + date */}
                            <div className="flex items-start gap-2">
                              {campaign.type === "sms" ? (
                                <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              ) : (
                                <Mail className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                              )}
                              <div className="font-medium text-sm truncate flex-1 min-w-0">
                                {campaign.entity ? campaign.entity.name : campaign.senderName}
                              </div>
                              <div className="text-xs text-muted-foreground flex-shrink-0 text-right">
                                <div>{new Date(campaign.dateReceived).toLocaleDateString()}</div>
                                <div>
                                  {new Date(campaign.dateReceived).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* Row 2: badges */}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {campaign.isHidden && resolvedUser?.role === "super_admin" && (
                                <Badge variant="outline" className="text-xs bg-muted">
                                  <EyeOff className="h-3 w-3 mr-1" />
                                  Hidden
                                </Badge>
                              )}
                              {shouldShowPersonalBadge(campaign) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700"
                                >
                                  <User className="h-3 w-3 mr-1" />
                                  Personal
                                </Badge>
                              )}
                              {campaign.entity && shouldShowFollowingBadge(campaign) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
                                >
                                  <Star className="h-3 w-3 mr-1" />
                                  Following
                                </Badge>
                              )}
                              {campaign.entity && !isDomainMappedToEntity(campaign) && (
                                <Badge
                                  variant="outline"
                                  className="text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                                >
                                  <Info className="h-3 w-3 mr-1" />
                                  Third Party
                                </Badge>
                              )}
                              {campaign.entity?.party && (
                                <Badge
                                  variant={getPartyColor(campaign.entity.party)}
                                  className={`text-xs capitalize ${getPartyBadgeClassName(campaign.entity.party)}`}
                                >
                                  {campaign.entity.party}
                                </Badge>
                              )}
                              {campaign.entity?.state && (
                                <Badge variant="outline" className="text-xs">
                                  {campaign.entity.state}
                                </Badge>
                              )}
                            </div>

                            {/* Row 3: number/email */}
                            <div className="text-xs text-muted-foreground truncate mt-2">
                              {campaign.type === "sms" ? campaign.phoneNumber : campaign.senderEmail}
                            </div>

                            {/* Row 4: subject (clamp 2) */}
                            {campaign.subject && (
                              <div className="text-sm font-medium mt-2 line-clamp-2 break-words">
                                {campaign.subject}
                              </div>
                            )}

                            {/* Row 5: preview (clamp 2) */}
                            {preview && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2 break-words">
                                {preview}
                              </div>
                            )}

                            {/* Assign sender (super admin) */}
                            {resolvedUser?.role === "super_admin" &&
                              (campaign.entity ? !isDomainMappedToEntity(campaign) : true) && (
                                <button
                                  className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setAssignDialogCampaign(campaign)
                                    setAssignPopoverCampaignId(campaign.id)
                                    setAssignEntitySearch("")
                                  }}
                                >
                                  <UserPlus className="h-3 w-3" />
                                  {campaign.entity ? "Assign sender" : "Assign to entity"}
                                </button>
                              )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Desktop table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="text-left p-4 font-medium text-sm">Sender</th>
                            <th className="text-left p-4 font-medium text-sm">Subject</th>
                            <th className="text-left p-4 font-medium text-sm">Date</th>
                            {/* <th className="text-left p-4 font-medium text-sm">Status</th> */}
                          </tr>
                        </thead>
                        <tbody>
                          {currentPaginatedCampaigns.map((campaign, index) => (
                            <tr
                              key={campaign.id}
                              className={`border-b hover:bg-muted/30 cursor-pointer transition-colors ${shouldShowPreview && index >= previewLimit ? "blur-sm" : ""
                                } ${campaign.isHidden && resolvedUser?.role === "super_admin" ? "opacity-60" : ""}`}
                              onClick={() => {
                                if (!shouldShowPreview || index < previewLimit) {
                                  setSelectedCampaign(campaign)
                                  // Fire-and-forget view tracking
                                  fetch("/api/track-view", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ id: campaign.id, type: campaign.type }),
                                  }).catch(() => {})
                                }
                              }}
                            >
                              <td className="p-4">
                                <div className="flex items-start gap-2">
                                  {campaign.type === "sms" ? (
                                    <Smartphone className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                                  ) : (
                                    <Mail className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    {campaign.entity ? (
                                      <>
                                        <div className="flex items-center gap-2 mb-1">
                                          <div className="font-medium text-sm truncate">{campaign.entity.name}</div>
                                          {campaign.isHidden && resolvedUser?.role === "super_admin" && (
                                            <Badge variant="outline" className="text-xs bg-muted">
                                              <EyeOff className="h-3 w-3 mr-1" />
                                              Hidden
                                            </Badge>
                                          )}
                                          {shouldShowPersonalBadge(campaign) && ( // Use helper function
                                            <Badge
                                              variant="outline"
                                              className="text-xs bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700"
                                            >
                                              <User className="h-3 w-3 mr-1" />
                                              Personal
                                            </Badge>
                                          )}
                                          {shouldShowFollowingBadge(campaign) && (
                                            <Badge
                                              variant="outline"
                                              className="text-xs bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700"
                                            >
                                              <Star className="h-3 w-3 mr-1" />
                                              Following
                                            </Badge>
                                          )}
                                          {!isDomainMappedToEntity(campaign) && (
                                            <Badge
                                              variant="outline"
                                              className="text-xs bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                                            >
                                              <Info className="h-3 w-3 mr-1" />
                                              Third Party
                                            </Badge>
                                          )}
                                          {(campaign.entity.party || campaign.entity.state) && (
                                            <div className="flex flex-wrap gap-1">
                                              {campaign.entity.party && (
                                                <Badge
                                                  variant={getPartyColor(campaign.entity.party)}
                                                  className={`text-xs capitalize ${getPartyBadgeClassName(campaign.entity.party)}`}
                                                >
                                                  {campaign.entity.party}
                                                </Badge>
                                              )}
                                              {campaign.entity.state && (
                                                <Badge variant="outline" className="text-xs">
                                                  {campaign.entity.state}
                                                </Badge>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                        {campaign.type === "sms" ? (
                                          <div className="text-xs text-muted-foreground truncate">
                                            {campaign.phoneNumber}
                                          </div>
                                        ) : (
                                          <>
                                            <div className="text-xs text-muted-foreground truncate">
                                              {campaign.senderName}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                              {campaign.senderEmail}
                                            </div>
                                          </>
                                        )}
                                        {resolvedUser?.role === "super_admin" && !isDomainMappedToEntity(campaign) && (
                                          <button
                                            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setAssignDialogCampaign(campaign); setAssignPopoverCampaignId(campaign.id); setAssignEntitySearch("") }}
                                          >
                                            <UserPlus className="h-3 w-3" />
                                            Assign sender
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div className="flex items-center gap-2 mb-1">
                                          <div className="font-medium text-sm truncate">{campaign.senderName}</div>
                                          {shouldShowPersonalBadge(campaign) && ( // Use helper function
                                            <Badge
                                              variant="outline"
                                              className="text-xs bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700"
                                            >
                                              <User className="h-3 w-3 mr-1" />
                                              Personal
                                            </Badge>
                                          )}
                                          {campaign.isHidden && resolvedUser?.role === "super_admin" && (
                                            <Badge variant="outline" className="text-xs bg-muted">
                                              <EyeOff className="h-3 w-3 mr-1" />
                                              Hidden
                                            </Badge>
                                          )}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
                                          {campaign.type === "sms" ? campaign.phoneNumber : campaign.senderEmail}
                                        </div>
                                        {resolvedUser?.role === "super_admin" && (
                                          <button
                                            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
                                            onClick={(e) => { e.stopPropagation(); setAssignDialogCampaign(campaign); setAssignPopoverCampaignId(campaign.id); setAssignEntitySearch("") }}
                                          >
                                            <UserPlus className="h-3 w-3" />
                                            Assign to entity
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="p-4">
                                <div>
                                  <div className="text-sm font-medium truncate max-w-md">{campaign.subject}</div>
                                  {campaign.type !== "sms" && (cleanEmailPreview(campaign.emailPreview, campaign.emailContent)) && (
                                    <div className="text-xs text-muted-foreground truncate max-w-md mt-1">
                                      {cleanEmailPreview(campaign.emailPreview, campaign.emailContent)}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Calendar className="h-4 w-4" />
                                    {new Date(campaign.dateReceived).toLocaleDateString()}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {new Date(campaign.dateReceived).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                </div>
                              </td>
                              {/* <td className="p-4">
                                <div className="flex flex-wrap gap-1">
                                  {campaign.inboxCount > 0 && (
                                    <Badge
                                      variant="secondary"
                                      className="bg-green-500/10 text-green-500 border-green-500/20"
                                    >
                                      Inbox
                                    </Badge>
                                  )}
                                  {campaign.spamCount > 0 && (
                                    <Badge variant="secondary" className="bg-red-500/10 text-red-500 border-red-500/20">
                                      Spam
                                    </Badge>
                                  )}
                                  {campaign.inboxCount === 0 && campaign.spamCount === 0 && (
                                    <span className="text-xs text-muted-foreground">No data</span>
                                  )}
                                </div>
                              </td> */}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {campaigns.length === 0 && !loading && (
                      <div className="text-center py-12 text-muted-foreground">
                        {subscriptionsOnly
                          ? totalCampaigns === 0
                            ? "Follow entities to see their campaigns here. Browse the Feed to discover entities you want to track."
                            : "No campaigns found matching your filters. Try adjusting your search criteria or date range."
                          : totalCampaigns === 0
                            ? "No competitive insights data available yet. New campaigns will appear here as they are detected."
                            : "No campaigns found matching your filters"}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {!shouldShowPaywall && !shouldShowPreview && totalCampaigns > 0 && (
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {shouldShowPaywall ? (
              <PaywallOverlay
                title="Unlock Competitive Insights Reporting"
                description="Upgrade to Professional or Enterprise to access competitive intelligence analytics."
                features={[
                  "Detailed entity analytics",
                  "Email volume trends",
                  "Tag distribution analysis",
                  "Exportable reports",
                ]}
                clientSlug={clientSlug}
              />
            ) : (
              <CiAnalyticsView
                clientSlug={clientSlug}
                selectedSender={selectedSender}
                selectedPartyFilter={selectedPartyFilter}
                selectedStateFilter={selectedStateFilter}
                selectedMessageType={selectedMessageType}
                selectedDonationPlatform={selectedDonationPlatform}
                dateRange={dateRange}
                shouldShowPreview={shouldShowPreview}
                showThirdParty={showThirdParty}
                showHouseFileOnly={showHouseFileOnly}
                externalChartDays={isReportingView ? chartDays : undefined}
              />
            )}
          </>
        )}

        {/* Campaign Detail Dialog */}
        {selectedCampaign && (
          <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
            <DialogContent className="!max-w-[1400px] !w-[95vw] md:!w-[85vw] max-h-[90vh] md:max-h-[85vh] overflow-y-auto p-4 md:p-6">
              {selectedCampaign && (
                <>
                  <DialogHeader>
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
                      <div className="flex-1 min-w-0 pr-8 md:pr-0">
                        <DialogTitle className="text-base md:text-xl break-words">{selectedCampaign.subject}</DialogTitle>
                        <DialogDescription asChild>
                          <div className="flex flex-col gap-1 mt-2 text-left">
                            {/* Entity information */}
                            {selectedCampaign.entity && (
                              <div className="flex flex-col gap-1 mb-2">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-semibold text-foreground break-words">
                                    {selectedCampaign.entity.name}
                                  </span>
                                  <span className="text-muted-foreground text-sm">
                                    ({selectedCampaign.entity.type?.replace(/_/g, " ")})
                                  </span>
                                  <Button
                                    variant="link"
                                    size="sm"
                                    className="h-auto p-0 text-xs"
                                    onClick={() => window.open(`/directory/${nameToSlug(selectedCampaign.entity?.name || "")}`, "_blank")}
                                  >
                                    [View Profile]
                                  </Button>
                                </div>
                                {selectedCampaign.entity.party && (
                                  <div>
                                    <Badge
                                      variant={getPartyColor(selectedCampaign.entity.party)}
                                      className={`text-xs capitalize ${getPartyBadgeClassName(selectedCampaign.entity.party)}`}
                                    >
                                      {selectedCampaign.entity.party}
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="flex items-start gap-2 text-sm min-w-0">
                              {selectedCampaign.type === "sms" ? (
                                <Smartphone className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              ) : (
                                <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1 text-left">
                                <span className="font-medium break-words">{selectedCampaign.senderName}</span>
                                <span className="text-muted-foreground text-xs md:text-sm break-all">
                                  {selectedCampaign.type === "sms"
                                    ? selectedCampaign.phoneNumber
                                    : selectedCampaign.senderEmail}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4 flex-shrink-0" />
                              {new Date(selectedCampaign.dateReceived).toLocaleDateString()}
                            </div>
                          </div>
                        </DialogDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:mr-8">
                        {resolvedUser?.role === "super_admin" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!selectedCampaign.id) return

                              try {
                                const method = selectedCampaign.isHidden ? "DELETE" : "POST"
                                const endpoint =
                                  selectedCampaign.type === "sms"
                                    ? `/api/sms/${selectedCampaign.id}/hide`
                                    : `/api/competitive-insights/${selectedCampaign.id}/hide`

                                const response = await fetch(endpoint, { method })

                                if (!response.ok) throw new Error("Failed to toggle hide")

                                toast({
                                  title: selectedCampaign.isHidden ? "Unhidden" : "Hidden",
                                  description: `Campaign ${selectedCampaign.isHidden ? "unhidden" : "hidden"} successfully`,
                                })

                                // Refresh the list
                                fetchCampaigns()
                                setSelectedCampaign(null)
                              } catch (error) {
                                toast({
                                  title: "Error",
                                  description: "Failed to toggle hide status",
                                  variant: "destructive",
                                })
                              }
                            }}
                            className="gap-2"
                          >
                            {selectedCampaign.isHidden ? (
                              <>
                                <Eye className="h-4 w-4" />
                                Unhide
                              </>
                            ) : (
                              <>
                                <EyeOff className="h-4 w-4" />
                                Hide
                              </>
                            )}
                          </Button>
                        )}
                        {selectedCampaign.entity && (
                          <CiEntitySubscribeButton
                            entityId={selectedCampaign.entity.id}
                            entityName={selectedCampaign.entity.name}
                          />
                        )}
                        <div className="flex items-center gap-1">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateShareLink(selectedCampaign.id as number)}
                          disabled={generatingShareLink}
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          {generatingShareLink ? "Generating..." : "Share"}
                        </Button>
                      </div>
                    </div>
                  </DialogHeader>

                  <Tabs defaultValue="preview" className="mt-4">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="preview">
                        {selectedCampaign.type === "sms" ? "Message" : "Email Preview"}
                      </TabsTrigger>
                      <TabsTrigger value="links">CTA Links ({selectedCampaign.ctaLinks.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="preview" className="mt-4">
                      {selectedCampaign.type === "sms" ? (
                        <div className="rounded-lg border bg-white p-6">
                          <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                            <Phone className="h-4 w-4" />
                            <span>From: {selectedCampaign.phoneNumber}</span>
                          </div>
                          <div className="text-black whitespace-pre-wrap break-words">
                            {renderSmsMessageWithLinks(selectedCampaign.emailPreview || "")}
                          </div>
                        </div>
                      ) : selectedCampaign.emailContent ? (
                        <div
                          className="rounded-lg border bg-white overflow-x-auto overflow-y-hidden"
                          style={{
                            // Outer wrapper uses the visually-scaled height so there's
                            // no phantom whitespace below the scaled iframe.
                            height: `${(iframeContentHeight * emailZoom) / 100}px`,
                          }}
                        >
                          <div
                            style={{
                              transform: `scale(${emailZoom / 100})`,
                              transformOrigin: "top left",
                              width: `${10000 / emailZoom}%`,
                              height: `${iframeContentHeight}px`,
                            }}
                          >
                            <iframe
                              srcDoc={prepareEmailHtml(selectedCampaign.emailContent, selectedCampaign.senderEmail)}
                              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
                              onLoad={handleEmailIframeLoad}
                              style={{ width: "100%", height: `${iframeContentHeight}px` }}
                              className="border-0 block"
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
                      {selectedCampaign.ctaLinks.length > 0 ? (
                        <div className="space-y-3">
                          {selectedCampaign.ctaLinks.map((link, idx) => {
                            const url = typeof link === "string" ? link : link.url
                            const finalUrl = typeof link === "string" ? null : link.finalUrl
                            const strippedFinalUrl = typeof link === "string" ? null : (link.strippedFinalUrl || (link as any).strippedFinalURL)
                            const type = typeof link === "string" ? null : link.type

                            const displayUrl = strippedFinalUrl || finalUrl || url // Show stripped URL first, then final URL, then original

                            return (
                              <div key={idx} className="rounded-lg border bg-muted/20 p-3">
                                <div className="flex flex-col gap-2">
                                  {type && (
                                    <div>
                                      <Badge variant="secondary" className="capitalize">
                                        {type}
                                      </Badge>
                                    </div>
                                  )}
                                  <a
                                    href={displayUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-2 text-rip-red hover:underline break-all text-sm min-w-0"
                                  >
                                    <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                    <span className="min-w-0 break-all">{displayUrl}</span>
                                  </a>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">No CTA links found</div>
                      )}
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Email</DialogTitle>
              <DialogDescription>Anyone with this link can view this email.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Input value={shareLink} readOnly className="flex-1" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyShareLink}
                  className="flex-shrink-0 bg-transparent"
                >
                  {copiedShareLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This link never expires. Views are tracked for analytics.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Quick-assign Dialog — super_admin only */}
      <Dialog
        open={!!assignPopoverCampaignId}
        onOpenChange={(open) => {
          if (!open) {
            setAssignPopoverCampaignId(null)
            setAssignDialogCampaign(null)
            setAssignEntitySearch("")
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Assign to Entity
            </DialogTitle>
            <DialogDescription>
              {assignDialogCampaign && (
                <>
                  Assign{" "}
                  <span className="font-mono text-xs font-medium text-foreground">
                    {assignDialogCampaign.type === "sms"
                      ? assignDialogCampaign.phoneNumber
                      : assignDialogCampaign.senderEmail}
                  </span>{" "}
                  to an entity and create a permanent mapping.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-1">
            <input
              autoFocus
              placeholder="Search entity..."
              value={assignEntitySearch}
              onChange={(e) => setAssignEntitySearch(e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            <div className="max-h-64 overflow-y-auto flex flex-col divide-y divide-border rounded-md border">
              {allEntities
                .filter((e) => e.name.toLowerCase().includes(assignEntitySearch.toLowerCase()))
                .slice(0, 30)
                .map((entity) => (
                  <button
                    key={entity.id}
                    disabled={!!assigningCampaignId}
                    onClick={() => assignDialogCampaign && handleQuickAssign(assignDialogCampaign, entity.id)}
                    className="flex items-center justify-between px-3 py-2 text-sm hover:bg-muted disabled:opacity-50 text-left transition-colors"
                  >
                    <span className="font-medium">{entity.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {entity.party && (
                        <span className="text-xs text-muted-foreground">{entity.party}</span>
                      )}
                      {entity.state && (
                        <span className="text-xs text-muted-foreground">{entity.state}</span>
                      )}
                      {assigningCampaignId === assignDialogCampaign?.id && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                    </div>
                  </button>
                ))}
              {allEntities.filter((e) =>
                e.name.toLowerCase().includes(assignEntitySearch.toLowerCase())
              ).length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No entities found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default CompetitiveInsights
