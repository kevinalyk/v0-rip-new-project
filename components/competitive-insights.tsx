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
} from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
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
  const [senderSearchTerm, setSenderSearchTerm] = useState("") // Declared senderSearchTerm
  const senderSearchInputRef = useRef<HTMLInputElement>(null) // Declare senderSearchInputRef
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined })
  const [isFromCalendarOpen, setIsFromCalendarOpen] = useState(false)
  const [isToCalendarOpen, setIsToCalendarOpen] = useState(false)
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
      selectedMessageType !== "all" ||
      selectedDonationPlatform !== "all" ||
      showThirdParty ||
      showHouseFileOnly ||
      dateRange.from !== undefined ||
      dateRange.to !== undefined
    )
  }, [
    activeSearchQuery,
    selectedSender,
    selectedPartyFilter,
    selectedMessageType,
    showThirdParty,
    showHouseFileOnly,
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
        // "third party" dropdown value matches Independent, Third Party, Ind, etc.
        if (selectedPartyFilter === "third party") {
          return entityParty.includes("independent") || entityParty.includes("third") || entityParty === "ind" || entityParty === "i"
        }
        return entityParty.includes(selectedPartyFilter.toLowerCase())
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
    selectedMessageType,
    selectedDonationPlatform,
    showThirdParty,
    showHouseFileOnly,
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

    const matchesSearch =
      campaign.senderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.senderEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      campaign.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (campaign.emailContent && campaign.emailContent.toLowerCase().includes(searchTerm.toLowerCase()))

    const campaignName = campaign.entity?.name || campaign.senderName
    const matchesSender = selectedSender.length === 0 || selectedSender.includes(campaignName)

    const campaignParty = campaign.entity?.party?.toLowerCase()
    const matchesParty = selectedPartyFilter === "all" || campaignParty === selectedPartyFilter.toLowerCase() // Use renamed state

    const matchesMessageType = selectedMessageType === "all" || campaign.type === selectedMessageType

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
      if (selectedMessageType && selectedMessageType !== "all") params.append("messageType", selectedMessageType)
      if (selectedDonationPlatform && selectedDonationPlatform !== "all")
        params.append("donationPlatform", selectedDonationPlatform)
      if (showThirdParty) params.append("thirdParty", "true")
      if (showHouseFileOnly) params.append("houseFileOnly", "true")
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
    selectedMessageType,
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
    const senderEmail = campaign.senderEmail.toLowerCase()
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
                You're currently on the Free/Preview plan and can only see limited data. Upgrade to access full history,
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
                // User can dismiss the banner
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

              {/* Second row - Filters */}
              <div
                className={`flex flex-wrap gap-2 items-center ${subscriptionPlan === "free" && !hasAdminAccess ? "blur-sm pointer-events-none" : ""}`}
              >
                {/* Entity filter — temporarily hidden on reporting view, re-enable by removing the !isReportingView condition */}
                {!isReportingView && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full md:w-[200px] justify-between"
                      disabled={shouldShowPaywall || shouldShowPreview}
                    >
                      {selectedSender.length === 0
                        ? "Filter by entity"
                        : `${selectedSender.length} selected`}
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
                      {selectedSender.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full mb-2 text-xs"
                          onClick={() => setSelectedSender([])}
                        >
                          Clear all ({selectedSender.length})
                        </Button>
                      )}
                      {filteredSenders
                        .filter((sender) => sender && sender.trim() !== "")
                        .map((sender) => (
                          <div
                            key={sender}
                            className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                            onClick={() => {
                              setSelectedSender(prev =>
                                prev.includes(sender)
                                  ? prev.filter(s => s !== sender)
                                  : [...prev, sender]
                              )
                            }}
                          >
                            <Checkbox
                              checked={selectedSender.includes(sender)}
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
                )}

                <Select
                  value={selectedPartyFilter} // Use renamed state
                  onValueChange={setSelectedPartyFilter}
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
                  value={selectedStateFilter}
                  onValueChange={setSelectedStateFilter}
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

                <Select
                  value={showThirdParty ? "third_party" : showHouseFileOnly ? "house_file_only" : selectedMessageType}
                  onValueChange={(val) => {
                    if (val === "third_party") {
                      setShowThirdParty(true)
                      setShowHouseFileOnly(false)
                      setSelectedMessageType("all")
                    } else if (val === "house_file_only") {
                      setShowHouseFileOnly(true)
                      setShowThirdParty(false)
                      setSelectedMessageType("all")
                    } else {
                      setShowThirdParty(false)
                      setShowHouseFileOnly(false)
                      setSelectedMessageType(val)
                    }
                  }}
                  disabled={shouldShowPaywall || shouldShowPreview}
                >
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Messages</SelectItem>
                    <SelectItem value="email">Email Only</SelectItem>
                    <SelectItem value="sms">SMS Only</SelectItem>
                    <SelectItem value="third_party">Third Party</SelectItem>
                    <SelectItem value="house_file_only">House File Only</SelectItem>
                  </SelectContent>
                </Select>

                {/* Platform Filter - Conditional rendering */}
                {(currentUserClient === "winred" || currentUserClient === "RIP") && (
                  <Select value={selectedDonationPlatform} onValueChange={setSelectedDonationPlatform}>
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
                <div className={`flex items-center gap-2 ${isReportingView ? "hidden" : ""}`}>
                  <Popover open={isFromCalendarOpen} onOpenChange={setIsFromCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[140px] justify-start text-left font-normal bg-transparent"
                        disabled={shouldShowPaywall || shouldShowPreview}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange.from ? (
                          format(dateRange.from, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">From</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRange.from}
                        onSelect={(date) => {
                          setDateRange((prev) => ({ ...prev, from: date }))
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
                        {dateRange.to ? (
                          format(dateRange.to, "MMM d, yyyy")
                        ) : (
                          <span className="text-muted-foreground">To</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={dateRange.to}
                        onSelect={(date) => {
                          setDateRange((prev) => ({ ...prev, to: date }))
                          setIsToCalendarOpen(false)
                        }}
                        disabled={(date) => {
                          if (dateRange.from) return date < dateRange.from
                          return false
                        }}
                        numberOfMonths={1}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  {(dateRange.from || dateRange.to) && (
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={clearDateRange}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>

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
                  onClick={resetFilters}
                  className="w-full md:w-auto bg-transparent"
                  disabled={
                    shouldShowPaywall ||
                    shouldShowPreview ||
                    (!searchTerm && // Check searchTerm for visual state, not debouncedSearchTerm
                      !dateRange.from &&
                      !dateRange.to &&
                      selectedSender.length === 0 &&
                      selectedPartyFilter === "all" &&
                      selectedMessageType === "all" &&
                      !showThirdParty &&
                      !showHouseFileOnly &&
                      selectedDonationPlatform === "all")
                  }
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
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
                    <div className="overflow-x-auto">
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
            <DialogContent className="!max-w-[1400px] !w-[85vw] max-h-[85vh] overflow-y-auto">
              {selectedCampaign && (
                <>
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <DialogTitle className="text-xl">{selectedCampaign.subject}</DialogTitle>
                        <DialogDescription>
                          <div className="flex flex-col gap-1 mt-2">
                            <div className="flex items-center gap-2">
                              {selectedCampaign.type === "sms" ? (
                                <Smartphone className="h-4 w-4" />
                              ) : (
                                <Mail className="h-4 w-4" />
                              )}
                              <span className="font-medium">{selectedCampaign.senderName}</span>
                              <span className="text-muted-foreground">
                                (
                                {selectedCampaign.type === "sms"
                                  ? selectedCampaign.phoneNumber
                                  : selectedCampaign.senderEmail}
                                )
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="h-4 w-4" />
                              {new Date(selectedCampaign.dateReceived).toLocaleDateString()}
                            </div>
                          </div>
                        </DialogDescription>
                      </div>
                      <div className="flex items-center gap-3 mr-8">
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
                              srcDoc={prepareEmailHtml(selectedCampaign.emailContent, selectedCampaign.senderEmail)}
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
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <a
                                      href={displayUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-start gap-2 text-rip-red hover:underline break-all"
                                    >
                                      <ExternalLink className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                      <span>{displayUrl}</span>
                                    </a>
                                  </div>
                                  {type && (
                                    <Badge variant="secondary" className="capitalize flex-shrink-0">
                                      {type}
                                    </Badge>
                                  )}
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
              <DialogDescription>Anyone with this link can view this email for the next 7 days.</DialogDescription>
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
                This link will expire in 7 days. Views are tracked for analytics.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default CompetitiveInsights
